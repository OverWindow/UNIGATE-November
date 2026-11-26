from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Barrier
from unittest.mock import patch
from uuid import uuid4

import stripe
from django.contrib.auth import get_user_model
from django.db import close_old_connections, connection
from django.test import Client, TransactionTestCase, override_settings
from django.utils import timezone

from accounts.credits import locked_account
from accounts.models import CreditAccount, CreditPurchase, CreditPurchaseRefund, CreditTransaction
from accounts.payments import new_order
from accounts.plans import has_active_plan
from .test_credit_purchases import TEST_SETTINGS, plan_invoice, plan_price, signed_event
from .test_credit_refunds import refund_object
from .test_sync_plan_refund import page


@override_settings(**TEST_SETTINGS)
class PlanRefundScopeTests(TransactionTestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username="plan-refund-scope")
        self.account = CreditAccount.objects.create(user=self.user, stripe_customer_id="cus_fixture_owner")
        self.api = self.enterContext(patch("accounts.payments.stripe.StripeClient")).return_value.v1
        self.old = CreditPurchase.objects.create(user=self.user, attempt_id=uuid4(), amount=23900, credits=400,
            plan_months=3, stripe_price_id="price_three", subscription_state="checkout")
        self.old_bill = self.invoice(self.old, "sub_old", "in_old", days_ago=120)
        self.assertEqual(signed_event(self.client, "invoice.paid", self.old_bill).status_code, 200)
        self.remote = {"id": "sub_old", "status": "canceled", "customer": self.account.stripe_customer_id,
                       "metadata": {"credit_purchase_id": str(self.old.pk)}}
        self.assertEqual(signed_event(self.client, "customer.subscription.deleted", self.remote).status_code, 200)
        self.refund = refund_object("re_old", self.old.amount, intent="pi_old")
        self.api.checkout.sessions.list.return_value = page([])
        self.api.invoice_payments.list.return_value = page([{"invoice": self.old_bill}])
        self.api.refunds.retrieve.return_value = page([self.refund]).data[0]
        self.api.subscriptions.retrieve.side_effect = self.read_subscription
        self.api.prices.retrieve.return_value = plan_price(6, 43900, "price_six")
        self.api.checkout.sessions.create.return_value = stripe.checkout.Session.construct_from({
            "id": "cs_new", "status": "open", "url": "https://checkout.example.invalid/new",
        }, None)

    def invoice(self, order, subscription, invoice_id, *, days_ago=0, reason="subscription_create"):
        start = int((timezone.now() - timedelta(days=days_ago)).timestamp())
        bill = plan_invoice(order, invoice_id, reason, start, start + 30 * order.plan_months * 86400)
        bill["parent"]["subscription_details"]["subscription"] = subscription
        bill["lines"]["data"][0]["parent"]["subscription_item_details"]["subscription"] = subscription
        return bill

    def read_subscription(self, subscription):
        self.assertEqual(subscription, "sub_old")
        return page([self.remote]).data[0]

    def refund_status(self):
        return signed_event(Client(), "refund.created", self.refund).status_code

    def rejoin(self):
        client = Client()
        client.force_login(self.user)
        response = client.post("/api/plans/purchases/", {
            "attemptId": str(uuid4()), "priceId": "price_six", "months": 6,
        }, content_type="application/json")
        self.assertEqual(response.status_code, 201)
        return CreditPurchase.objects.get(pk=response.json()["id"])

    def pay(self, order):
        self.assertEqual(signed_event(self.client, "invoice.paid", self.invoice(order, "sub_new", "in_new")).status_code, 200)

    def assert_rejoined(self, new):
        new.refresh_from_db()
        self.old.refresh_from_db()
        self.account.refresh_from_db()
        self.assertEqual((self.old.subscription_state, new.subscription_state), ("revoked", "active"))
        self.assertEqual((new.stripe_subscription_id, new.credited_months, self.account.balance), ("sub_new", 1, 400))
        self.assertTrue(has_active_plan(self.user.pk))
        self.assertEqual(CreditPurchaseRefund.objects.filter(purchase=self.old, status="succeeded").count(), 1)
        self.assertEqual(CreditTransaction.objects.filter(kind="refund", refund_purchase=self.old).count(), 1)
        self.api.checkout.sessions.expire.assert_not_called()
        self.api.subscriptions.cancel.assert_not_called()

    def test_refund_then_rejoin(self):
        self.assertEqual(self.refund_status(), 200)
        new = self.rejoin()
        self.pay(new)
        self.assertEqual(self.refund_status(), 200)
        self.assert_rejoined(new)

    def test_rejoin_then_refund_including_separate_renewal_receipts(self):
        new = self.rejoin()
        self.pay(new)
        later = self.invoice(self.old, "sub_old", "in_old_cycle", days_ago=2, reason="subscription_cycle")
        other = self.invoice(new, "sub_new", "in_new_cycle", days_ago=-180, reason="subscription_cycle")
        for invoice in (later, other):
            self.assertEqual(signed_event(self.client, "invoice.paid", invoice).status_code, 200)
        self.api.invoices.list.return_value = page([self.old_bill, later])
        self.assertEqual(self.refund_status(), 200)
        self.api.invoices.list.assert_called_once_with({"subscription": "sub_old", "status": "paid", "limit": 100})
        self.assertEqual(CreditPurchase.objects.get(stripe_invoice_id="in_old_cycle").subscription_state, "revoked")
        self.assertIsNone(CreditPurchase.objects.get(stripe_invoice_id="in_new_cycle").subscription_state)
        self.assert_rejoined(new)

    def test_old_refund_leaves_new_checkout_open(self):
        new = self.rejoin()
        self.assertEqual(self.refund_status(), 200)
        new.refresh_from_db()
        self.assertEqual((new.status, new.subscription_state, new.stripe_session_id), ("pending", "checkout", "cs_new"))
        self.api.checkout.sessions.expire.assert_not_called()
        self.pay(new)
        self.assert_rejoined(new)

    def test_refund_rejects_mismatched_original_order(self):
        new = self.rejoin()
        self.remote["metadata"] = {"credit_purchase_id": str(new.pk)}
        self.assertEqual(self.refund_status(), 400)
        new.refresh_from_db()
        self.old.refresh_from_db()
        self.assertEqual((self.old.subscription_state, new.subscription_state), ("ended", "checkout"))
        self.assertFalse(CreditPurchaseRefund.objects.exists())
        self.api.subscriptions.cancel.assert_not_called()
        self.api.checkout.sessions.expire.assert_not_called()

    def test_concurrent_refund_and_rejoin(self):
        barrier = Barrier(2, timeout=10)

        def enter_refund(user_id):
            barrier.wait()
            return locked_account(user_id)

        def enter_rejoin(*args):
            barrier.wait()
            return new_order(*args)

        def run(action):
            close_old_connections()
            try:
                return action()
            finally:
                connection.close()

        with (patch("accounts.refunds.locked_account", side_effect=enter_refund),
              patch("accounts.payments.new_order", side_effect=enter_rejoin),
              ThreadPoolExecutor(max_workers=2) as pool):
            refund, rejoin = [pool.submit(run, action) for action in (self.refund_status, self.rejoin)]
            self.assertEqual(refund.result(timeout=20), 200)
            new = rejoin.result(timeout=20)
        self.pay(new)
        self.assert_rejoined(new)

    def test_lost_cancel_response_retries_original_subscription_once(self):
        self.remote["status"] = "active"

        def cancel(subscription, params):
            self.assertEqual(subscription, "sub_old")
            self.remote["status"] = "canceled"
            raise stripe.APIConnectionError("test response lost")

        self.api.subscriptions.cancel.side_effect = cancel
        self.assertEqual(self.refund_status(), 503)
        self.assertFalse(CreditPurchaseRefund.objects.exists())
        self.assertFalse(CreditTransaction.objects.filter(kind="refund").exists())
        for _ in range(2):
            self.assertEqual(self.refund_status(), 200)
        self.api.subscriptions.cancel.assert_called_once_with("sub_old", {"invoice_now": False, "prorate": False})
        self.assertEqual(CreditPurchaseRefund.objects.filter(purchase=self.old).count(), 1)
        self.assertEqual(CreditTransaction.objects.filter(kind="refund", refund_purchase=self.old).count(), 1)
