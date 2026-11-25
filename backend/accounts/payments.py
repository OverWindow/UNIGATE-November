from datetime import UTC, datetime, timedelta
from decimal import Decimal, InvalidOperation
from uuid import UUID

import stripe
from django.conf import settings
from django.core.exceptions import RequestDataTooBig
from django.db import DatabaseError, transaction
from django.http import HttpResponse
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.debug import sensitive_variables
from django.views.decorators.http import require_GET, require_POST, require_http_methods

from writing.services import expire_for_user

from .credits import locked_account, reconcile_purchase_refunds, record
from .models import CREDIT_PURCHASE_QUANTITY, PLAN_AMOUNTS, PLAN_BONUS, CreditAccount, CreditPurchase
from .plan_changes import InvalidBillingState, PlanChangeConflict, can_schedule, next_change, plan_item, read_subscription, update_change
from .plans import assign_plan_period, current_plan, current_plan_end, open_subscription
from .refunds import RefundOrderNotReady, apply_refund, refund_state, reserve_refund, reserved_orders, submit_refund, topups
from .subscriptions import apply_paid_invoice, sync_subscription
from .views import api_response, read_payload


class PaymentsUnavailable(Exception):
    pass


def stripe_client(*, require_webhook=True):
    if not settings.STRIPE_SECRET_KEY or (require_webhook and not settings.STRIPE_WEBHOOK_SECRET):
        raise PaymentsUnavailable
    return stripe.StripeClient(
        settings.STRIPE_SECRET_KEY, http_client=stripe.RequestsClient(timeout=8), max_network_retries=0,
    )


def price_id_for(months):
    return settings.STRIPE_PLAN_PRICE_IDS.get(months) if months else settings.STRIPE_PRICE_ID


def configured_price(client, months=None):
    price_id = price_id_for(months)
    if not price_id:
        raise PaymentsUnavailable
    price = client.v1.prices.retrieve(price_id).to_dict()
    amount = price.get("unit_amount")
    if (price.get("id") != price_id or price.get("active") is not True
            or price.get("type") != ("recurring" if months else "one_time") or price.get("billing_scheme") != "per_unit"
            or price.get("currency") != "krw" or type(amount) is not int or amount <= 0
            or (months is not None and amount != PLAN_AMOUNTS[months])
            or price.get("custom_unit_amount") is not None or price.get("transform_quantity") is not None):
        raise PaymentsUnavailable
    if months:
        recurring = price.get("recurring") or {}
        if (recurring.get("interval") != "month" or recurring.get("interval_count") != months
                or recurring.get("usage_type") != "licensed" or recurring.get("trial_period_days")):
            raise PaymentsUnavailable
    # KRW is a whole-unit currency, including when Stripe supplies a decimal price.
    try:
        decimal_amount = price.get("unit_amount_decimal")
        if decimal_amount is not None and Decimal(str(decimal_amount)) != amount:
            raise PaymentsUnavailable
    except InvalidOperation:
        raise PaymentsUnavailable from None
    return {"priceId": price["id"], "amount": amount, "currency": price["currency"],
            "credits": PLAN_BONUS if months else CREDIT_PURCHASE_QUANTITY}


def stripe_customer_id_for(user_id):
    return CreditAccount.objects.filter(user_id=user_id).values_list("stripe_customer_id", flat=True).first()


def subscription_details(user_id):
    current_months, end = current_plan(user_id)
    order = open_subscription(user_id)
    subscription = None
    change = {"scheduledChange": None, "canChangePlan": False, "nextBillingAt": None, "planChangeUnavailable": False}
    if order and order.subscription_state != "checkout":
        subscription = {"state": order.subscription_state, "months": current_months or order.plan_months}
        if order.stripe_subscription_id:
            try:
                live = read_subscription(stripe_client().v1, order, stripe_customer_id_for(user_id))
                item = plan_item(live)
                subscription["months"] = item["price"]["recurring"]["interval_count"]
                change["nextBillingAt"] = datetime.fromtimestamp(item["current_period_end"], UTC)
                change["scheduledChange"] = next_change(live)
                change["canChangePlan"] = (order.subscription_state == "active" and order.status == "fulfilled"
                                           and not change["scheduledChange"] and can_schedule(live, end))
            except (PaymentsUnavailable, stripe.StripeError, InvalidBillingState, KeyError, TypeError, ValueError):
                change["planChangeUnavailable"] = True
    return {
        "active": end is not None, "endsAt": end, "currentPlanMonths": current_months, "subscription": subscription, **change,
    }


