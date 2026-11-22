from uuid import UUID, uuid4

import stripe
from django.db import connection, transaction
from django.db.migrations.recorder import MigrationRecorder
from django.db.models import Sum

from .credits import collect_pending_refunds, locked_account, reconcile_purchase_refunds
from .models import CreditPurchase, CreditPurchaseRefund
from .subscriptions import apply_paid_invoice


class RefundOrderNotReady(Exception):
    """Stripe should retry after the originating checkout is recorded."""


def refunds_enabled_at():
    applied = MigrationRecorder(connection).migration_qs.get(app="accounts", name="0012_credit_refunds").applied
    return int(applied.timestamp())


def resolve_refund_purchase(api, intent_id):
    purchase = CreditPurchase.objects.filter(stripe_payment_intent_id=intent_id).first()
    if purchase:
        return purchase

    # Older top-ups only stored the Checkout Session ID.
    sessions = api.checkout.sessions.list({"payment_intent": intent_id, "limit": 1})
    for session in sessions.data:
        data = session.to_dict()
        order_id = (data.get("metadata") or {}).get("credit_purchase_id")
        if not order_id or data["mode"] != "payment":
            continue
        purchase = CreditPurchase.objects.filter(pk=UUID(order_id)).first()
        if not purchase or not purchase.stripe_session_id:
            raise RefundOrderNotReady
        if (purchase.stripe_session_id != data["id"] or data["payment_intent"] != intent_id
                or data["amount_total"] != purchase.amount or data["currency"] != purchase.currency):
            raise ValueError("Checkout does not match refund")
        return purchase

    payments = api.invoice_payments.list({
        "payment": {"type": "payment_intent", "payment_intent": intent_id},
        "expand": ["data.invoice"], "limit": 2,
    })
    for payment in payments.data:
        invoice = payment.to_dict()["invoice"]
        details = (invoice.get("parent") or {}).get("subscription_details") or invoice.get("subscription_details") or {}
        existing = CreditPurchase.objects.filter(stripe_invoice_id=invoice["id"]).first()
        if not existing and not (details.get("metadata") or {}).get("credit_purchase_id"):
            continue
        if len(payments.data) != 1 or payments.has_more:
            raise ValueError("Ambiguous invoice payment")
        if invoice["status"] != "paid":
            raise RefundOrderNotReady
        if existing:
            return existing
        if invoice.get("billing_reason") not in {"subscription_create", "subscription_cycle"}:
            continue
        # A renewal refund can arrive before the invoice.paid event.
        apply_paid_invoice(invoice)
        return CreditPurchase.objects.get(stripe_invoice_id=invoice["id"])
    return None


@transaction.atomic
def apply_refund(notification, api):
    # Existing orders qualify for new refunds. Older refunds may already have been settled manually.
    if notification["created"] < refunds_enabled_at():
        return
    intent_id = notification.get("payment_intent")
    if not intent_id and notification.get("charge"):
        intent_id = api.charges.retrieve(notification["charge"]).to_dict().get("payment_intent")
    if not intent_id:
        return
    purchase = resolve_refund_purchase(api, intent_id)
    if purchase is None:
        return  # Other products can share the Stripe account.
    account = locked_account(purchase.user_id)
    purchase = CreditPurchase.objects.select_for_update().get(pk=purchase.pk)
    # Fetch under the wallet lock so an older, concurrent delivery cannot overwrite a failure.
    refund = api.refunds.retrieve(notification["id"]).to_dict()
    same_payment = refund.get("payment_intent") == intent_id
    if not refund.get("payment_intent"):
        same_payment = bool(notification.get("charge")) and refund.get("charge") == notification["charge"]
    if (refund["id"] != notification["id"] or not same_payment or refund["currency"] != purchase.currency
            or not 0 < refund["amount"] <= purchase.amount):
        raise ValueError("Refund does not match purchase")
    if not purchase.stripe_invoice_id:
        if purchase.stripe_payment_intent_id not in (None, intent_id):
            raise ValueError("Payment intent does not match checkout")
        if not purchase.stripe_payment_intent_id:
            purchase.stripe_payment_intent_id = intent_id
            purchase.save(update_fields=["stripe_payment_intent_id"])
    save_refund(account, purchase, refund)


def release_hold(account, purchase):
    account.reserved -= purchase.credits
    account.save(update_fields=["reserved", "updated_at"])
    purchase.refund_attempt_id = None
    purchase.save(update_fields=["refund_attempt_id"])


def billing_review(account, purchase):
    if purchase.refund_attempt_id:
        release_hold(account, purchase)
        collect_pending_refunds(account)
    purchase.refund_review_required = True
    purchase.save(update_fields=["refund_review_required"])
    return "contact"


def save_refund(account, purchase, refund):
    row, created = CreditPurchaseRefund.objects.get_or_create(
        stripe_refund_id=refund["id"], defaults={
            "purchase": purchase, "amount": refund["amount"], "currency": refund["currency"], "status": refund["status"],
        },
    )
    if (row.purchase_id, row.amount, row.currency) != (purchase.pk, refund["amount"], refund["currency"]):
        raise ValueError("Refund identity changed")
    own_attempt = (refund.get("metadata") or {}).get("refund_attempt") == str(purchase.refund_attempt_id)
    from_hold = bool(purchase.refund_attempt_id and refund["status"] == "succeeded")
    if from_hold or (purchase.refund_attempt_id and own_attempt and refund["status"] in {"failed", "canceled"}):
        release_hold(account, purchase)
    elif not created and row.status == refund["status"]:
        return
    if not created:
        row.status = refund["status"]
        row.save(update_fields=["status"])
    reconcile_purchase_refunds(account, purchase, from_hold=from_hold)


