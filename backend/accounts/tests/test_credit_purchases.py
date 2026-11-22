import hmac
import json
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from threading import Barrier
from unittest.mock import Mock, patch

import stripe
from django.contrib.auth import get_user_model
from django.db import DatabaseError, close_old_connections, connection
from django.test import Client, TestCase, TransactionTestCase, override_settings
from django.utils import timezone

from accounts.models import CreditAccount, CreditPurchase, CreditTransaction
from accounts.payments import checkout_customer


PURCHASES = "/api/credits/purchases/"
PRICE = "/api/credits/price/"
PORTAL = "/api/credits/billing-portal/"
WEBHOOK = "/api/payments/stripe/webhook/"
SIGNING_SECRET = "local-unit-test-signing-value"
CHECKOUT_URL = "https://checkout.stripe.com/c/pay/test-session"
SESSION_ID = "cs_test_credit_purchase"
PRICE_ID = "price_FixtureCreditTopUp"
AMOUNT = 7500
TEST_SETTINGS = {
    "STRIPE_SECRET_KEY": "local-unit-test-api-value",
    "STRIPE_WEBHOOK_SECRET": SIGNING_SECRET,
    "STRIPE_PRICE_ID": PRICE_ID,
    "STRIPE_PLAN_PRICE_IDS": {1: "price_one", 3: "price_three", 6: "price_six"},
    "TOPIQ_PUBLIC_URL": "https://topiq.example.invalid",
}


def stripe_price(**changes):
    return stripe.Price.construct_from({
        "id": PRICE_ID, "active": True, "type": "one_time", "billing_scheme": "per_unit",
        "currency": "krw", "unit_amount": AMOUNT, "unit_amount_decimal": str(AMOUNT),
        "custom_unit_amount": None, "transform_quantity": None, **changes,
    }, None)


def post_webhook(client, order, event_type="checkout.session.completed", *, signing_secret=SIGNING_SECRET, created=None, **changes):
    session = {
        "object": "checkout.session", "id": SESSION_ID, "mode": "payment",
        "metadata": {"credit_purchase_id": str(order.pk)}, "payment_status": "paid",
        "amount_total": AMOUNT, "currency": "krw", "status": "complete", **changes,
    }
    event = {"id": f"evt_{uuid.uuid4().hex}", "object": "event", "type": event_type,
             "created": int(time.time()) if created is None else created, "data": {"object": session}}
    payload = json.dumps(event, separators=(",", ":")).encode()
    timestamp = str(int(time.time()))
    signature = hmac.digest(signing_secret.encode(), timestamp.encode() + b"." + payload, "sha256").hex()
    return client.post(WEBHOOK, payload, content_type="application/json",
                       HTTP_STRIPE_SIGNATURE=f"t={timestamp},v1={signature}")