@require_GET
def my_subscription(request):
    if not request.user.is_authenticated:
        return api_response({"error": "authentication_required"}, 401)
    try:
        account = subscription_details(request.user.pk)
        account["canOpenBillingPortal"] = bool(stripe_customer_id_for(request.user.pk))
        return api_response(account)
    except DatabaseError:
        return api_response({"error": "subscription_unavailable"}, 503)


@require_GET
def plans(request):
    if not request.user.is_authenticated:
        return api_response({"error": "authentication_required"}, 401)
    try:
        account = subscription_details(request.user.pk)
    except DatabaseError:
        return api_response({"error": "plans_unavailable"}, 503)
    return api_response({
        **account,
        "plans": [{"months": months, "priceId": price_id_for(months) or None, "amount": amount,
                   "currency": "krw", "bonusCredits": PLAN_BONUS} for months, amount in PLAN_AMOUNTS.items()],
    })


@require_http_methods(["POST", "DELETE"])
@sensitive_variables()
def change_subscription_plan(request):
    if not request.user.is_authenticated:
        return api_response({"error": "authentication_required"}, 401)
    booking = request.method == "POST"
    fields = {"months", "effectiveAt", "priceId" if booking else "id"}
    data, error = read_payload(request, fields, integer_fields={"months"})
    if error is not None:
        return error
    months = data.get("months")
    try:
        effective_at = parse_datetime(data.get("effectiveAt", ""))
    except ValueError:
        effective_at = None
    if months not in PLAN_AMOUNTS or not effective_at or timezone.is_naive(effective_at):
        return api_response({"error": "invalid_plan"}, 400)
    if booking and not data.get("priceId"):
        return api_response({"error": "invalid_price"}, 400)
    if not booking and not data.get("id"):
        return api_response({"error": "invalid_plan_change"}, 400)
    try:
        with transaction.atomic():
            wallet = locked_account(request.user.pk)
            order = open_subscription(request.user.pk)
            if (not order or not order.stripe_subscription_id or order.status != "fulfilled"
                    or (booking and order.subscription_state != "active")):
                raise PlanChangeConflict
            client = stripe_client()
            price = configured_price(client, months) if booking else None
            if price and price["priceId"] != data["priceId"]:
                return api_response({"error": "price_changed"}, 409)
            live = read_subscription(client.v1, order, wallet.stripe_customer_id)
            change = update_change(client.v1, live, current_plan_end(request.user.pk), months, effective_at, price, data.get("id"))
    except PlanChangeConflict:
        return api_response({"error": "plan_change_conflict"}, 409)
    except (PaymentsUnavailable, stripe.StripeError, InvalidBillingState, DatabaseError, KeyError, TypeError, ValueError):
        return api_response({"error": "payments_unavailable"}, 503)
    return api_response({"scheduledChange": change})


@require_GET
def purchase_price(request):
    if not request.user.is_authenticated:
        return api_response({"error": "authentication_required"}, 401)
    try:
        price = configured_price(stripe_client())
    except (PaymentsUnavailable, stripe.StripeError):
        return api_response({"error": "payments_unavailable"}, 503)
    return api_response(price)


@transaction.atomic
def checkout_customer(user_id, customers):
    account = locked_account(user_id)
    if not account.stripe_customer_id:
        # Use the same key even if the first response was lost and a new order is started.
        first_order = CreditPurchase.objects.filter(user_id=user_id).earliest("created_at", "pk")
        customer = customers.create(options={"idempotency_key": f"topiq-customer-{first_order.pk}"})
        account.stripe_customer_id = customer.id
        account.save(update_fields=["stripe_customer_id"])
    return account.stripe_customer_id


