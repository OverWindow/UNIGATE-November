from datetime import UTC, datetime
from uuid import UUID, uuid4

from django.db import transaction

from .credits import locked_account, reconcile_purchase_refunds, record
from .models import PLAN_AMOUNTS, CreditPurchase
from .plan_changes import plan_item, release_applied_schedule
from .plans import add_calendar_months


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
            or order.stripe_subscription_id not in (None, subscription_id)):
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


@transaction.atomic
def apply_paid_invoice(invoice):
    details = invoice_subscription_details(invoice)
    metadata = details.get("metadata") or {}
    order_id = metadata.get("credit_purchase_id")
    reason = invoice.get("billing_reason")
    if not order_id or not is_plan_invoice(invoice):
        return
    subscription_id = details.get("subscription") or invoice.get("subscription")
    order, account = subscription_order(order_id, invoice["customer"], subscription_id)
    trial = order_trial(order)
    if CreditPurchase.objects.filter(stripe_invoice_id=invoice["id"]).exists():
        return
    lines = invoice["lines"]
    if lines.get("has_more") or len(lines["data"]) != 1:
        raise ValueError("Expected one plan charge")
    line = lines["data"][0]
    price_id = ((line.get("pricing") or {}).get("price_details") or {}).get("price") or (line.get("price") or {}).get("id")
    item = (line.get("parent") or {}).get("subscription_item_details") or line
    months, expected_price, amount = order.plan_months, order.stripe_price_id, order.amount
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
    if (invoice["status"] != "paid" or invoice["currency"] != order.currency or invoice["amount_paid"] != amount
            or line["amount"] != amount or price_id != expected_price or line["quantity"] != 1
            or item.get("proration") or item.get("subscription") != subscription_id):
        raise ValueError("Unexpected subscription charge")
    if free_invoice:
        return  # Trial access comes from the confirmed subscription, never the zero-value invoice.
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
    if first_payment:
        if order.stripe_invoice_id:
            raise ValueError("Order already has an initial invoice")
        receipt = order
        if trial and order.subscription_state == "revoked":
            receipt.credited_months = 0
        else:
            account.balance += order.credits
            receipt.transaction = record(account, "plan_bonus", order.credits)
            receipt.credited_months = 1
    else:
        # A renewal can arrive early. Its first month is due when the new period starts.
        receipt = CreditPurchase(user_id=order.user_id, attempt_id=uuid4(), plan_months=months,
                                 stripe_price_id=price_id, currency=order.currency,
                                 amount=amount, credits=order.credits, credited_months=0)
    if order.subscription_state == "checkout" or (first_payment and order.subscription_state in ("trialing", "past_due")):
        order.subscription_state = "active"
        order.save(update_fields=["subscription_state"])
    receipt.stripe_invoice_id = invoice["id"]
    receipt.plan_starts_at, receipt.plan_ends_at = start, end
    if order.subscription_state == "revoked":
        receipt.subscription_state = "revoked"
    receipt.status = "fulfilled"
    receipt.save()
    reconcile_purchase_refunds(account, receipt)


@transaction.atomic
def sync_subscription(event_type, subscription, client_factory):
    order_id = (subscription.get("metadata") or {}).get("credit_purchase_id")
    if not order_id:
        return
    order, account = subscription_order(order_id, subscription["customer"], subscription["id"])
    trial = order_trial(order)
    terminal_order = order.subscription_state in ("ended", "revoked")
    if not trial and (event_type == "customer.subscription.created" or terminal_order):
        return
    if event_type == "trial.confirmed" and trial and trial.status == "started" and not terminal_order:
        return  # A newer cancellation or invoice may have arrived before our create response.
    if event_type in ("customer.subscription.updated", "customer.subscription.created") or (
            terminal_order and event_type == "trial.confirmed"):
        # Stripe retries events out of order, including changes within the same second.
        api = client_factory().v1
        subscription = api.subscriptions.retrieve(subscription["id"]).to_dict()
        if (subscription["id"] != order.stripe_subscription_id or subscription["customer"] != account.stripe_customer_id
                or (subscription.get("metadata") or {}).get("credit_purchase_id") != str(order.pk)):
            raise ValueError("Retrieved subscription does not match order")
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
