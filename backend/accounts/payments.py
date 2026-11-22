from datetime import UTC, datetime, timedelta
from decimal import Decimal, InvalidOperation
from uuid import UUID

import stripe
from django.conf import settings
from django.core.exceptions import RequestDataTooBig
from django.db import DatabaseError, transaction
from django.http import HttpResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.debug import sensitive_variables
from django.views.decorators.http import require_GET, require_POST

from .credits import locked_account, record
from .models import CREDIT_PURCHASE_QUANTITY, PLAN_AMOUNTS, PLAN_BONUS, CreditAccount, CreditPurchase
from .plans import assign_plan_period, current_plan_end, open_subscription
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


@require_GET
def plans(request):
    if not request.user.is_authenticated:
        return api_response({"error": "authentication_required"}, 401)
    try:
        end = current_plan_end(request.user.pk)
        subscription = open_subscription(request.user.pk)
    except DatabaseError:
        return api_response({"error": "plans_unavailable"}, 503)
    return api_response({
        "plans": [{"months": months, "priceId": price_id_for(months) or None, "amount": amount,
                   "currency": "krw", "bonusCredits": PLAN_BONUS} for months, amount in PLAN_AMOUNTS.items()],
        "active": end is not None, "endsAt": end,
        "subscription": {"state": subscription.subscription_state, "months": subscription.plan_months}
                        if subscription and subscription.subscription_state != "checkout" else None,
    })


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


def recover_plan_session(purchase, sessions):
    customer = CreditAccount.objects.filter(user_id=purchase.user_id).values_list("stripe_customer_id", flat=True).first()
    if not customer:
        return None
    # Recover a lost create response before releasing the single-subscription reservation.
    rows = sessions.list({"customer": customer, "created": {
        "gte": int(purchase.created_at.timestamp()) - 60,
        "lte": int((purchase.created_at + timedelta(days=1)).timestamp()),
    }})
    for session in rows.auto_paging_iter():
        if (session.to_dict().get("metadata") or {}).get("credit_purchase_id") == str(purchase.pk):
            CreditPurchase.objects.filter(pk=purchase.pk, stripe_session_id__isnull=True).update(stripe_session_id=session.id)
            return session
    return None


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
        options = {"idempotency_key": str(purchase.pk)}
        billing = ({"subscription_data": {"metadata": params["metadata"]}, "payment_method_types": ["card"],
                    "expires_at": int((purchase.created_at + timedelta(hours=24)).timestamp())}
                   if purchase.subscription_state else {"invoice_creation": {"enabled": True}})
        try:
            session = sessions.create({**params, "customer": customer_id, **billing}, options=options)
        except stripe.IdempotencyError as exc:
            if purchase.plan_months or not retry or exc.http_status != 400 or exc.code == "idempotency_key_in_use":
                raise
            # Recover a pre-portal Checkout whose response was lost, using its original parameters and key.
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
    if page not in {"plans", "credits"}:
        return api_response({"error": "invalid_return_page"}, 400)
    try:
        customer_id = (CreditAccount.objects.filter(user_id=request.user.pk)
                       .values_list("stripe_customer_id", flat=True).first())
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
    purchase = CreditPurchase.objects.select_for_update().get(pk=UUID(purchase_id))
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
        account = locked_account(purchase.user_id)
        if purchase.plan_months:
            assign_plan_period(purchase, datetime.fromtimestamp(event_created, UTC))
        account.balance += purchase.credits
        purchase.transaction = record(account, "plan_bonus" if purchase.plan_months else "purchase", purchase.credits)
        purchase.status = "fulfilled"
        purchase.save(update_fields=["transaction", "status", "plan_starts_at", "plan_ends_at"])
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
        elif event.type in {"customer.subscription.updated", "customer.subscription.deleted"}:
            sync_subscription(event.type, event.data.object.to_dict(), stripe_client)
    except (ValueError, TypeError, AttributeError, KeyError, stripe.SignatureVerificationError,
            CreditPurchase.DoesNotExist, RequestDataTooBig):
        return HttpResponse(status=400)
    except (DatabaseError, PaymentsUnavailable, stripe.StripeError):
        return HttpResponse(status=503)
    return HttpResponse(status=status)