def expire_checkout(purchase, *, missing_session=False):
    fields = {"status": "expired"}
    pending = CreditPurchase.objects.filter(pk=purchase.pk, status="pending")
    if missing_session:
        pending = pending.filter(stripe_session_id__isnull=True)
    if purchase.subscription_state == "checkout":
        pending = pending.filter(subscription_state="checkout")
        fields["subscription_state"] = "ended"
    pending.update(**fields)


def recover_plan_session(purchase, sessions, *, customer_id=None):
    if customer_id is None:
        customer_id = stripe_customer_id_for(purchase.user_id)
        if not customer_id:
            return None
    rows = sessions.list({"customer": customer_id, "created": {
        "gte": int(purchase.created_at.timestamp()) - 60,
        "lte": int((purchase.created_at + timedelta(days=1)).timestamp()),
    }})
    for session in rows.auto_paging_iter():
        if (session.to_dict().get("metadata") or {}).get("credit_purchase_id") == str(purchase.pk):
            CreditPurchase.objects.filter(pk=purchase.pk, stripe_session_id__isnull=True).update(stripe_session_id=session.id)
            return session
    return None


def create_subscription_session(purchase, sessions, params, *, retry):
    try:
        return sessions.create(params, options={"idempotency_key": str(purchase.pk)})
    except (stripe.IdempotencyError, stripe.APIError) as exc:
        # The SDK exposes a 409 as APIError and can leave the Stripe code on its nested error.
        code = exc.code or getattr(exc.error, "code", None)
        key_mismatch = isinstance(exc, stripe.IdempotencyError) or getattr(exc.error, "type", None) == "idempotency_error"
        if not retry or exc.http_status not in (400, 409) or not key_mismatch or code == "idempotency_key_in_use":
            raise

    session = recover_plan_session(purchase, sessions, customer_id=params["customer"])
    if session is not None:
        return session
    purchase.refresh_from_db()
    if purchase.stripe_session_id:
        return sessions.retrieve(purchase.stripe_session_id)
    if purchase.status != "pending":
        return None
    # All retries of this order share one replacement key, including after a lost response.
    return sessions.create(params, options={"idempotency_key": f"{purchase.pk}-subscription-v2"})


def checkout(purchase, client, *, retry):
    if purchase.status != "pending":
        return None
    sessions = client.v1.checkout.sessions
    if purchase.stripe_session_id:
        session = sessions.retrieve(purchase.stripe_session_id)
    elif purchase.created_at < timezone.now() - timedelta(hours=23):
        # Never create another session after Stripe's idempotency window.
        session = recover_plan_session(purchase, sessions) if purchase.subscription_state else None
        if session is None:
            expire_checkout(purchase, missing_session=True)
            purchase.refresh_from_db()
            return None
    else:
        page = "plans" if purchase.plan_months else "credits"
        return_url = f"{settings.TOPIQ_PUBLIC_URL}/{page}?purchase={purchase.pk}"
        params = {
            "mode": "subscription" if purchase.subscription_state else "payment",
            "currency": purchase.currency,
            "adaptive_pricing": {"enabled": False},
            "line_items": [{"quantity": 1, "price": purchase.stripe_price_id}],
            "metadata": {"credit_purchase_id": str(purchase.pk)},
            "success_url": return_url,
            "cancel_url": f"{return_url}&cancelled=1",
        }
        customer_id = checkout_customer(purchase.user_id, client.v1.customers)
        if purchase.subscription_state:
            session = create_subscription_session(purchase, sessions, {
                **params, "customer": customer_id, "subscription_data": {"metadata": params["metadata"]},
                "expires_at": int((purchase.created_at + timedelta(hours=24)).timestamp()),
            }, retry=retry)
            if session is None:
                return None
        else:
            options = {"idempotency_key": str(purchase.pk)}
            try:
                session = sessions.create({**params, "customer": customer_id, "invoice_creation": {"enabled": True}}, options=options)
            except stripe.IdempotencyError as exc:
                if purchase.plan_months or not retry or exc.http_status != 400 or exc.code == "idempotency_key_in_use":
                    raise
                # Recover a pre-portal Checkout using its original parameters and key.
                session = sessions.create(params, options=options)
        CreditPurchase.objects.filter(pk=purchase.pk, stripe_session_id__isnull=True).update(stripe_session_id=session.id)

    if session.status == "expired":
        expire_checkout(purchase)
    purchase.refresh_from_db()
    if purchase.status == "pending" and session.status == "open" and purchase.stripe_session_id == session.id:
        return session.url
    return None


