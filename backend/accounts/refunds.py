from uuid import UUID, uuid4

import stripe
from django.db import connection, transaction
from django.db.migrations.recorder import MigrationRecorder
from django.db.models import Sum, Q
from django.utils import timezone

from .analytics import track_refund
from .credits import collect_pending_refunds, locked_account, reconcile_purchase_refunds
from .models import CreditPurchase, CreditPurchaseRefund
from .subscriptions import (
    apply_paid_invoice, cancel_refunded_subscription, close_revoked_checkout, invoice_subscription_details, is_plan_invoice,
)


class RefundOrderNotReady(Exception):
    """Stripe should retry after the originating checkout is recorded."""


def refunds_enabled_at():
    applied = MigrationRecorder(connection).migration_qs.get(app="accounts", name="0012_credit_refunds").applied
    return int(applied.timestamp())


def matches_checkout_amount(purchase, session):
    total = session["amount_total"]
    if total == purchase.amount:
        return True
    if (purchase.plan_months is not None or purchase.status == "fulfilled" or type(total) is not int
            or not 0 <= total < purchase.amount):
        return False
    discount = (session.get("total_details") or {}).get("amount_discount")
    return session.get("amount_subtotal") == purchase.amount and discount == purchase.amount - total


def resolve_refund_purchase(api, intent_id):
    purchase = CreditPurchase.objects.filter(stripe_payment_intent_id=intent_id).first()
    if purchase and not purchase.stripe_invoice_id:
        return purchase, None

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
                or not matches_checkout_amount(purchase, data) or data["currency"] != purchase.currency):
            raise ValueError("Checkout does not match refund")
        return purchase, None

    payments = api.invoice_payments.list({
        "payment": {"type": "payment_intent", "payment_intent": intent_id},
        "expand": ["data.invoice"], "limit": 2,
    })
    for payment in payments.data:
        invoice = payment.to_dict()["invoice"]
        details = invoice_subscription_details(invoice)
        existing = CreditPurchase.objects.filter(stripe_invoice_id=invoice["id"]).first()
        if not existing and not (details.get("metadata") or {}).get("credit_purchase_id"):
            continue
        if len(payments.data) != 1 or payments.has_more:
            raise ValueError("Ambiguous invoice payment")
        if invoice["status"] != "paid":
            raise RefundOrderNotReady
        if not is_plan_invoice(invoice):
            continue
        if not existing:
            # A renewal refund can arrive before the invoice.paid event.
            apply_paid_invoice(invoice, get_api=lambda: api)
            existing = CreditPurchase.objects.get(stripe_invoice_id=invoice["id"])
        subscription = details.get("subscription") or invoice.get("subscription")
        root_id = (details.get("metadata") or {}).get("credit_purchase_id")
        if (not subscription or not root_id or existing.stripe_subscription_id not in (None, subscription)
                or invoice["amount_paid"] != existing.amount
                or invoice["currency"] != existing.currency
                or not CreditPurchase.objects.filter(pk=UUID(root_id), user_id=existing.user_id,
                    stripe_subscription_id=subscription, user__creditaccount__stripe_customer_id=invoice["customer"]).exists()):
            raise ValueError("Refund invoice does not match the original subscription")
        return existing, subscription
    return None, None


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
    purchase, subscription = resolve_refund_purchase(api, intent_id)
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
    save_refund(account, purchase, refund, api=api, subscription=subscription)


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


