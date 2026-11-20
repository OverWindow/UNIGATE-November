from datetime import timedelta
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
from .models import CREDIT_PURCHASE_QUANTITY, CreditPurchase
from .views import api_response, read_payload


class PaymentsUnavailable(Exception):
    pass


def stripe_client():
    if not settings.STRIPE_SECRET_KEY or not settings.STRIPE_WEBHOOK_SECRET:
        raise PaymentsUnavailable
    return stripe.StripeClient(
        settings.STRIPE_SECRET_KEY, http_client=stripe.RequestsClient(timeout=8), max_network_retries=0,
    )


def configured_price(client):
    if not settings.STRIPE_PRICE_ID:
        raise PaymentsUnavailable
    price = client.v1.prices.retrieve(settings.STRIPE_PRICE_ID).to_dict()
    amount = price.get("unit_amount")
    if (price.get("id") != settings.STRIPE_PRICE_ID or price.get("active") is not True
            or price.get("type") != "one_time" or price.get("billing_scheme") != "per_unit"
            or price.get("currency") != "krw" or type(amount) is not int or amount <= 0
            or price.get("custom_unit_amount") is not None or price.get("transform_quantity") is not None):
        raise PaymentsUnavailable
    # KRW is a whole-unit currency, including when Stripe supplies a decimal price.
    try:
        decimal_amount = price.get("unit_amount_decimal")
        if decimal_amount is not None and Decimal(str(decimal_amount)) != amount:
            raise PaymentsUnavailable
    except InvalidOperation:
        raise PaymentsUnavailable from None
    return {"priceId": price["id"], "amount": amount, "currency": price["currency"], "credits": CREDIT_PURCHASE_QUANTITY}


@require_GET
def purchase_price(request):
    if not request.user.is_authenticated:
        return api_response({"error": "authentication_required"}, 401)
    try:
        price = configured_price(stripe_client())
    except (PaymentsUnavailable, stripe.StripeError):
        return api_response({"error": "payments_unavailable"}, 503)
    return api_response(price)


def checkout(purchase, sessions):
    if purchase.status != "pending":
        return None
    if purchase.stripe_session_id:
        session = sessions.retrieve(purchase.stripe_session_id)
    else:
        # Never create another session after Stripe's 24-hour idempotency window.
        if purchase.created_at < timezone.now() - timedelta(hours=23):
            CreditPurchase.objects.filter(pk=purchase.pk, status="pending", stripe_session_id__isnull=True).update(status="expired")
            purchase.refresh_from_db()
            return None
        return_url = f"{settings.TOPIQ_PUBLIC_URL}/credits?purchase={purchase.pk}"
        session = sessions.create({
            "mode": "payment",
            "currency": purchase.currency,
            "payment_method_types": ["card"],
            "adaptive_pricing": {"enabled": False},
            "line_items": [{"quantity": 1, "price": purchase.stripe_price_id}],
            "metadata": {"credit_purchase_id": str(purchase.pk)},
            "success_url": return_url,
            "cancel_url": f"{return_url}&cancelled=1",
        }, options={"idempotency_key": str(purchase.pk)})
        CreditPurchase.objects.filter(pk=purchase.pk, stripe_session_id__isnull=True).update(stripe_session_id=session.id)

    if session.status == "expired":
        CreditPurchase.objects.filter(pk=purchase.pk, status="pending").update(status="expired")
    purchase.refresh_from_db()
    if purchase.status == "pending" and session.status == "open" and purchase.stripe_session_id == session.id:
        return session.url
    return None


@require_POST
@sensitive_variables()
def create_purchase(request):
    if not request.user.is_authenticated:
        return api_response({"error": "authentication_required"}, 401)
    data, error = read_payload(request, {"attemptId", "priceId"})
    if error is not None:
        return error
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
            price = configured_price(client)
            if expected_price != price["priceId"]:
                return api_response({"error": "price_changed"}, 409)
            purchase, created = CreditPurchase.objects.get_or_create(
                user=request.user, attempt_id=attempt_id, defaults={
                    "stripe_price_id": price["priceId"], "amount": price["amount"], "currency": price["currency"],
                },
            )
        if purchase.stripe_price_id != expected_price:
            return api_response({"error": "price_changed"}, 409)
        try:
            url = checkout(purchase, client.v1.checkout.sessions)
        except stripe.InvalidRequestError as exc:
            # A rejected, superseded Price cannot open a new Checkout Session.
            if (not purchase.stripe_session_id and settings.STRIPE_PRICE_ID
                    and purchase.stripe_price_id != settings.STRIPE_PRICE_ID
                    and exc.http_status in (400, 404) and exc.param == "line_items[0][price]"):
                return api_response({"error": "price_changed"}, 409)
            raise
    except (PaymentsUnavailable, stripe.StripeError, DatabaseError):
        return api_response({"error": "payments_unavailable"}, 503)
    return api_response({"id": purchase.pk, "status": purchase.status, "checkoutUrl": url}, 201 if created else 200)


@require_GET
def purchase_status(request, purchase_id):
    if not request.user.is_authenticated:
        return api_response({"error": "authentication_required"}, 401)
    try:
        purchase = CreditPurchase.objects.values("id", "status").get(pk=purchase_id, user=request.user)
    except CreditPurchase.DoesNotExist:
        return api_response({"error": "not_found"}, 404)
    return api_response(purchase)


@transaction.atomic
def apply_checkout_event(event_type, session):
    purchase_id = (session.get("metadata") or {}).get("credit_purchase_id")
    if purchase_id is None:
        return 200  # Other products can share this Stripe account.
    purchase = CreditPurchase.objects.select_for_update().get(pk=UUID(purchase_id))
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
        account.balance += purchase.credits
        purchase.transaction = record(account, "purchase", purchase.credits)
        purchase.status = "fulfilled"
        purchase.save(update_fields=["transaction", "status"])
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
        if event.type not in {"checkout.session.completed", "checkout.session.expired"}:
            return HttpResponse(status=200)
        status = apply_checkout_event(event.type, event.data.object.to_dict())
    except (ValueError, TypeError, AttributeError, KeyError, stripe.SignatureVerificationError,
            CreditPurchase.DoesNotExist, RequestDataTooBig):
        return HttpResponse(status=400)
    except DatabaseError:
        return HttpResponse(status=503)
    return HttpResponse(status=status)
