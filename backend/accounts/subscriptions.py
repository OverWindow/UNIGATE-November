from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import stripe
from django.db import transaction

from .credits import locked_account, reconcile_purchase_refunds, record
from .models import PLAN_AMOUNTS, CreditPurchase
from .plan_changes import plan_item, release_applied_schedule
from .plans import add_calendar_months


HOSTED_TRIAL = "topiq_trial_checkout"


class TrialCheckoutPending(Exception):
    pass


def invoice_subscription_details(invoice):
    return (invoice.get("parent") or {}).get("subscription_details") or invoice.get("subscription_details") or {}


def is_plan_invoice(invoice):
    reason = invoice.get("billing_reason")
    if reason in ("subscription_create", "subscription_cycle"):
        return True
    if reason != "subscription_update":
        return False
    # An interval switch can invoice at the phase boundary. Ignore unrelated updates.
    metadata = invoice_subscription_details(invoice).get("metadata") or {}
    change_at = metadata.get("topiq_change_at")
    return bool(change_at) and any(
        change_at == str(line["period"]["start"]) for line in invoice["lines"]["data"]
    )


def subscription_order(order_id, customer_id, subscription_id):
    # Serialize all lifecycle and invoice events for the same wallet.
    order = CreditPurchase.objects.get(pk=UUID(order_id), subscription_state__isnull=False)
    account = locked_account(order.user_id)
    order = CreditPurchase.objects.select_for_update().get(pk=order.pk)
    if (not subscription_id or not customer_id or customer_id != account.stripe_customer_id
            or order.stripe_subscription_id not in (None, subscription_id)
            or (not order.stripe_subscription_id and (order.status == "fulfilled" or order.stripe_payment_intent_id))):
        raise ValueError("Subscription does not match order")
    if not order.stripe_subscription_id:
        order.stripe_subscription_id = subscription_id
        order.save(update_fields=["stripe_subscription_id"])
    return order, account


def order_trial(order):
    trial = getattr(order, "free_trial", None)
    if trial and (trial.status not in ("reserved", "started") or trial.user_id != order.user_id or order.plan_months != 1):
        raise ValueError("Subscription has no matching trial consent")
    return trial


def cancel_refunded_subscription(api, subscription):
    # An attached schedule controls the subscription and its future renewals.
    schedule_id = subscription.get("schedule")
    target = schedule_id or subscription["id"]
    service = api.subscription_schedules if schedule_id else api.subscriptions
    canceled = service.cancel(target, {"invoice_now": False, "prorate": False}).to_dict()
    if canceled["id"] != target or canceled["status"] != "canceled":
        raise ValueError("Stripe cancellation did not complete")


def matching_checkout(sessions, order, customer_id):
    rows = sessions.list({"customer": customer_id, "created": {
        "gte": int(order.created_at.timestamp()) - 60,
        "lte": int((order.created_at + timedelta(days=1)).timestamp()),
    }})
    for session in rows.auto_paging_iter():
        if (session.to_dict().get("metadata") or {}).get("credit_purchase_id") == str(order.pk):
            return session
    return None


def live_order_subscription(api, order, customer_id, subscription_id, *, expand=None):
    if not customer_id or not subscription_id or order.stripe_subscription_id not in (None, subscription_id):
        raise ValueError("Subscription does not match order")
    subscription = (api.subscriptions.retrieve(subscription_id, {"expand": expand}) if expand
                    else api.subscriptions.retrieve(subscription_id)).to_dict()
    if (subscription["id"] != subscription_id or subscription["customer"] != customer_id
            or (subscription.get("metadata") or {}).get("credit_purchase_id") != str(order.pk)):
        raise ValueError("Retrieved subscription does not match order")
    return subscription


def cancel_order_subscription(api, order, customer_id, subscription_id):
    subscription = live_order_subscription(api, order, customer_id, subscription_id)
    if subscription["status"] not in ("canceled", "incomplete_expired"):
        cancel_refunded_subscription(api, subscription)
    if not order.stripe_subscription_id:
        order.stripe_subscription_id = subscription_id
        order.save(update_fields=["stripe_subscription_id"])


