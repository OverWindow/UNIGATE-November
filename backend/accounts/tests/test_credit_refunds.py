import time
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Barrier
from unittest.mock import Mock, patch
from uuid import uuid4

import stripe
from django.contrib.auth import get_user_model
from django.db import DatabaseError, close_old_connections, connection, transaction
from django.test import Client, TestCase, TransactionTestCase, override_settings
from django.utils import timezone

from accounts.credits import grant, locked_account, record, settle
from accounts.models import CreditAccount, CreditPurchase, CreditPurchaseRefund, CreditTransaction
from writing.models import Evaluation

from .test_credit_purchases import AMOUNT, SESSION_ID, TEST_SETTINGS, changed_plan_invoice, plan_invoice, post_webhook, signed_event


def refund_object(refund_id, amount, status="succeeded", intent="pi_topup"):
    return {"id": refund_id, "object": "refund", "payment_intent": intent, "currency": "krw",
            "amount": amount, "status": status, "created": int(time.time())}


@override_settings(**TEST_SETTINGS)
class CreditRefundTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username="refund-test")
        self.client.force_login(self.user)
        self.account = CreditAccount.objects.create(user=self.user, stripe_customer_id="cus_fixture_owner")
        self.order = CreditPurchase.objects.create(user=self.user, attempt_id=uuid4(), amount=AMOUNT, stripe_session_id=SESSION_ID)
        self.api = self.enterContext(patch("accounts.payments.stripe.StripeClient")).return_value.v1
        self.api.checkout.sessions.list.return_value.data = []
        self.api.invoice_payments.list.return_value.data = []
        self.api.subscriptions.retrieve.return_value.to_dict.return_value = {
            "id": "sub_fixture", "customer": self.account.stripe_customer_id, "status": "active",
        }
        self.api.subscriptions.cancel.return_value.to_dict.return_value = {"id": "sub_fixture", "status": "canceled"}

    def paid(self):
        self.assertEqual(post_webhook(self.client, self.order, payment_intent="pi_topup").status_code, 200)

    def notify(self, refund, event="refund.created", **snapshot):
        self.api.refunds.retrieve.return_value = stripe.Refund.construct_from(refund, None)
        self.assertEqual(signed_event(self.client, event, refund | snapshot).status_code, 200)

    def wallet(self, available, due=0, reserved=0):
        self.assertEqual(self.client.get("/api/credits/").json(), {
            "balance": available + reserved, "available": available, "reserved": reserved, "pendingRefundCredits": due,
        })

    def topup(self, suffix):
        session = f"cs_{suffix}"
        order = CreditPurchase.objects.create(user=self.user, attempt_id=uuid4(), amount=AMOUNT, stripe_session_id=session)
        self.assertEqual(post_webhook(self.client, order, id=session, payment_intent=f"pi_{suffix}").status_code, 200)
        return order

    def spend_set(self):
        with transaction.atomic():
            wallet = locked_account(self.user.pk)
            wallet.balance -= 100
            record(wallet, "unlock", 100, set_id=uuid4())

    def states(self):
        return {row["id"]: (row["remainingCredits"], row["refundState"])
                for row in self.client.get("/api/credits/purchases/").json()["purchases"]}

    def request_refund(self, order):
        return self.client.post(f"/api/credits/purchases/{order.pk}/refund/", {}, content_type="application/json")

    def configure_refund(self, status):
        def create(params, options):
            self.assertEqual(params["metadata"]["refund_attempt"], options["idempotency_key"])
            data = refund_object("re_self", params["amount"], status, params["payment_intent"])
            return stripe.Refund.construct_from(data | {"metadata": params["metadata"]}, None)

        self.api.refunds.list.return_value.auto_paging_iter.return_value = []
        self.api.refunds.create.side_effect = create

    def test_paid_first_across_orders_by_credit_time_and_refund_only_unused(self):
        grant(user_id=self.user.pk, amount=500, actor=self.user, reason="fixture", entry_id=uuid4())
        first = self.topup("first")
        self.paid()  # Older checkout, credited second.
        self.spend_set()
        self.assertEqual(self.states(), {str(first.pk): (900, "contact"), str(self.order.pk): (1000, "eligible")})
        self.assertEqual(self.request_refund(first).json()["refundState"], "contact")
        self.configure_refund("succeeded")
        self.assertEqual(self.request_refund(self.order).json()["refundState"], "refunded")
        self.assertEqual(self.request_refund(self.order).json()["refundState"], "refunded")
        self.api.refunds.create.assert_called_once()
        self.assertEqual(self.states()[str(self.order.pk)], (0, "refunded"))
        self.wallet(1400)

    def test_pending_hold_skipped_by_spending_and_released_on_failure(self):
        self.paid()
        other = self.topup("second")
        self.configure_refund("pending")
        self.assertEqual(self.request_refund(self.order).status_code, 202)
        self.order.refresh_from_db()
        attempt = str(self.order.refund_attempt_id)
        self.wallet(1000, reserved=1000)
        self.spend_set()
        self.assertEqual(self.states()[str(other.pk)], (900, "contact"))
        self.notify(refund_object("re_self", AMOUNT, "failed") | {"metadata": {"refund_attempt": attempt}}, "refund.failed")
        self.wallet(1900)
        self.assertEqual(self.states()[str(self.order.pk)], (1000, "eligible"))

    def test_unknown_result_recovered_once_and_webhook_idempotent(self):
        self.paid()
        self.configure_refund("pending")
        self.api.refunds.create.side_effect = stripe.APIConnectionError("fixture")
        self.assertEqual(self.request_refund(self.order).status_code, 503)
        self.wallet(0, reserved=1000)
        self.order.refresh_from_db()
        data = refund_object("re_lost", AMOUNT) | {"metadata": {"refund_attempt": str(self.order.refund_attempt_id)}}
        self.api.refunds.list.return_value.auto_paging_iter.return_value = [stripe.Refund.construct_from(data, None)]
        self.assertEqual(self.request_refund(self.order).json()["refundState"], "refunded")
        self.notify(data)
        self.wallet(0)
        self.api.refunds.create.assert_called_once()
        self.notify(data | {"status": "failed"}, "refund.failed")
        self.wallet(1000)
        self.assertEqual(self.states()[str(self.order.pk)], (1000, "eligible"))

    def test_refund_restores_cross_order_deductions_to_their_actual_sources(self):
        self.paid()
        for _ in range(9):
            self.spend_set()
        second = self.topup("next")
        self.notify(refund_object("re_manual", AMOUNT))
        self.assertEqual(self.states()[str(second.pk)], (100, "contact"))
        self.notify(refund_object("re_manual", AMOUNT, "failed"), "refund.failed")
        self.assertEqual(self.states(), {str(self.order.pk): (100, "contact"), str(second.pk): (1000, "eligible")})

    def test_only_owner_and_fulfilled_one_time_order(self):
        self.assertEqual(self.request_refund(self.order).status_code, 404)
        self.paid()
        other_product = CreditPurchase.objects.create(user=self.user, attempt_id=uuid4(), amount=9900,
            credits=400, plan_months=1, subscription_state="checkout", stripe_price_id="price_monthly")
        now = int(time.time())
        invoice = plan_invoice(other_product, "in_fixture", "subscription_create", now, now + 31 * 86400)
        self.assertEqual(signed_event(self.client, "invoice.paid", invoice).status_code, 200)
        self.assertEqual(self.request_refund(other_product).status_code, 404)
        self.assertEqual(set(self.states()), {str(self.order.pk)})
        other = get_user_model().objects.create_user(username="other-refund-member")
        self.client.force_login(other)
        self.assertEqual(self.states(), {})
        self.assertEqual(self.request_refund(self.order).status_code, 404)
        self.client.logout()
        self.assertEqual(self.request_refund(self.order).status_code, 401)
        self.api.refunds.create.assert_not_called()

    def test_reserved_lot_does_not_block_refund_of_another_unused_order(self):
        self.paid()
        other = self.topup("new")
        CreditAccount.objects.filter(pk=self.user.pk).update(reserved=1000)
        self.assertEqual(self.request_refund(self.order).json()["refundState"], "held")
        self.spend_set()
        self.assertEqual(self.states()[str(other.pk)], (900, "contact"))
        unused = self.topup("unused")
        self.configure_refund("succeeded")
        self.assertEqual(self.request_refund(unused).json()["refundState"], "refunded")
        self.wallet(900, reserved=1000)

    def test_verified_legacy_session_and_preexisting_stripe_refund(self):
        self.paid()
        CreditPurchase.objects.update(stripe_payment_intent_id=None)
        data = {"id": SESSION_ID, "metadata": {"credit_purchase_id": str(self.order.pk)}, "mode": "payment",
                "payment_status": "paid", "amount_total": AMOUNT, "currency": "krw", "payment_intent": "pi_topup"}
        self.api.checkout.sessions.retrieve.return_value = stripe.checkout.Session.construct_from(data, None)
        old = refund_object("re_old", AMOUNT // 2) | {"created": 1}
        self.api.refunds.list.return_value.auto_paging_iter.return_value = [stripe.Refund.construct_from(old, None)]
        self.assertEqual(self.request_refund(self.order).json()["refundState"], "contact")
        self.api.refunds.create.assert_not_called()
        self.wallet(1000)
        self.assertEqual(self.states()[str(self.order.pk)], (1000, "contact"))

    def test_cumulative_rounding_and_duplicate_deliveries(self):
        self.paid()
        first = refund_object("re_first", 4)
        self.notify(first)
        self.wallet(1000)
        second = refund_object("re_second", 4)
        self.notify(second)
        self.wallet(999)
        self.notify(first, "refund.updated")
        self.notify(refund_object("re_rest", AMOUNT - 8))
        self.wallet(0)
        history = self.client.get("/api/credits/transactions/").json()["transactions"]
        self.assertEqual([(e["kind"], e["amount"]) for e in history], [("refund", 999), ("refund", 1), ("purchase", 1000)])

    def test_early_refund_is_saved_and_reconciled_on_fulfillment(self):
        data = {"id": SESSION_ID, "metadata": {"credit_purchase_id": str(self.order.pk)}, "mode": "payment",
                "amount_total": AMOUNT, "currency": "krw", "payment_intent": "pi_topup"}
        self.api.checkout.sessions.list.return_value.data = [stripe.checkout.Session.construct_from(data, None)]
        self.notify(refund_object("re_early", AMOUNT))
        self.wallet(0)
        self.assertFalse(CreditTransaction.objects.exists())
        self.paid()
        self.paid()
        self.wallet(0)
        self.assertEqual(CreditTransaction.objects.filter(kind="refund").count(), 1)

    def test_invalid_or_unrelated_events_and_atomic_retry(self):
        self.paid()
        refund = refund_object("re_retry", AMOUNT)
        self.assertEqual(signed_event(self.client, "refund.created", refund, signing_secret="unrelated").status_code, 400)
        self.notify(refund | {"payment_intent": "pi_unrelated"})
        self.api.refunds.retrieve.assert_not_called()
        self.api.refunds.retrieve.return_value = stripe.Refund.construct_from(refund | {"currency": "usd"}, None)
        self.assertEqual(signed_event(self.client, "refund.created", refund).status_code, 400)
        self.api.refunds.retrieve.return_value = stripe.Refund.construct_from(refund, None)
        with patch.object(CreditTransaction.objects, "create", side_effect=DatabaseError("test rollback")):
            self.assertEqual(signed_event(self.client, "refund.created", refund).status_code, 503)
        self.wallet(1000)
        self.assertFalse(CreditPurchaseRefund.objects.exists())
        self.notify(refund)
        self.wallet(0)

    def test_legacy_checkout_match_requires_original_session_and_skips_old_refunds(self):
        self.paid()
        CreditPurchase.objects.update(stripe_payment_intent_id=None)
        data = {"id": SESSION_ID, "metadata": {"credit_purchase_id": str(self.order.pk)}, "mode": "payment",
                "amount_total": AMOUNT, "currency": "krw", "payment_intent": "pi_topup"}
        refund = refund_object("re_legacy", AMOUNT)
        self.notify(refund, created=1)
        self.assertFalse(CreditPurchaseRefund.objects.exists())
        self.api.checkout.sessions.list.return_value.data = [stripe.checkout.Session.construct_from(data | {"id": "cs_other"}, None)]
        self.assertEqual(signed_event(self.client, "refund.created", refund).status_code, 400)
        self.api.checkout.sessions.list.return_value.data = [stripe.checkout.Session.construct_from(data, None)]
        self.notify(refund)
        self.wallet(0)

    def test_debt_release_grant_and_failed_refund_restore_only_net_debits(self):
        self.paid()
        CreditAccount.objects.filter(pk=self.user.pk).update(balance=100, reserved=20)
        refund = refund_object("re_debt", AMOUNT * 3 // 10)
        self.notify(refund | {"status": "pending"})
        self.wallet(80, reserved=20)
        self.notify(refund, "refund.updated")
        self.wallet(0, reserved=20)
        evaluation = Evaluation.objects.create(user=self.user, set_id=uuid4(), type_slot=51, question_snapshot={},
            answer={}, credit_cost=20, status="processing", expires_at=timezone.now() + timedelta(hours=1))
        with transaction.atomic():
            settle(evaluation, success=False)
        self.wallet(20)
        grant(user_id=self.user.pk, amount=50, actor=self.user, reason="test", entry_id=uuid4())
        self.wallet(70)
        self.notify(refund | {"status": "failed"}, "refund.failed")
        self.notify(refund | {"status": "failed"}, status="succeeded")
        self.wallet(150)
        self.assertEqual(CreditTransaction.objects.get(kind="restore").amount, 80)

    @override_settings(SESSION_COOKIE_AGE=365 * 86400)
    def test_refunded_quarterly_renewal_before_invoice_and_future_months(self):
        self.client.force_login(self.user)
        base = timezone.now() - timedelta(days=3)
        original = CreditPurchase.objects.create(user=self.user, attempt_id=uuid4(), amount=23900, plan_months=3,
            credits=400, subscription_state="checkout", stripe_price_id="price_quarter")
        first = plan_invoice(original, "in_first", "subscription_create", int(base.timestamp()), int((base + timedelta(days=92)).timestamp()))
        self.assertEqual(signed_event(self.client, "invoice.paid", first).status_code, 200)
        start = base + timedelta(days=92)
        renewal = plan_invoice(original, "in_next", "subscription_cycle", int(start.timestamp()), int((start + timedelta(days=92)).timestamp()))
        payment = stripe.InvoicePayment.construct_from({"invoice": renewal}, None)
        self.api.invoice_payments.list.return_value = Mock(data=[payment], has_more=False)
        refund = refund_object("re_plan", 11950, intent="pi_renewal")
        self.notify(refund)
        self.assertFalse(self.client.get("/api/plans/").json()["active"])
        self.api.subscriptions.cancel.assert_called_once()
        self.notify(refund)
        self.api.subscriptions.cancel.assert_called_once()
        self.assertEqual(signed_event(self.client, "invoice.paid", renewal).status_code, 200)
        self.wallet(400)
        with patch("accounts.credits.timezone.now", return_value=start + timedelta(days=1)):
            self.wallet(400)  # Refund revoked both remaining periods before any renewal bonus.
        with patch("accounts.credits.timezone.now", return_value=start + timedelta(days=34)):
            self.wallet(400)
            self.notify(refund_object("re_plan_rest", 11950, intent="pi_renewal"))
            self.wallet(400)
        with patch("accounts.credits.timezone.now", return_value=start + timedelta(days=80)):
            self.wallet(400)
            self.notify(refund | {"status": "failed"}, "refund.failed")
            self.wallet(400)
        self.assertEqual(CreditPurchase.objects.filter(stripe_invoice_id="in_next").count(), 1)

    def test_refund_before_changed_invoice_revokes_scheduled_subscription(self):
        order = CreditPurchase.objects.create(user=self.user, attempt_id=uuid4(), amount=9900, plan_months=1,
            credits=400, subscription_state="checkout", stripe_price_id="price_one")
        start = timezone.now()
        bill = changed_plan_invoice(order, "in_switch", "subscription_update", 3, start, start + timedelta(days=91), start)
        self.api.invoice_payments.list.return_value = Mock(data=[stripe.InvoicePayment.construct_from({"invoice": bill}, None)],
                                                          has_more=False)
        self.api.subscriptions.retrieve.return_value.to_dict.return_value["schedule"] = "sub_sched_fixture"
        self.api.subscription_schedules.cancel.return_value.to_dict.return_value = {"id": "sub_sched_fixture", "status": "canceled"}
        self.notify(refund_object("re_change", 23900, intent="pi_switch"))
        self.assertEqual(signed_event(self.client, "invoice.paid", bill).status_code, 200)
        receipt = CreditPurchase.objects.get(stripe_invoice_id="in_switch")
        self.assertEqual((receipt.plan_months, receipt.amount, receipt.subscription_state), (3, 23900, "revoked"))
        self.api.subscription_schedules.cancel.assert_called_once_with("sub_sched_fixture", {"invoice_now": False, "prorate": False})
        self.api.subscriptions.cancel.assert_not_called()
        self.wallet(0)


@override_settings(**TEST_SETTINGS)
class ConcurrentRefundTests(TransactionTestCase):
    def test_same_refund_posts_once_under_concurrent_delivery(self):
        user = get_user_model().objects.create_user(username="refund-concurrency")
        order = CreditPurchase.objects.create(user=user, attempt_id=uuid4(), amount=AMOUNT, stripe_session_id=SESSION_ID)
        self.assertEqual(post_webhook(Client(), order, payment_intent="pi_topup").status_code, 200)
        refund = refund_object("re_concurrent", AMOUNT)
        gate = Barrier(2, timeout=10)

        def deliver(_):
            close_old_connections()
            try:
                gate.wait()
                return signed_event(Client(), "refund.created", refund).status_code
            finally:
                connection.close()

        with patch("accounts.payments.stripe.StripeClient") as client, ThreadPoolExecutor(max_workers=2) as pool:
            client.return_value.v1.refunds.retrieve.return_value = stripe.Refund.construct_from(refund, None)
            self.assertEqual(list(pool.map(deliver, range(2))), [200, 200])
        self.assertEqual(CreditAccount.objects.get(pk=user.pk).balance, 0)
        self.assertEqual(CreditTransaction.objects.filter(kind="refund").count(), 1)