def refunded_plan_periods(api, account, order, subscription, *, historical_refund_at=None):
    orders = CreditPurchase.objects.filter(user_id=account.pk, plan_months__isnull=False)
    if not subscription:
        if order.stripe_invoice_id or order.stripe_subscription_id:
            raise ValueError("환불한 청구서와 TOPIQ 원구독을 연결할 수 없습니다.")
        return orders.filter(pk=order.pk), None

    root = orders.filter(stripe_subscription_id=subscription).first()
    remote = api.subscriptions.retrieve(subscription).to_dict()
    if (not root or remote["id"] != subscription or not account.stripe_customer_id
            or remote["customer"] != account.stripe_customer_id
            or (remote.get("metadata") or {}).get("credit_purchase_id", str(root.pk)) != str(root.pk)):
        raise ValueError("환불한 청구서와 TOPIQ 원구독을 연결할 수 없습니다.")
    matched = Q(pk__in=[root.pk, order.pk])
    # Renewal receipts store their invoice ID. Resolve other outstanding periods only within this subscription.
    renewals = orders.filter(stripe_invoice_id__isnull=False, stripe_subscription_id__isnull=True,
                             plan_ends_at__gt=timezone.now()).exclude(matched)
    if historical_refund_at is not None or renewals.exists():
        invoice_ids = set()
        for item in api.invoices.list({"subscription": subscription, "status": "paid", "limit": 100}).auto_paging_iter():
            invoice = item.to_dict()
            if not is_plan_invoice(invoice):
                continue
            details = invoice_subscription_details(invoice)
            if (invoice["customer"] != account.stripe_customer_id
                    or (details.get("subscription") or invoice.get("subscription")) != subscription):
                raise ValueError("원구독의 청구서 정보를 확인할 수 없습니다.")
            invoice_ids.add(invoice["id"])
            if historical_refund_at is not None and invoice["id"] != order.stripe_invoice_id and invoice["amount_paid"] > 0:
                paid_at = (invoice.get("status_transitions") or {}).get("paid_at")
                if not paid_at or paid_at >= historical_refund_at:
                    raise ValueError("같은 구독에 결제 시각이 불분명하거나 환불 이후 결제된 회차가 있습니다.")
        if order.stripe_invoice_id not in invoice_ids:
            raise ValueError("원구독의 결제 목록에 환불 대상 청구서가 없습니다.")
        matched |= Q(stripe_invoice_id__in=invoice_ids, plan_ends_at__gt=timezone.now())
    return orders.filter(matched), remote if remote["status"] not in {"canceled", "incomplete_expired"} else None


def revoke_refunded_plan(account, purchase, api, subscription=None):
    if not purchase.plan_months or purchase.subscription_state == "revoked":
        return
    affected, cancel = refunded_plan_periods(api, account, purchase, subscription or purchase.stripe_subscription_id)
    if purchase.subscription_state == "checkout" and not purchase.stripe_subscription_id:
        close_revoked_checkout(api, purchase)
    affected.filter(status="pending").update(status="expired")
    affected.update(subscription_state="revoked")
    purchase.subscription_state = "revoked"
    if cancel:
        cancel_refunded_subscription(api, cancel)


def save_refund(account, purchase, refund, *, api=None, subscription=None):
    previous_refunded = purchase.refunds.filter(status="succeeded").aggregate(total=Sum("amount", default=0))["total"]
    row, created = CreditPurchaseRefund.objects.get_or_create(
        stripe_refund_id=refund["id"], defaults={
            "purchase": purchase, "amount": refund["amount"], "currency": refund["currency"], "status": refund["status"],
        },
    )
    if (row.purchase_id, row.amount, row.currency) != (purchase.pk, refund["amount"], refund["currency"]):
        raise ValueError("Refund identity changed")
    newly_succeeded = refund["status"] == "succeeded" and (created or row.status != "succeeded")
    own_attempt = (refund.get("metadata") or {}).get("refund_attempt") == str(purchase.refund_attempt_id)
    from_hold = bool(purchase.refund_attempt_id and refund["status"] == "succeeded")
    if from_hold or (purchase.refund_attempt_id and own_attempt and refund["status"] in {"failed", "canceled"}):
        release_hold(account, purchase)
    elif not created and row.status == refund["status"]:
        return
    if not created:
        row.status = refund["status"]
        row.save(update_fields=["status"])
    if refund["status"] == "succeeded" and purchase.plan_months:
        if api is None:
            raise ValueError("Plan refund requires Stripe client")
        revoke_refunded_plan(account, purchase, api, subscription)
    reconcile_purchase_refunds(account, purchase, previous_refunded=previous_refunded)
    if newly_succeeded and purchase.status == "fulfilled":
        track_refund(purchase, row)


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
    if order.amount == 0:
        return "no_payment"
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