class PlanConflict(Exception):
    pass


def close_old_plan_checkout(purchase, sessions):
    session = sessions.retrieve(purchase.stripe_session_id) if purchase.stripe_session_id else recover_plan_session(purchase, sessions)
    if session and session.status == "complete":
        raise PlanConflict  # The initial payment webhook may still be in transit.
    if session and session.status == "open":
        sessions.expire(session.id)
    expire_checkout(purchase)


@transaction.atomic
def new_order(user_id, attempt_id, price, months, client):
    if months:
        locked_account(user_id)
        previous = CreditPurchase.objects.filter(user_id=user_id, attempt_id=attempt_id).first()
        if previous:
            return previous, False
        pending = open_subscription(user_id)
        if current_plan_end(user_id) or (pending and pending.subscription_state != "checkout"):
            raise PlanConflict
        # A pre-upgrade one-time Checkout can still be open in another tab.
        legacy = CreditPurchase.objects.filter(user_id=user_id, plan_months__isnull=False, subscription_state__isnull=True, status="pending")
        for order in legacy:
            close_old_plan_checkout(order, client.v1.checkout.sessions)
        if pending:
            if pending.stripe_price_id == price["priceId"]:
                return pending, False
            # Close the old session before offering another billing interval.
            url = checkout(pending, client, retry=True)
            if url:
                client.v1.checkout.sessions.expire(pending.stripe_session_id)
                expire_checkout(pending)
            elif pending.status != "expired":
                raise PlanConflict
    return CreditPurchase.objects.get_or_create(user_id=user_id, attempt_id=attempt_id, defaults={
        "stripe_price_id": price["priceId"], "amount": price["amount"], "currency": price["currency"],
        "credits": price["credits"], "plan_months": months, "subscription_state": "checkout" if months else None,
    })


@require_http_methods(["GET", "POST"])
def credit_purchases(request):
    if request.method == "POST":
        return create_purchase(request)
    if not request.user.is_authenticated:
        return api_response({"error": "authentication_required"}, 401)
    try:
        page = int(request.GET.get("page", 1))
        if not 1 <= page <= 10000:
            raise ValueError
    except ValueError:
        return api_response({"error": "invalid_page"}, 400)
    try:
        expire_for_user(request.user.pk)
        with transaction.atomic():
            account = locked_account(request.user.pk)
            reserved = reserved_orders(account)
            query = topups(account.pk).select_related("transaction").prefetch_related("refunds").order_by("-transaction__created_at", "-pk")
            rows = list(query[(page - 1) * 20:page * 20 + 1])
            return api_response({"purchases": [{
                "id": order.pk, "paidAt": order.transaction.created_at, "amount": order.amount,
                "currency": order.currency, "credits": order.credits, "remainingCredits": order.remaining_credits,
                "refundState": refund_state(order, account, reserved),
            } for order in rows[:20]], "nextPage": page + 1 if len(rows) > 20 else None})
    except DatabaseError:
        return api_response({"error": "payments_unavailable"}, 503)


