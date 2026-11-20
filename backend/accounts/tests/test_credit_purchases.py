import hmac
import json
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from unittest.mock import patch

import stripe
from django.contrib.auth import get_user_model
from django.db import DatabaseError, close_old_connections, connection
from django.test import Client, TestCase, TransactionTestCase, override_settings

from accounts.models import CreditAccount, CreditPurchase, CreditTransaction


PURCHASES = "/api/credits/purchases/"
PRICE = "/api/credits/price/"
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
    "TOPIQ_PUBLIC_URL": "https://topiq.example.invalid",
}


def stripe_price(**changes):
    return stripe.Price.construct_from({
        "id": PRICE_ID, "active": True, "type": "one_time", "billing_scheme": "per_unit",
        "currency": "krw", "unit_amount": AMOUNT, "unit_amount_decimal": str(AMOUNT),
        "custom_unit_amount": None, "transform_quantity": None, **changes,
    }, None)


def post_webhook(client, order, event_type="checkout.session.completed", *, signing_secret=SIGNING_SECRET, **changes):
    session = {
        "object": "checkout.session", "id": SESSION_ID, "mode": "payment",
        "metadata": {"credit_purchase_id": str(order.pk)}, "payment_status": "paid",
        "amount_total": AMOUNT, "currency": "krw", "status": "complete", **changes,
    }
    event = {"id": f"evt_{uuid.uuid4().hex}", "object": "event", "type": event_type, "data": {"object": session}}
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
        self.assertEqual(params["line_items"], [{"price": PRICE_ID, "quantity": 1}])
        self.assertEqual(params["success_url"], f"https://topiq.example.invalid/credits?purchase={order.pk}")
        self.assertEqual(params["cancel_url"], params["success_url"] + "&cancelled=1")
        self.assert_wallet(150, 0)

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