@transaction.atomic
def close_revoked_checkout(api, order):
    customer_id = locked_account(order.user_id).stripe_customer_id
    order = CreditPurchase.objects.select_for_update().get(pk=order.pk)
    sessions = api.checkout.sessions
    if order.stripe_session_id:
        session = sessions.retrieve(order.stripe_session_id)
    elif customer_id:
        session = matching_checkout(sessions, order, customer_id)
    else:
        return
    if session is None:
        return
    session_id = session.id

    def checked(result):
        data = result.to_dict()
        metadata = data.get("metadata") or {}
        expected_mode = "setup" if getattr(order, "free_trial", None) and metadata.get(HOSTED_TRIAL) != "1" else "subscription"
        if (not customer_id or not session_id or data["id"] != session_id
                or order.stripe_session_id not in (None, session_id) or data["customer"] != customer_id
                or data["mode"] != expected_mode or metadata.get("credit_purchase_id") != str(order.pk)):
            raise ValueError("Checkout does not match revoked order")
        return data

    data = checked(session)
    if data["status"] == "open":
        try:
            data = checked(sessions.expire(session_id))
        except stripe.InvalidRequestError:
            # Completion or automatic expiration may win while Stripe handles our request.
            data = checked(sessions.retrieve(session_id))
            if data["status"] == "open":
                raise
    if data["status"] not in ("complete", "expired"):
        raise ValueError("Checkout did not close")
    if not order.stripe_session_id:
        order.stripe_session_id = session_id
        order.save(update_fields=["stripe_session_id"])
    if data["mode"] == "subscription" and data["status"] == "complete":
        cancel_order_subscription(api, order, customer_id, data["subscription"])


@transaction.atomic
def apply_paid_invoice(invoice, *, get_api=None):
    details = invoice_subscription_details(invoice)
    metadata = details.get("metadata") or {}
    order_id = metadata.get("credit_purchase_id")
    reason = invoice.get("billing_reason")
    if not order_id or not is_plan_invoice(invoice):
        return
    subscription_id = details.get("subscription") or invoice.get("subscription")
    order, account = subscription_order(order_id, invoice["customer"], subscription_id)
    hosted_trial = metadata.get(HOSTED_TRIAL) == "1"
    if hosted_trial and getattr(order, "free_trial", None) and order.free_trial.status != "started":
        if order.free_trial.status in ("closed", "rejected") or (reason == "subscription_create" and invoice["amount_paid"] == 0):
            return
        raise TrialCheckoutPending
    trial = order_trial(order)
    if CreditPurchase.objects.filter(stripe_invoice_id=invoice["id"]).exists():
        return
    lines = invoice["lines"]
    if lines.get("has_more") or len(lines["data"]) != 1:
        raise ValueError("Expected one plan charge")
    line = lines["data"][0]
    price_id = ((line.get("pricing") or {}).get("price_details") or {}).get("price") or (line.get("price") or {}).get("id")
    item = (line.get("parent") or {}).get("subscription_item_details") or line
    months, expected_price = order.plan_months, order.stripe_price_id
    amount = PLAN_AMOUNTS[months] if order.stripe_invoice_id else order.amount
    if reason != "subscription_create" and metadata.get("topiq_change_at"):
        # Finalized invoices snapshot the terms set on the booked phase, including retired prices.
        months = int(metadata["topiq_plan_months"])
        expected_price = metadata["topiq_plan_price"]
        if (months not in PLAN_AMOUNTS or months <= order.plan_months or not expected_price
                or line["period"]["start"] < int(metadata["topiq_change_at"])):
            raise ValueError("Invalid scheduled plan terms")
        amount = PLAN_AMOUNTS[months]
    free_invoice = trial is not None and reason == "subscription_create" and invoice["amount_paid"] == 0
    if free_invoice:
        amount = 0
    discount = sum(item["amount"] for item in (invoice.get("total_discount_amounts") or [])) if trial is None or hosted_trial else 0
    paid_amount = invoice["amount_paid"]
    if (invoice["status"] != "paid" or invoice["currency"] != order.currency or not 0 <= discount <= amount
            or paid_amount != amount - discount
            or line["amount"] != amount or price_id != expected_price or line["quantity"] != 1
            or item.get("proration") or item.get("subscription") != subscription_id):
        raise ValueError("Unexpected subscription charge")
    if not free_invoice:
        start, end = (datetime.fromtimestamp(line["period"][key], UTC) for key in ("start", "end"))
        if end <= start or (trial and start < trial.agreed_trial_ends_at):
            raise ValueError("Invalid subscription period")
        first_payment = start == trial.agreed_trial_ends_at if trial else reason == "subscription_create"
        if trial and not order.stripe_invoice_id:
            # A later monthly cycle can arrive before the first paid cycle.
            anchor = trial.agreed_trial_ends_at
            interval = 12 * (start.year - anchor.year) + start.month - anchor.month
            if (interval < 0 or add_calendar_months(anchor, interval) != start
                    or (first_payment and (months != 1 or amount != order.amount))):
                raise ValueError("Charge does not match the trial's billing cycle")
    if order.subscription_state == "revoked":
        if get_api is None:
            raise ValueError("Revoked invoice requires Stripe client")
        cancel_order_subscription(get_api(), order, account.stripe_customer_id, subscription_id)
    if free_invoice:
        return  # Trial access comes from the confirmed subscription, never the zero-value invoice.
    if first_payment:
        if order.stripe_invoice_id:
            raise ValueError("Order already has an initial invoice")
        receipt = order
        if order.subscription_state == "revoked":
            receipt.credited_months = 0
        else:
            account.balance += order.credits
            receipt.transaction = record(account, "plan_bonus", order.credits)
            receipt.credited_months = 1
    else:
        # A renewal can arrive early. Its first month is due when the new period starts.
        receipt = CreditPurchase(user_id=order.user_id, attempt_id=uuid4(), plan_months=months,
                                 stripe_price_id=price_id, currency=order.currency,
                                 credits=order.credits, credited_months=0)
    if order.subscription_state == "checkout" or (first_payment and order.subscription_state in ("trialing", "past_due")):
        order.subscription_state = "active"
        order.save(update_fields=["subscription_state"])
    receipt.stripe_invoice_id = invoice["id"]
    receipt.amount = paid_amount
    receipt.plan_starts_at, receipt.plan_ends_at = start, end
    if order.subscription_state == "revoked":
        receipt.subscription_state = "revoked"
    receipt.status = "fulfilled"
    receipt.save()
    reconcile_purchase_refunds(account, receipt)