@require_POST
@sensitive_variables()
def refund_purchase(request, purchase_id):
    if not request.user.is_authenticated:
        return api_response({"error": "authentication_required"}, 401)
    _, error = read_payload(request, set())
    if error is not None:
        return error
    try:
        expire_for_user(request.user.pk)
        api = stripe_client().v1
        state, attempt = reserve_refund(request.user.pk, purchase_id, api)
        if state == "confirming":
            state = submit_refund(request.user.pk, purchase_id, attempt, api)
    except CreditPurchase.DoesNotExist:
        return api_response({"error": "not_found"}, 404)
    except (PaymentsUnavailable, stripe.StripeError, DatabaseError, ValueError):
        return api_response({"error": "refund_unavailable"}, 503)
    return api_response({"refundState": state}, 202 if state == "processing" else 200)


@require_POST
@sensitive_variables()
def create_purchase(request, plan=False):
    if not request.user.is_authenticated:
        return api_response({"error": "authentication_required"}, 401)
    fields = {"attemptId", "priceId", "months"} if plan else {"attemptId", "priceId"}
    data, error = read_payload(request, fields, integer_fields={"months"})
    if error is not None:
        return error
    months = data.get("months")
    if plan and months not in PLAN_AMOUNTS:
        return api_response({"error": "invalid_plan"}, 400)
    try:
        attempt_id = UUID(data.get("attemptId", ""))
        if attempt_id.version != 4:
            raise ValueError
    except ValueError:
        return api_response({"error": "invalid_attempt"}, 400)
    expected_price = data.get("priceId")
    if not expected_price:
        return api_response({"error": "invalid_price"}, 400)

    try:
        client = stripe_client()
        purchase = CreditPurchase.objects.filter(user=request.user, attempt_id=attempt_id).first()
        created = False
        if purchase is None:
            price = configured_price(client, months)
            if expected_price != price["priceId"]:
                return api_response({"error": "price_changed"}, 409)
            purchase, created = new_order(request.user.pk, attempt_id, price, months, client)
        if (purchase.stripe_price_id != expected_price or purchase.plan_months != months
                or (plan and purchase.subscription_state is None)):
            return api_response({"error": "price_changed"}, 409)
        try:
            url = checkout(purchase, client, retry=not created)
        except stripe.InvalidRequestError as exc:
            # A rejected, superseded Price cannot open a new Checkout Session.
            if (not purchase.stripe_session_id and price_id_for(months)
                    and purchase.stripe_price_id != price_id_for(months)
                    and exc.http_status in (400, 404) and exc.param == "line_items[0][price]"):
                return api_response({"error": "price_changed"}, 409)
            raise
    except PlanConflict:
        return api_response({"error": "plan_in_use"}, 409)
    except (PaymentsUnavailable, stripe.StripeError, DatabaseError):
        return api_response({"error": "payments_unavailable"}, 503)
    return api_response({"id": purchase.pk, "status": purchase.status, "checkoutUrl": url}, 201 if created else 200)


@require_POST
@sensitive_variables()
def billing_portal(request):
    if not request.user.is_authenticated:
        return api_response({"error": "authentication_required"}, 401)
    data, error = read_payload(request, {"from"})
    if error is not None:
        return error
    page = data.get("from", "credits")
    if page not in {"plans", "credits", "settings/subscription", "en/settings/subscription", "id/settings/subscription"}:
        return api_response({"error": "invalid_return_page"}, 400)
    try:
        customer_id = stripe_customer_id_for(request.user.pk)
        if not customer_id:
            return api_response({"portalUrl": None})
        session = stripe_client(require_webhook=False).v1.billing_portal.sessions.create({
            "customer": customer_id, "return_url": f"{settings.TOPIQ_PUBLIC_URL}/{page}",
        })
    except (PaymentsUnavailable, stripe.StripeError, DatabaseError):
        return api_response({"error": "payments_unavailable"}, 503)
    return api_response({"portalUrl": session.url})


@require_GET
def purchase_status(request, purchase_id):
    if not request.user.is_authenticated:
        return api_response({"error": "authentication_required"}, 401)
    try:
        orders = CreditPurchase.objects.filter(user=request.user)
        if request.GET.get("product") in {"plan", "credit"}:
            orders = orders.filter(plan_months__isnull=request.GET["product"] == "credit")
        purchase = orders.values("id", "status").get(pk=purchase_id)
    except CreditPurchase.DoesNotExist:
        return api_response({"error": "not_found"}, 404)
    return api_response(purchase)