@override_settings(**TEST_SETTINGS)
class CreditPurchaseTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username="purchase-owner")
        self.wallet = CreditAccount.objects.create(user=self.user, balance=150, reserved=20)
        self.client = Client(enforce_csrf_checks=True)
        self.client.force_login(self.user)
        self.csrf = self.client.get("/api/csrf/").json()["csrfToken"]
        self.attempt_id = str(uuid.uuid4())
        stripe_client = self.enterContext(patch("accounts.payments.stripe.StripeClient"))
        self.customers = stripe_client.return_value.v1.customers
        self.customers.create.return_value.id = "cus_fixture_owner"
        self.portals = stripe_client.return_value.v1.billing_portal.sessions
        self.portals.create.return_value.url = "https://billing.stripe.com/p/session/fixture"
        self.prices = stripe_client.return_value.v1.prices
        self.prices.retrieve.return_value = stripe_price()
        self.sessions = stripe_client.return_value.v1.checkout.sessions
        session = stripe.checkout.Session.construct_from({"id": SESSION_ID, "url": CHECKOUT_URL, "status": "open"}, None)
        self.sessions.create.return_value = session
        self.sessions.retrieve.return_value = session

    def post_attempt(self, price_id=PRICE_ID):
        return self.client.post(PURCHASES, {"attemptId": self.attempt_id, "priceId": price_id},
                                content_type="application/json", HTTP_X_CSRFTOKEN=self.csrf)

    def new_order(self):
        response = self.post_attempt()
        self.assertIn(response.status_code, (200, 201))
        return CreditPurchase.objects.get(pk=response.json()["id"])

    def assert_wallet(self, balance, entries):
        self.wallet.refresh_from_db()
        self.assertEqual((self.wallet.balance, self.wallet.reserved), (balance, 20))
        self.assertEqual(CreditTransaction.objects.filter(account=self.wallet, kind="purchase").count(), entries)

    def post_plan(self, months, price_id):
        return self.client.post("/api/plans/purchases/", {"months": months, "priceId": price_id, "attemptId": self.attempt_id},
                                content_type="application/json", HTTP_X_CSRFTOKEN=self.csrf)

    def test_plan_catalog_and_each_checkout_match_the_advertised_price(self):
        self.assertEqual(Client().get("/api/plans/").status_code, 401)
        self.assertEqual(Client().post("/api/plans/purchases/").status_code, 401)
        self.assertEqual(self.client.post("/api/plans/purchases/", {}, content_type="application/json").status_code, 403)
        catalog = self.client.get("/api/plans/").json()
        self.assertFalse(catalog["active"])
        self.assertIsNone(catalog["endsAt"])
        self.assertEqual([(p["months"], p["amount"], p["bonusCredits"]) for p in catalog["plans"]],
                         [(1, 9900, 400), (3, 23900, 400), (6, 43900, 400)])
        for offer in catalog["plans"]:
            months, amount, price_id = offer["months"], offer["amount"], offer["priceId"]
            self.attempt_id = str(uuid.uuid4())
            self.prices.retrieve.return_value = stripe_price(id=price_id, unit_amount=amount, unit_amount_decimal=str(amount))
            self.sessions.create.return_value = stripe.checkout.Session.construct_from({
                "id": f"cs_plan_{months}", "url": CHECKOUT_URL, "status": "open",
            }, None)
            result = self.post_plan(months, price_id)
            self.assertEqual(result.status_code, 201)
            order = CreditPurchase.objects.get(pk=result.json()["id"])
            self.assertEqual((order.plan_months, order.amount, order.credits, order.plan_starts_at), (months, amount, 400, None))
            params = self.sessions.create.call_args.args[0]
            self.assertEqual(params["line_items"], [{"price": price_id, "quantity": 1}])
            self.assertEqual(params["success_url"], f"https://topiq.example.invalid/plans?purchase={order.pk}")
            self.assertEqual(self.post_plan(months, price_id).status_code, 200)
            self.assertEqual(self.post_attempt(price_id).status_code, 409)
        self.assertEqual(self.sessions.create.call_count, 3)
        self.customers.create.assert_called_once()
        result = self.client.post(PORTAL, {"from": "plans"}, content_type="application/json", HTTP_X_CSRFTOKEN=self.csrf)
        self.assertEqual(result.status_code, 200)
        self.assertEqual(self.portals.create.call_args.args[0]["return_url"], "https://topiq.example.invalid/plans")

    def test_plan_rejects_wrong_amount_type_and_stale_or_missing_prices(self):
        for months in (True, "1", 2):
            self.assertEqual(self.post_plan(months, "price_one").status_code, 400)
        for change in ({"unit_amount": 7500}, {"type": "recurring"}):
            self.prices.retrieve.return_value = stripe_price(**({"id": "price_one", "unit_amount": 9900,
                                                               "unit_amount_decimal": "9900"} | change))
            self.assertEqual(self.post_plan(1, "price_one").status_code, 503)
        self.prices.retrieve.return_value = stripe_price(id="price_one", unit_amount=9900, unit_amount_decimal="9900")
        self.assertEqual(self.post_plan(1, "price_six").status_code, 409)
        with self.settings(STRIPE_PLAN_PRICE_IDS={}):
            self.assertEqual(self.post_plan(1, "price_one").status_code, 503)
            self.assertIsNone(self.client.get("/api/plans/").json()["plans"][0]["priceId"])
        self.sessions.create.assert_not_called()
        self.assertFalse(CreditPurchase.objects.exists())

    def test_plan_webhooks_calendar_renewal_and_expiry(self):
        # Jan 31, 00:30 in Seoul is still Jan 30 in UTC.
        paid_at = datetime(2026, 1, 30, 15, 30, tzinfo=UTC)
        first_end = datetime(2026, 2, 27, 15, 30, tzinfo=UTC)
        final_end = datetime(2026, 5, 27, 15, 30, tzinfo=UTC)
        for months, amount, start, end, payment in [(1, 9900, paid_at, first_end, paid_at),
                                                     (3, 23900, first_end, final_end, paid_at + timedelta(days=1))]:
            order = CreditPurchase.objects.create(user=self.user, attempt_id=uuid.uuid4(), amount=amount, credits=400,
                                                  plan_months=months, stripe_session_id=f"cs_plan_{months}")
            args = {"created": int(payment.timestamp()), "id": order.stripe_session_id, "amount_total": amount}
            self.assertEqual(post_webhook(self.client, order, payment_status="unpaid", **args).status_code, 200)
            order.refresh_from_db()
            self.assertIsNone(order.plan_starts_at)
            for _ in range(2):
                self.assertEqual(post_webhook(self.client, order, **args).status_code, 200)
            order.refresh_from_db()
            self.assertEqual((order.plan_starts_at, order.plan_ends_at), (start, end))
        for date, active in [(paid_at - timedelta(seconds=1), False), (paid_at, True), (first_end, True), (final_end, False)]:
            with patch("accounts.plans.timezone.now", return_value=date):
                data = self.client.get("/api/plans/").json()
            self.assertEqual(data["active"], active)
            self.assertEqual(data["endsAt"], final_end.isoformat().replace("+00:00", "Z") if active else None)
        self.assert_wallet(950, 0)
        self.assertEqual(CreditTransaction.objects.filter(kind="plan_bonus", amount=400).count(), 2)

    def test_expired_plan_session_gives_no_credits_or_access(self):
        order = CreditPurchase.objects.create(user=self.user, attempt_id=uuid.uuid4(), amount=9900, credits=400,
                                              plan_months=1, stripe_session_id=SESSION_ID)
        self.assertEqual(post_webhook(self.client, order, "checkout.session.expired", amount_total=9900,
                                      status="expired", payment_status="unpaid").status_code, 200)
        order.refresh_from_db()
        self.assertEqual((order.status, order.plan_ends_at, order.transaction_id), ("expired", None, None))
        self.assertFalse(self.client.get("/api/plans/").json()["active"])
        self.assert_wallet(150, 0)

    def test_quote_uses_configured_stripe_price_and_never_creates_order(self):
        self.assertEqual(Client().get(PRICE).status_code, 401)
        self.prices.retrieve.assert_not_called()
        response = self.client.get(PRICE)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"priceId": PRICE_ID, "amount": AMOUNT, "currency": "krw", "credits": 1000})
        self.prices.retrieve.assert_called_once_with(PRICE_ID)
        self.sessions.create.assert_not_called()
        self.assertFalse(CreditPurchase.objects.exists())

    def test_unavailable_or_unsupported_price_blocks_new_checkout(self):
        for fields in ({"active": False}, {"type": "recurring"}, {"currency": "usd"},
                       {"billing_scheme": "tiered"}, {"unit_amount": None}, {"unit_amount": 0},
                       {"unit_amount_decimal": "7500.5"}, {"custom_unit_amount": {"minimum": 100}},
                       {"transform_quantity": {"divide_by": 2, "round": "up"}}):
            with self.subTest(fields=fields):
                self.prices.retrieve.return_value = stripe_price(**fields)
                self.assertEqual(self.client.get(PRICE).status_code, 503)
                self.assertEqual(self.post_attempt().status_code, 503)
        self.prices.retrieve.side_effect = stripe.APIConnectionError("fixture connection failure")
        self.assertEqual(self.client.get(PRICE).status_code, 503)
        self.assertEqual(self.post_attempt().status_code, 503)
        self.sessions.create.assert_not_called()
        self.assertFalse(CreditPurchase.objects.exists())

    def test_price_change_requires_redisplay_before_checkout(self):
        updated_id = "price_UpdatedCreditTopUp"
        with self.settings(STRIPE_PRICE_ID=updated_id):
            self.prices.retrieve.return_value = stripe_price(id=updated_id, unit_amount=6000, unit_amount_decimal="6000")
            stale = self.post_attempt()
            self.assertEqual(stale.status_code, 409)
            self.assertEqual(stale.json()["error"], "price_changed")
            self.sessions.create.assert_not_called()
            self.assertFalse(CreditPurchase.objects.exists())
            self.assertEqual(self.client.get(PRICE).json(), {
                "priceId": updated_id, "amount": 6000, "currency": "krw", "credits": 1000,
            })
            self.assertEqual(self.post_attempt(updated_id).status_code, 201)
            order = CreditPurchase.objects.get()
            self.assertEqual((order.stripe_price_id, order.amount), (updated_id, 6000))

    def test_missing_price_configuration_leaves_wallet_readable(self):
        with self.settings(STRIPE_PRICE_ID=""):
            self.assertEqual(self.client.get(PRICE).status_code, 503)
            self.assertEqual(self.client.get("/api/credits/").json()["balance"], 150)
            self.assertEqual(self.client.get("/api/credits/transactions/").status_code, 200)
        self.prices.retrieve.assert_not_called()

    def test_create_and_retry_same_attempt_reuse_one_checkout(self):
        order = self.new_order()
        result = self.post_attempt()
        self.assertIn(result.status_code, (200, 201))
        self.assertEqual(result.json(), {"id": str(order.pk), "status": "pending", "checkoutUrl": CHECKOUT_URL})
        self.assertEqual(CreditPurchase.objects.count(), 1)
        self.assertEqual((order.user_id, order.stripe_session_id, order.amount, order.currency, order.credits,
                          order.stripe_price_id), (self.user.pk, SESSION_ID, AMOUNT, "krw", 1000, PRICE_ID))
        self.sessions.create.assert_called_once()
        params = self.sessions.create.call_args.args[0]
        self.assertNotIn("payment_method_types", params)
        self.assertEqual(params["currency"], "krw")
        self.assertEqual(params["customer"], "cus_fixture_owner")
        self.assertEqual(params["invoice_creation"], {"enabled": True})
        self.assertEqual(params["line_items"], [{"price": PRICE_ID, "quantity": 1}])
        self.assertEqual(params["success_url"], f"https://topiq.example.invalid/credits?purchase={order.pk}")
        self.assertEqual(params["cancel_url"], params["success_url"] + "&cancelled=1")
        self.assert_wallet(150, 0)

    def test_customer_creation_reuses_its_key_after_a_lost_response_on_a_different_order(self):
        self.customers.create.side_effect = [
            stripe.APIConnectionError("fixture lost response"), self.customers.create.return_value,
        ]
        self.assertEqual(self.post_attempt().status_code, 503)
        self.sessions.create.assert_not_called()
        self.attempt_id = str(uuid.uuid4())
        self.new_order()
        first, second = self.customers.create.call_args_list
        self.assertEqual(first, second)
        self.assertIn("idempotency_key", first.kwargs["options"])

    def test_existing_checkout_without_customer_can_resume_and_credit(self):
        order = CreditPurchase.objects.create(user=self.user, attempt_id=self.attempt_id, amount=AMOUNT,
                                              stripe_price_id=PRICE_ID, stripe_session_id=SESSION_ID)
        self.assertEqual(self.post_attempt().json()["checkoutUrl"], CHECKOUT_URL)
        self.sessions.retrieve.assert_called_once_with(SESSION_ID)
        self.customers.create.assert_not_called()
        self.sessions.create.assert_not_called()
        self.assertEqual(post_webhook(self.client, order).status_code, 200)
        self.assert_wallet(1150, 1)

    def test_lost_pre_portal_checkout_response_uses_original_idempotency_key(self):
        order = CreditPurchase.objects.create(user=self.user, attempt_id=self.attempt_id, amount=AMOUNT,
                                              stripe_price_id=PRICE_ID)
        self.sessions.create.side_effect = [
            stripe.IdempotencyError("fixture parameter mismatch", http_status=400), self.sessions.create.return_value,
        ]
        self.assertEqual(self.post_attempt().json()["checkoutUrl"], CHECKOUT_URL)
        modern, legacy = self.sessions.create.call_args_list
        self.assertEqual(modern.kwargs, legacy.kwargs)
        self.assertEqual(legacy.kwargs["options"]["idempotency_key"], str(order.pk))
        self.assertNotIn("invoice_creation", legacy.args[0])
        self.assertNotIn("customer", legacy.args[0])
        self.assertEqual(post_webhook(self.client, order).status_code, 200)
        self.assert_wallet(1150, 1)

    def test_portal_uses_only_the_signed_in_customer_and_fixed_return_url(self):
        def post(data):
            return self.client.post(PORTAL, data, content_type="application/json", HTTP_X_CSRFTOKEN=self.csrf)

        self.assertEqual(Client().post(PORTAL, {}, content_type="application/json").status_code, 401)
        self.assertEqual(self.client.post(PORTAL, {}, content_type="application/json").status_code, 403)
        self.assertEqual(self.client.get(PORTAL).status_code, 405)
        self.assertEqual(post({"customer": "cus_fixture_other"}).status_code, 400)
        self.assertEqual(post({"return_url": "https://example.invalid"}).status_code, 400)
        self.assertEqual(post({}).json(), {"portalUrl": None})
        self.customers.create.assert_not_called()
        self.portals.create.assert_not_called()
        self.new_order()
        other = get_user_model().objects.create_user(username="another-portal-owner")
        CreditAccount.objects.create(user=other, stripe_customer_id="cus_fixture_other")
        for user, customer in [(self.user, "cus_fixture_owner"), (other, "cus_fixture_other")]:
            self.client.force_login(user)
            self.csrf = self.client.get("/api/csrf/").json()["csrfToken"]
            with self.settings(STRIPE_PRICE_ID="", STRIPE_WEBHOOK_SECRET=""):
                response = post({})
            self.assertEqual(response.json(), {"portalUrl": self.portals.create.return_value.url})
            self.assertIn("no-store", response["Cache-Control"])
            self.portals.create.assert_called_with({"customer": customer, "return_url": "https://topiq.example.invalid/credits"})
        self.portals.create.side_effect = stripe.APIConnectionError("fixture portal unavailable")
        self.assertEqual(post({}).status_code, 503)

    def test_lost_stripe_response_retries_original_price_even_after_setting_changes(self):
        session = self.sessions.create.return_value
        self.sessions.create.side_effect = [stripe.APIConnectionError("synthetic connection loss"), session]
        self.assertGreaterEqual(self.post_attempt().status_code, 500)
        self.prices.retrieve.reset_mock()
        with self.settings(STRIPE_PRICE_ID="price_UpdatedCreditTopUp"):
            order = self.new_order()
            conflict = self.post_attempt("price_UpdatedCreditTopUp")
            self.assertEqual(conflict.status_code, 409)
        self.prices.retrieve.assert_not_called()
        self.assertEqual(CreditPurchase.objects.count(), 1)
        first, second = self.sessions.create.call_args_list
        self.assertEqual(first, second)
        self.assertEqual(first.kwargs["options"]["idempotency_key"], str(order.pk))
        with self.settings(STRIPE_PRICE_ID="price_UpdatedCreditTopUp"):
            self.assertEqual(post_webhook(self.client, order).status_code, 200)
        self.assert_wallet(1150, 1)

    def test_retry_of_archived_price_requires_new_confirmation_after_definitive_rejection(self):
        self.sessions.create.side_effect = [
            stripe.APIConnectionError("fixture connection failure"),
            stripe.InvalidRequestError("fixture invalid return URL", "success_url", http_status=400),
            stripe.InvalidRequestError("fixture archived price", "line_items[0][price]", http_status=400),
        ]
        self.assertEqual(self.post_attempt().status_code, 503)
        old_order = CreditPurchase.objects.get()
        self.assertIsNone(old_order.stripe_session_id)
        updated_id = "price_UpdatedCreditTopUp"
        with self.settings(STRIPE_PRICE_ID=updated_id):
            self.assertEqual(self.post_attempt().status_code, 503)
            rejected = self.post_attempt()
            self.assertEqual(rejected.status_code, 409)
            self.assertEqual(rejected.json()["error"], "price_changed")
            self.assertEqual(CreditPurchase.objects.count(), 1)
            self.assert_wallet(150, 0)
            self.prices.retrieve.return_value = stripe_price(id=updated_id)
            self.sessions.create.side_effect = None
            self.attempt_id = str(uuid.uuid4())
            self.assertEqual(self.post_attempt(updated_id).status_code, 201)
            self.assertEqual(self.sessions.create.call_args.args[0]["line_items"], [{"quantity": 1, "price": updated_id}])

    def test_order_does_not_accept_client_supplied_price_or_quantity(self):
        for field, value in (("amount", 1), ("credits", 2000), ("currency", "usd")):
            with self.subTest(field=field):
                response = self.client.post(PURCHASES, {"attemptId": self.attempt_id, "priceId": PRICE_ID, field: value},
                                            content_type="application/json", HTTP_X_CSRFTOKEN=self.csrf)
                self.assertEqual(response.status_code, 400)
        self.sessions.create.assert_not_called()
        self.assertFalse(CreditPurchase.objects.exists())

    def test_authentication_csrf_and_order_ownership(self):
        payload = {"attemptId": self.attempt_id, "priceId": PRICE_ID}
        response = self.client.post(PURCHASES, payload, content_type="application/json")
        self.assertEqual(response.status_code, 403)
        guest = Client()
        self.assertEqual(guest.post(PURCHASES, payload, content_type="application/json").status_code, 401)
        self.assertFalse(CreditPurchase.objects.exists())
        order = self.new_order()
        path = f"{PURCHASES}{order.pk}/"
        self.assertEqual(self.client.get(path).json(), {"id": str(order.pk), "status": "pending"})
        self.assertEqual(guest.get(path).status_code, 401)
        guest.force_login(get_user_model().objects.create_user(username="another-owner"))
        self.assertEqual(guest.get(path).status_code, 404)

    def test_paid_webhooks_credit_once_without_browser_return(self):
        order = self.new_order()
        for _ in range(2):
            response = post_webhook(Client(enforce_csrf_checks=True), order)
            self.assertEqual(response.status_code, 200)
        self.assert_wallet(1150, 1)
        order.refresh_from_db()
        entry = CreditTransaction.objects.get(pk=order.transaction_id)
        self.assertEqual((entry.amount, entry.balance_after, entry.reserved_after), (1000, 1150, 20))
        self.assertEqual(self.client.get(f"{PURCHASES}{order.pk}/").json()["status"], "fulfilled")
        self.assertEqual(self.client.get("/api/credits/transactions/").json()["transactions"][0]["kind"], "purchase")

    def test_two_separate_paid_orders_credit_the_same_wallet_twice(self):
        first = self.new_order()
        self.attempt_id = str(uuid.uuid4())
        second_session = "cs_test_second_credit_purchase"
        self.sessions.create.return_value = stripe.checkout.Session.construct_from({
            "id": second_session, "url": f"https://checkout.stripe.com/c/pay/{second_session}", "status": "open",
        }, None)
        second = self.new_order()
        self.customers.create.assert_called_once()
        self.assertEqual([call.args[0]["customer"] for call in self.sessions.create.call_args_list],
                         ["cus_fixture_owner", "cus_fixture_owner"])
        self.assertNotEqual(first.pk, second.pk)
        for order in (first, second):
            self.assertEqual(post_webhook(self.client, order, id=order.stripe_session_id).status_code, 200)
        self.assert_wallet(2150, 2)
        self.assertEqual(CreditPurchase.objects.filter(user=self.user, status="fulfilled").count(), 2)

    def test_only_a_signed_matching_paid_session_can_credit(self):
        order = self.new_order()
        for changes in ({"signing_secret": "incorrect-test-signature"}, {"currency": "usd"},
                        {"amount_total": 5000}, {"id": "cs_unrelated_session"}):
            with self.subTest(changes=tuple(changes)):
                self.assertEqual(post_webhook(self.client, order, **changes).status_code, 400)
                self.assert_wallet(150, 0)
        self.assertEqual(post_webhook(self.client, order, payment_status="unpaid").status_code, 200)
        order.refresh_from_db()
        self.assertEqual(order.status, "pending")
        self.assert_wallet(150, 0)

    def test_expired_unpaid_session_never_credits(self):
        order = self.new_order()
        response = post_webhook(self.client, order, "checkout.session.expired", status="expired", payment_status="unpaid")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.client.get(f"{PURCHASES}{order.pk}/").json()["status"], "expired")
        self.assert_wallet(150, 0)

    def test_failed_ledger_insert_rolls_back_and_webhook_can_be_retried(self):
        order = self.new_order()
        with patch.object(CreditTransaction.objects, "create", side_effect=DatabaseError("synthetic ledger failure")):
            result = post_webhook(Client(raise_request_exception=False), order)
        self.assertGreaterEqual(result.status_code, 500)
        self.assert_wallet(150, 0)
        order.refresh_from_db()
        self.assertEqual(order.status, "pending")
        self.assertIsNone(order.transaction_id)
        self.assertEqual(post_webhook(self.client, order).status_code, 200)
        self.assert_wallet(1150, 1)