@transaction.atomic
def sync_subscription(event_type, subscription, client_factory):
    metadata = subscription.get("metadata") or {}
    order_id = metadata.get("credit_purchase_id")
    if not order_id:
        return
    order, account = subscription_order(order_id, subscription["customer"], subscription["id"])
    if (metadata.get(HOSTED_TRIAL) == "1" and getattr(order, "free_trial", None)
            and order.free_trial.status != "started" and event_type != "trial.confirmed"):
        return  # Checkout completion verifies the card before granting access.
    trial = order_trial(order)
    terminal_order = order.subscription_state in ("ended", "revoked")
    if not trial and order.subscription_state != "revoked" and (event_type == "customer.subscription.created" or terminal_order):
        return
    if event_type == "trial.confirmed" and trial and trial.status == "started" and not terminal_order:
        return  # A newer cancellation or invoice may have arrived before our create response.
    if event_type in ("customer.subscription.updated", "customer.subscription.created") or (
            terminal_order and (event_type == "trial.confirmed" or subscription["status"] not in ("canceled", "incomplete_expired"))):
        # Stripe retries events out of order, including changes within the same second.
        api = client_factory().v1
        subscription = live_order_subscription(api, order, account.stripe_customer_id, subscription["id"])
        if not terminal_order and subscription["status"] == "active" and subscription.get("schedule"):
            release_applied_schedule(subscription, api)
    if trial and trial.status == "reserved":
        start = datetime.fromtimestamp(subscription["trial_start"], UTC)
        end = datetime.fromtimestamp(subscription["trial_end"], UTC)
        if (end != trial.agreed_trial_ends_at or end <= start
                or plan_item(subscription)["price"]["id"] != order.stripe_price_id):
            raise ValueError("Trial does not match the agreed subscription")
        trial.started_at, trial.ends_at, trial.status = start, end, "started"
        trial.save(update_fields=["started_at", "ends_at", "status"])
    if terminal_order:
        if subscription["status"] not in ("canceled", "incomplete_expired"):
            cancel_refunded_subscription(client_factory().v1, subscription)
        return
    status = subscription["status"]
    if status in ("canceled", "incomplete_expired"):
        order.subscription_state = "ended"
        if order.status == "pending":
            order.status = "expired"
    elif status in ("past_due", "unpaid", "paused"):
        order.subscription_state = "past_due"
    elif subscription.get("cancel_at_period_end") or subscription.get("cancel_at"):
        order.subscription_state = "ending"
    elif status == "trialing" and trial and not order.stripe_invoice_id:
        order.subscription_state = "trialing"
    elif status in ("active", "trialing"):
        order.subscription_state = "active"
    order.save(update_fields=["subscription_state", "status"])
