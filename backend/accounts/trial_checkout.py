from datetime import UTC, datetime, timedelta

import stripe
from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone
from django.utils.crypto import salted_hmac
from django.utils.dateparse import parse_datetime
from django.views.decorators.debug import sensitive_variables

from .credits import locked_account
from .models import CreditPurchase, PlusFreeTrial
from .plan_changes import plan_item
from .plans import current_plan_end
from .subscriptions import HOSTED_TRIAL, cancel_refunded_subscription, live_order_subscription, sync_subscription


CONSENT_VERSION = "monthly-trial-v2"
HOSTED_CONSENT_VERSION = "monthly-trial-stripe-v1"
TRIAL_DAYS = 7
TRIAL_DURATION = timedelta(days=TRIAL_DAYS)
CLAIMED = ("reserved", "started")


class TrialUnavailable(Exception):
    pass


def claimed_trials():
    return PlusFreeTrial.objects.filter(status__in=CLAIMED)


def require_trial_key():
    if not settings.STRIPE_TRIAL_FINGERPRINT_KEY:
        raise TrialUnavailable


def close_trial(trial, status="closed"):
    trial.status = status
    trial.save(update_fields=["status", "card_fingerprint_digest"])
    CreditPurchase.objects.filter(pk=trial.pk, status="pending", subscription_state="checkout").update(
        status="expired", subscription_state="ended",
    )