@transaction.atomic
def apply_checkout_event(event_type, session, event_created=None):
    purchase_id = (session.get("metadata") or {}).get("credit_purchase_id")
    if purchase_id is None:
        return 200  # Other products can share this Stripe account.
    purchase = CreditPurchase.objects.get(pk=UUID(purchase_id))
    account = locked_account(purchase.user_id)
    purchase = CreditPurchase.objects.select_for_update().get(pk=purchase.pk)
    if purchase.subscription_state:
        if (session["mode"] != "subscription" or not session.get("customer") or purchase.stripe_session_id not in (None, session["id"])
                or not CreditAccount.objects.filter(user_id=purchase.user_id, stripe_customer_id=session["customer"]).exists()):
            return 400
        if not purchase.stripe_session_id:
            purchase.stripe_session_id = session["id"]
            purchase.save(update_fields=["stripe_session_id"])
        if event_type == "checkout.session.expired" and session["status"] == "expired":
            expire_checkout(purchase)
        return 200  # Only a paid invoice grants a subscription period and its credits.
    if not purchase.stripe_session_id:
        return 503  # Retry after session creation has committed.
    if (session["id"] != purchase.stripe_session_id or session["mode"] != "payment"
            or session["currency"] != purchase.currency or session["amount_total"] != purchase.amount):
        return 400
    if purchase.status == "fulfilled":
        return 200
    if event_type == "checkout.session.expired":
        if session["status"] == "expired" and purchase.status == "pending":
            purchase.status = "expired"
            purchase.save(update_fields=["status"])
    elif session["payment_status"] == "paid" and session["status"] == "complete":
        intent_id = session.get("payment_intent")
        if purchase.stripe_payment_intent_id and purchase.stripe_payment_intent_id != intent_id:
            return 400
        purchase.stripe_payment_intent_id = intent_id
        if purchase.plan_months:
            assign_plan_period(purchase, datetime.fromtimestamp(event_created, UTC))
            purchase.credited_months = 1
        account.balance += purchase.credits
        purchase.transaction = record(account, "plan_bonus" if purchase.plan_months else "purchase", purchase.credits)
        if purchase.plan_months is None:
            purchase.remaining_credits = purchase.credits
        purchase.status = "fulfilled"
        purchase.save(update_fields=["transaction", "status", "plan_starts_at", "plan_ends_at", "credited_months",
                                     "stripe_payment_intent_id", "remaining_credits"])
        reconcile_purchase_refunds(account, purchase)
    return 200


@csrf_exempt
@require_POST
@sensitive_variables()
def stripe_webhook(request):
    if not settings.STRIPE_WEBHOOK_SECRET:
        return HttpResponse(status=503)
    try:
        event = stripe.Webhook.construct_event(
            request.body, request.headers.get("Stripe-Signature"), settings.STRIPE_WEBHOOK_SECRET,
        )
        status = 200
        if event.type in {"checkout.session.completed", "checkout.session.expired"}:
            status = apply_checkout_event(event.type, event.data.object.to_dict(), getattr(event, "created", None))
        elif event.type == "invoice.paid":
            apply_paid_invoice(event.data.object.to_dict())
        elif event.type in {"refund.created", "refund.updated", "refund.failed"}:
            apply_refund(event.data.object.to_dict(), stripe_client().v1)
        elif event.type in {"customer.subscription.updated", "customer.subscription.deleted"}:
            sync_subscription(event.type, event.data.object.to_dict(), stripe_client)
    except (ValueError, TypeError, AttributeError, KeyError, stripe.SignatureVerificationError,
            CreditPurchase.DoesNotExist, RequestDataTooBig):
        return HttpResponse(status=400)
    except (DatabaseError, PaymentsUnavailable, InvalidBillingState, RefundOrderNotReady, stripe.StripeError):
        return HttpResponse(status=503)
    return HttpResponse(status=status)