@override_settings(**TEST_SETTINGS)
class ConcurrentCreditPurchaseTests(TransactionTestCase):
    def test_separate_simultaneous_plan_payments_extend_and_credit_once_each(self):
        user = get_user_model().objects.create_user(username="concurrent-plan-owner")
        orders = [CreditPurchase.objects.create(user=user, attempt_id=uuid.uuid4(), amount=9900, credits=400,
                                                plan_months=1, stripe_session_id=f"cs_plan_{n}") for n in (1, 2)]
        paid = int(timezone.now().timestamp())
        ready = Barrier(2, timeout=10)

        def notify(order):
            close_old_connections()
            try:
                ready.wait()
                return post_webhook(Client(), order, id=order.stripe_session_id, created=paid, amount_total=9900).status_code
            finally:
                connection.close()

        with ThreadPoolExecutor(max_workers=2) as pool:
            self.assertEqual(list(pool.map(notify, orders)), [200, 200])
        first, second = CreditPurchase.objects.order_by("plan_starts_at")
        self.assertEqual(first.plan_ends_at, second.plan_starts_at)
        self.assertEqual(CreditAccount.objects.get(user=user).balance, 800)
        self.assertEqual(CreditTransaction.objects.filter(kind="plan_bonus").count(), 2)

    def test_simultaneous_first_checkouts_share_one_stripe_customer(self):
        user = get_user_model().objects.create_user(username="concurrent-portal-owner")
        CreditPurchase.objects.create(user=user, attempt_id=uuid.uuid4(), amount=AMOUNT, stripe_price_id=PRICE_ID)
        ready = Barrier(2, timeout=10)
        customers = Mock()
        customers.create.return_value.id = "cus_concurrent_fixture"

        def get_customer(_):
            close_old_connections()
            try:
                ready.wait()
                return checkout_customer(user.pk, customers)
            finally:
                connection.close()

        with ThreadPoolExecutor(max_workers=2) as pool:
            self.assertEqual(list(pool.map(get_customer, range(2))), ["cus_concurrent_fixture"] * 2)
        customers.create.assert_called_once()
        self.assertEqual(CreditAccount.objects.get(user=user).stripe_customer_id, "cus_concurrent_fixture")

    def test_simultaneous_completed_events_post_a_single_ledger_entry(self):
        user = get_user_model().objects.create_user(username="concurrent-purchase-owner")
        order = CreditPurchase.objects.create(user=user, attempt_id=uuid.uuid4(), stripe_price_id=PRICE_ID,
                                              amount=AMOUNT, currency="krw",
                                              credits=1000, status="pending", stripe_session_id=SESSION_ID)
        ready = Barrier(2, timeout=10)

        def notify(_):
            close_old_connections()
            try:
                ready.wait()
                return post_webhook(Client(), order).status_code
            finally:
                connection.close()

        with ThreadPoolExecutor(max_workers=2) as pool:
            self.assertEqual(list(pool.map(notify, range(2))), [200, 200])
        self.assertEqual(CreditAccount.objects.get(user=user).balance, 1000)
        self.assertEqual(CreditTransaction.objects.filter(kind="purchase").count(), 1)
        order.refresh_from_db()
        self.assertEqual(order.status, "fulfilled")