def reserved_orders(account):
    if not account.reserved:
        return set()
    orders = CreditPurchase.objects.filter(user_id=account.pk)
    refund_holds = orders.filter(refund_attempt_id__isnull=False).aggregate(total=Sum("credits", default=0))
    reserved = account.reserved - refund_holds["total"]
    affected = set()
    if reserved > 0:
        lots = orders.filter(remaining_credits__gt=0, refund_attempt_id__isnull=True).order_by("transaction__created_at", "pk")
        for order_id, remaining in lots.values_list("pk", "remaining_credits"):
            affected.add(order_id)
            reserved -= remaining
            if reserved <= 0:
                break
    return affected


def refund_state(order, account, reserved):
    refunds = list(order.refunds.all())
    succeeded = sum(r.amount for r in refunds if r.status == "succeeded")
    if succeeded == order.amount:
        return "refunded"
    if any(r.status not in {"succeeded", "failed", "canceled"} for r in refunds):
        return "processing"
    if order.refund_attempt_id:
        return "confirming"
    if succeeded or order.refund_review_required or order.remaining_credits != order.credits:
        return "contact"
    if order.pk in reserved or account.balance - account.reserved < order.credits:
        return "held"
    return "eligible"


def topups(user_id):
    return CreditPurchase.objects.filter(user_id=user_id, status="fulfilled", plan_months__isnull=True)


@transaction.atomic
def reserve_refund(user_id, purchase_id, api):
    account = locked_account(user_id)
    order = topups(user_id).select_for_update().get(pk=purchase_id)
    state = refund_state(order, account, reserved_orders(account))
    if state != "eligible":
        return state, order.refund_attempt_id
    if not order.stripe_payment_intent_id:
        try:
            session = api.checkout.sessions.retrieve(order.stripe_session_id).to_dict()
        except stripe.InvalidRequestError as exc:
            if exc.http_status != 404:
                raise
            return billing_review(account, order), None
        if (session["id"] != order.stripe_session_id or session.get("mode") != "payment"
                or session.get("payment_status") != "paid" or not session.get("payment_intent")
                or session.get("amount_total") != order.amount or session.get("currency") != order.currency
                or (session.get("metadata") or {}).get("credit_purchase_id") != str(order.pk)):
            return billing_review(account, order), None
        order.stripe_payment_intent_id = session["payment_intent"]
    order.refund_attempt_id = uuid4()
    order.save(update_fields=["refund_attempt_id", "stripe_payment_intent_id"])
    account.reserved += order.credits
    account.save(update_fields=["reserved", "updated_at"])
    return "confirming", order.refund_attempt_id


def recover_refund(account, order, attempt, api):
    intent = order.stripe_payment_intent_id
    # Recover lost responses, including retries after Stripe's idempotency window.
    recovered = False
    for item in api.refunds.list({"payment_intent": intent}).auto_paging_iter():
        existing = item.to_dict()
        matches = (existing.get("metadata") or {}).get("refund_attempt") == str(attempt)
        if not matches and existing["status"] in {"failed", "canceled"}:
            continue
        if (existing["payment_intent"] != intent or existing["currency"] != order.currency
                or not 0 < existing["amount"] <= order.amount or (matches and existing["amount"] != order.amount)):
            raise ValueError("Refund does not match purchase")
        if existing["created"] < refunds_enabled_at():
            return billing_review(account, order)
        if order.refund_attempt_id and not matches and existing["status"] != "succeeded":
            release_hold(account, order)
            collect_pending_refunds(account)
        save_refund(account, order, existing)
        order.refresh_from_db()
        recovered = True
    if recovered:
        return refund_state(order, account, reserved_orders(account))


@transaction.atomic
def submit_refund(user_id, purchase_id, attempt, api):
    # The hold was committed before any request that can move money.
    account = locked_account(user_id)
    order = topups(user_id).select_for_update().get(pk=purchase_id)
    if order.refund_attempt_id != attempt:
        return refund_state(order, account, reserved_orders(account))
    intent = order.stripe_payment_intent_id
    try:
        recovered = recover_refund(account, order, attempt, api)
        if recovered:
            return recovered
        refund = api.refunds.create({
            "payment_intent": intent, "amount": order.amount, "reason": "requested_by_customer",
            "metadata": {"refund_attempt": str(attempt)},
        }, options={"idempotency_key": str(attempt)}).to_dict()
    except stripe.InvalidRequestError as exc:
        if exc.http_status not in (400, 404):
            raise
        return billing_review(account, order)
    if (refund["payment_intent"] != intent or refund["amount"] != order.amount or refund["currency"] != order.currency
            or (refund.get("metadata") or {}).get("refund_attempt") != str(attempt)):
        raise ValueError("Refund does not match request")
    save_refund(account, order, refund)
    order.refresh_from_db()
    return refund_state(order, account, reserved_orders(account))