def refresh_quote(trial):
    now = timezone.now()
    if trial.status != "consent" or (trial.agreed_trial_ends_at and now < trial.agreed_trial_ends_at - TRIAL_DURATION):
        return
    # The quoted deadline is fixed for this five-minute window and allows at least seven full days.
    window_end = (int(now.timestamp()) // 300 + 1) * 300
    trial.agreed_trial_ends_at = datetime.fromtimestamp(window_end, UTC) + TRIAL_DURATION
    trial.save(update_fields=["agreed_trial_ends_at"])


def purchase_result(purchase, trial=None):
    result = {"id": purchase.pk, "status": purchase.status}
    if trial is None:
        return result
    states = {"setup": "awaiting_card", "consent": "awaiting_consent", "reserved": "creating",
              "started": "started", "closed": "ended"}
    if trial.status == "rejected":
        if claimed_trials().filter(user_id=trial.user_id).exists():
            state = "account_used"
        else:
            state = "card_used" if trial.card_fingerprint_digest else "card_unavailable"
    else:
        state = states[trial.status]
    result["trial"] = {"status": state, "endsAt": trial.ends_at or trial.agreed_trial_ends_at,
                       "consentVersion": CONSENT_VERSION, "amount": purchase.amount,
                       "currency": purchase.currency, "priceId": purchase.stripe_price_id}
    return result


def check_session(session, order, customer_id, mode="setup"):
    if (session.get("mode") != mode or not customer_id or session.get("customer") != customer_id
            or (session.get("metadata") or {}).get("credit_purchase_id") != str(order.pk)
            or not session.get("id") or order.stripe_session_id not in (None, session["id"])):
        raise ValueError("Trial session does not match the order")


@sensitive_variables()
def card_digest(method, customer_id):
    card = method.get("card") or {}
    if (method.get("customer") != customer_id or method.get("type") != "card"
            or card.get("wallet") or not card.get("fingerprint")):
        return ""
    require_trial_key()
    return salted_hmac("topiq-plus-trial-card", card["fingerprint"],
                       secret=settings.STRIPE_TRIAL_FINGERPRINT_KEY, algorithm="sha256").hexdigest()


@sensitive_variables()
def setup_card(api, session, order, customer_id):
    check_session(session, order, customer_id)
    if session.get("status") != "complete" or not session.get("setup_intent"):
        raise ValueError("Incomplete card setup")
    intent = api.setup_intents.retrieve(session["setup_intent"], {"expand": ["payment_method"]}).to_dict()
    if (intent.get("id") != session["setup_intent"] or intent.get("status") != "succeeded"
            or intent.get("customer") != customer_id
            or (intent.get("metadata") or {}).get("credit_purchase_id") != str(order.pk)):
        raise ValueError("Setup intent does not match the order")
    method = intent.get("payment_method") or {}
    if not isinstance(method, dict) or not method.get("id"):
        raise ValueError("Invalid setup payment method")
    digest = card_digest(method, customer_id)
    return (method["id"], digest) if digest else (None, "")


@sensitive_variables()
def receive_checkout(order, trial, session, customer_id, client):
    api = client.v1
    if (session.get("metadata") or {}).get(HOSTED_TRIAL) != "1":
        return receive_setup(order, trial, session, customer_id, api)
    check_session(session, order, customer_id, "subscription")
    if trial.user_id != order.user_id or trial.purchase_id != order.pk or order.plan_months != 1:
        raise ValueError("Trial does not match the order")
    if not order.stripe_session_id:
        order.stripe_session_id = session["id"]
        order.save(update_fields=["stripe_session_id"])
    if session["status"] == "expired" and trial.status == "setup":
        close_trial(trial)
    if session["status"] != "complete" or trial.status in ("started", "rejected"):
        return
    subscription = live_order_subscription(api, order, customer_id, session.get("subscription"),
                                           expand=["default_payment_method"])
    if (subscription["metadata"].get(HOSTED_TRIAL) != "1"
            or plan_item(subscription)["price"]["id"] != order.stripe_price_id):
        raise ValueError("Subscription does not match the trial checkout")
    if subscription["status"] in ("canceled", "incomplete_expired"):
        close_trial(trial)
        return
    if order.status != "pending" or order.subscription_state != "checkout" or current_plan_end(order.user_id):
        cancel_refunded_subscription(api, subscription)
        close_trial(trial)
        return
    if trial.status != "setup":
        raise ValueError("Trial checkout is not awaiting completion")
    start = datetime.fromtimestamp(subscription["trial_start"], UTC)
    end = datetime.fromtimestamp(subscription["trial_end"], UTC)
    if end <= start:
        raise ValueError("Invalid hosted trial period")
    method = subscription.get("default_payment_method")
    digest = card_digest(method, customer_id) if isinstance(method, dict) else ""
    trial.card_fingerprint_digest = digest
    if not digest:
        cancel_refunded_subscription(api, subscription)
        close_trial(trial, "rejected")
        return
    try:
        with transaction.atomic():
            trial.status = "reserved"
            trial.consented_at, trial.agreed_trial_ends_at = start, end
            trial.consent_version = HOSTED_CONSENT_VERSION
            trial.save(update_fields=["status", "card_fingerprint_digest", "consented_at",
                                      "agreed_trial_ends_at", "consent_version"])
    except IntegrityError:
        if not (claimed_trials().filter(user_id=trial.user_id).exists()
                or claimed_trials().filter(card_fingerprint_digest=digest).exists()):
            raise
        cancel_refunded_subscription(api, subscription)
        close_trial(trial, "rejected")
        return
    sync_subscription("trial.confirmed", subscription, lambda: client)


def receive_setup(order, trial, session, customer_id, api):
    # Caller holds the account lock for both Checkout webhooks and return-page reconciliation.
    if trial.user_id != order.user_id or trial.purchase_id != order.pk or order.plan_months != 1:
        raise ValueError("Trial does not match the order")
    check_session(session, order, customer_id)
    if trial.status != "setup":
        return
    if order.subscription_state != "checkout" or order.status != "pending":
        close_trial(trial)
        return
    if not order.stripe_session_id:
        order.stripe_session_id = session["id"]
        order.save(update_fields=["stripe_session_id"])
    if session["status"] == "expired":
        close_trial(trial)
    elif session["status"] == "complete":
        _, trial.card_fingerprint_digest = setup_card(api, session, order, customer_id)
        if (not trial.card_fingerprint_digest or claimed_trials().filter(
                card_fingerprint_digest=trial.card_fingerprint_digest).exists()):
            close_trial(trial, "rejected")
            return
        trial.status = "consent"
        trial.save(update_fields=["status", "card_fingerprint_digest"])
        refresh_quote(trial)


@transaction.atomic
def prepare_confirmation(order, terms, api):
    account = locked_account(order.user_id)
    order = CreditPurchase.objects.select_for_update().get(pk=order.pk)
    trial = PlusFreeTrial.objects.get(purchase=order, user_id=order.user_id)
    if trial.status != "consent":
        return trial.status, None
    refresh_quote(trial)
    try:
        submitted_end = parse_datetime(terms.get("trialEndsAt", ""))
    except ValueError:
        submitted_end = None
    if (terms.get("consentVersion") != CONSENT_VERSION or terms.get("priceId") != order.stripe_price_id
            or submitted_end != trial.agreed_trial_ends_at):
        return "changed", None
    if order.status != "pending" or order.subscription_state != "checkout" or current_plan_end(order.user_id):
        close_trial(trial)
        return trial.status, None
    session = api.checkout.sessions.retrieve(order.stripe_session_id).to_dict()
    method, digest = setup_card(api, session, order, account.stripe_customer_id)
    if digest != trial.card_fingerprint_digest or not method:
        trial.card_fingerprint_digest = ""
        close_trial(trial, "rejected")
        return trial.status, None
    trial.consented_at = timezone.now()
    trial.consent_version = CONSENT_VERSION
    try:
        with transaction.atomic():
            trial.status = "reserved"
            trial.save(update_fields=["status", "consented_at", "consent_version"])
    except IntegrityError:
        if not (claimed_trials().filter(user_id=trial.user_id).exists()
                or claimed_trials().filter(card_fingerprint_digest=digest).exists()):
            raise
        close_trial(trial, "rejected")
        return trial.status, None
    return "new_reservation", method


def find_created_subscription(api, customer_id, trial):
    rows = api.subscriptions.list({"customer": customer_id, "status": "all",
                                   "created": {"gte": int(trial.consented_at.timestamp()) - 120}})
    for subscription in rows.auto_paging_iter():
        data = subscription.to_dict()
        if (data.get("metadata") or {}).get("credit_purchase_id") == str(trial.pk):
            return data
    return None


@transaction.atomic
@sensitive_variables()
def activate_reserved(order, client, client_factory, method=None):
    # The reservation was committed before calling Stripe. A lost response keeps the claim recoverable.
    account = locked_account(order.user_id)
    order = CreditPurchase.objects.select_for_update().get(pk=order.pk)
    trial = PlusFreeTrial.objects.get(purchase=order, user_id=order.user_id)
    if trial.status != "reserved":
        return
    api, customer_id = client.v1, account.stripe_customer_id
    created = None
    can_create = order.status == "pending" and order.subscription_state == "checkout"
    if order.stripe_subscription_id:
        created = api.subscriptions.retrieve(order.stripe_subscription_id).to_dict()
    elif method is None or not can_create:
        created = find_created_subscription(api, customer_id, trial)
        if not created:
            if not can_create or timezone.now() >= trial.agreed_trial_ends_at - TRIAL_DURATION:
                # Let an in-flight Stripe request settle before releasing an uncertain reservation.
                if timezone.now() >= trial.consented_at + timedelta(hours=24):
                    close_trial(trial)
                return
            session = api.checkout.sessions.retrieve(order.stripe_session_id).to_dict()
            method, digest = setup_card(api, session, order, customer_id)
            if not method or digest != trial.card_fingerprint_digest:
                close_trial(trial)
                return
    if created is None:
        params = {"customer": customer_id, "items": [{"price": order.stripe_price_id, "quantity": 1}],
                  "default_payment_method": method, "collection_method": "charge_automatically",
                  "trial_end": int(trial.agreed_trial_ends_at.timestamp()),
                  "payment_settings": {"payment_method_types": ["card"]},
                  "trial_settings": {"end_behavior": {"missing_payment_method": "cancel"}},
                  "metadata": {"credit_purchase_id": str(order.pk)}}
        try:
            created = api.subscriptions.create(params, options={"idempotency_key": f"topiq-trial-{order.pk}"}).to_dict()
        except (stripe.InvalidRequestError, stripe.CardError) as exc:
            if exc.http_status not in (400, 402, 404) or exc.code == "idempotency_key_in_use":
                raise
            created = find_created_subscription(api, customer_id, trial)
            if created is None:
                close_trial(trial)
                return
    if ((created.get("metadata") or {}).get("credit_purchase_id") != str(order.pk)
            or created.get("customer") != customer_id or not created.get("id")
            or order.stripe_subscription_id not in (None, created["id"])):
        raise ValueError("Created subscription does not match the trial")
    sync_subscription("trial.confirmed", created, client_factory)
