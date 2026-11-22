from datetime import UTC, datetime
from uuid import UUID, uuid4

from django.db import transaction

from .credits import locked_account, record
from .models import CreditPurchase


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


@transaction.atomic
def apply_paid_invoice(invoice):
    details = (invoice.get("parent") or {}).get("subscription_details") or invoice.get("subscription_details") or {}
    order_id = (details.get("metadata") or {}).get("credit_purchase_id")
    reason = invoice.get("billing_reason")
    if not order_id or reason not in ("subscription_create", "subscription_cycle"):
        return
    subscription_id = details.get("subscription") or invoice.get("subscription")
    order, account = subscription_order(order_id, invoice["customer"], subscription_id)
    if CreditPurchase.objects.filter(stripe_invoice_id=invoice["id"]).exists():
        return
    lines = invoice["lines"]
    if lines.get("has_more") or len(lines["data"]) != 1:
        raise ValueError("Expected one plan charge")
    line = lines["data"][0]
    price_id = ((line.get("pricing") or {}).get("price_details") or {}).get("price") or (line.get("price") or {}).get("id")
    item = (line.get("parent") or {}).get("subscription_item_details") or line
    if (invoice["status"] != "paid" or invoice["currency"] != order.currency or invoice["amount_paid"] != order.amount
            or line["amount"] != order.amount or price_id != order.stripe_price_id or line["quantity"] != 1
            or item.get("proration") or item.get("subscription") != subscription_id):
        raise ValueError("Unexpected subscription charge")
    start, end = (datetime.fromtimestamp(line["period"][key], UTC) for key in ("start", "end"))
    if end <= start:
        raise ValueError("Invalid subscription period")
    if reason == "subscription_create":
        if order.stripe_invoice_id:
            raise ValueError("Order already has an initial invoice")
        receipt = order
        account.balance += order.credits
        receipt.transaction = record(account, "plan_bonus", order.credits)
        receipt.credited_months = 1
    else:
        # A renewal can arrive early. Its first month is due when the new period starts.
        receipt = CreditPurchase(user_id=order.user_id, attempt_id=uuid4(), plan_months=order.plan_months,
                                 stripe_price_id=order.stripe_price_id, currency=order.currency,
                                 amount=order.amount, credits=order.credits, credited_months=0)
    if order.subscription_state == "checkout":
        order.subscription_state = "active"
        order.save(update_fields=["subscription_state"])
    receipt.stripe_invoice_id = invoice["id"]
    receipt.plan_starts_at, receipt.plan_ends_at = start, end
    receipt.status = "fulfilled"
    receipt.save()


@transaction.atomic
def sync_subscription(event_type, subscription, client_factory):
    order_id = (subscription.get("metadata") or {}).get("credit_purchase_id")
    if not order_id:
        return
    order, _ = subscription_order(order_id, subscription["customer"], subscription["id"])
    if order.subscription_state == "ended":
        return
    if event_type == "customer.subscription.updated":
        # Stripe retries events out of order, including changes within the same second.
        subscription = client_factory().v1.subscriptions.retrieve(subscription["id"]).to_dict()
    status = subscription["status"]
    if status in ("canceled", "incomplete_expired"):
        order.subscription_state = "ended"
        if order.status == "pending":
            order.status = "expired"
    elif status in ("past_due", "unpaid", "paused"):
        order.subscription_state = "past_due"
    elif subscription.get("cancel_at_period_end") or subscription.get("cancel_at"):
        order.subscription_state = "ending"
    elif status in ("active", "trialing"):
        order.subscription_state = "active"
    order.save(update_fields=["subscription_state", "status"])
