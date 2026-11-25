from datetime import timedelta
from io import StringIO
from unittest.mock import Mock, patch
from uuid import uuid4

import stripe
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings
from django.utils import timezone

from accounts.credits import grant, record
from accounts.models import CreditAccount, CreditPurchase, CreditPurchaseRefund, CreditTransaction
from accounts.plans import has_active_plan
from accounts.subscriptions import apply_paid_invoice
from .test_credit_purchases import TEST_SETTINGS, plan_invoice
from .test_credit_refunds import refund_object


def page(items):
    objects = [stripe.StripeObject.construct_from(item, None) for item in items]
    result = Mock(data=objects, has_more=False)
    result.auto_paging_iter.return_value = objects
    return result


@override_settings(**TEST_SETTINGS)
class SyncPlanRefundTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username="sync-fixture")
        self.wallet = CreditAccount.objects.create(user=self.user, stripe_customer_id="cus_fixture_owner")
        self.api = self.enterContext(patch("accounts.payments.stripe.StripeClient")).return_value.v1
        self.invoices = {}
        self.refunds = {}
        self.subscriptions = {}
        self.order = self.add_plan("old")
        self.refund = refund_object("re_sync", 4950, intent="pi_old")
        self.refunds["re_sync"] = self.refund
        self.api.invoice_payments.list.side_effect = self.invoice_payments
        self.api.refunds.list.side_effect = lambda params: page([
            r for r in self.refunds.values() if r["payment_intent"] == params["payment_intent"]])
        self.api.refunds.retrieve.side_effect = lambda key: page([self.refunds[key]]).data[0]
        self.api.invoices.list.side_effect = lambda params: page([
            i for i in self.invoices.values() if i["parent"]["subscription_details"]["subscription"] == params["subscription"]])
        self.api.subscriptions.retrieve.side_effect = lambda key: page([self.subscriptions[key]]).data[0]
        self.api.subscriptions.cancel.side_effect = self.cancel

    def add_plan(self, key):
        order = CreditPurchase.objects.create(user=self.user, attempt_id=uuid4(), amount=9900, credits=400,
            plan_months=1, stripe_price_id="price_test", subscription_state="checkout")
        start = int((timezone.now() - timedelta(days=2)).timestamp())
        invoice = plan_invoice(order, f"in_{key}", "subscription_create", start, start + 30 * 86400)
        sub = f"sub_{key}"
        invoice["parent"]["subscription_details"]["subscription"] = sub
        invoice["lines"]["data"][0]["parent"]["subscription_item_details"]["subscription"] = sub
        invoice["status_transitions"] = {"paid_at": start}
        self.invoices[invoice["id"]] = invoice
        self.subscriptions[sub] = {"id": sub, "customer": self.wallet.stripe_customer_id, "status": "active"}
        apply_paid_invoice(invoice)
        order.refresh_from_db()
        return order

    def invoice_payments(self, params):
        if "payment" in params:
            return page([{"invoice": params["payment"]["payment_intent"].replace("pi_", "in_")}])
        invoice = self.invoices[params["invoice"]]
        return page([{"invoice": invoice, "amount_paid": invoice["amount_paid"], "currency": "krw",
                      "payment": {"type": "payment_intent", "payment_intent": invoice["id"].replace("in_", "pi_")}}])

    def cancel(self, sub, params):
        self.subscriptions[sub]["status"] = "canceled"
        return page([self.subscriptions[sub]]).data[0]

    def run_command(self, **options):
        output = StringIO()
        call_command("sync_plan_refund", user_id=self.user.pk, stdout=output, **options)
        return output.getvalue()

    def test_preview_historical_partial_apply_and_repeat(self):
        self.refund["created"] = 1  # Predates the webhook cutoff.
        self.assertIn("차감 200크레딧", self.run_command())
        self.assertFalse(CreditPurchaseRefund.objects.exists())
        self.assertTrue(has_active_plan(self.user.pk))
        self.api.subscriptions.cancel.assert_not_called()
        self.assertIn("실제 차감 200크레딧 | 현재 Free", self.run_command(apply=True))
        self.assertIn("실제 차감 0크레딧", self.run_command(apply=True))
        self.api.subscriptions.cancel.assert_called_once_with("sub_old", {"invoice_now": False, "prorate": False})
        self.api.refunds.create.assert_not_called()
        self.assertEqual(CreditPurchaseRefund.objects.get().purchase_id, self.order.pk)
        self.assertEqual(CreditTransaction.objects.filter(kind="refund").count(), 1)
        self.wallet.refresh_from_db()
        self.assertEqual(self.wallet.balance, 200)

    def test_recorded_refund_repairs_only_old_subscription(self):
        self.order.refunds.create(stripe_refund_id="re_sync", amount=4950, currency="krw", status="succeeded")
        CreditPurchase.objects.filter(pk=self.order.pk).update(subscription_state="ended", pending_refund_credits=90)
        other = self.add_plan("new")
        self.assertIn("실제 차감 0크레딧 | 현재 Plus", self.run_command(apply=True))
        self.order.refresh_from_db()
        other.refresh_from_db()
        self.assertEqual((self.order.subscription_state, self.order.pending_refund_credits), ("revoked", 0))
        self.assertEqual(other.subscription_state, "active")
        self.assertEqual(self.subscriptions["sub_new"]["status"], "active")
        self.assertFalse(CreditTransaction.objects.filter(kind="refund").exists())

    def test_missing_refund_keeps_new_subscription_and_its_entire_bonus(self):
        CreditTransaction.objects.filter(pk=self.order.transaction_id).update(created_at=timezone.now() - timedelta(days=2))
        self.refund["created"] = int((timezone.now() - timedelta(days=1)).timestamp())
        CreditPurchase.objects.filter(pk=self.order.pk).update(subscription_state="ended")
        self.subscriptions["sub_old"]["status"] = "canceled"
        new = self.add_plan("new")
        self.refund["amount"] = self.order.amount
        self.assertIn("실제 차감 400크레딧 | 현재 Plus", self.run_command(apply=True))
        self.wallet.refresh_from_db()
        new.refresh_from_db()
        self.assertEqual((self.wallet.balance, new.subscription_state), (400, "active"))
        self.api.subscriptions.cancel.assert_not_called()

    def test_insufficient_available_credits_are_forgiven(self):
        self.wallet.refresh_from_db()
        for _ in range(3):
            self.wallet.balance -= 100
            record(self.wallet, "unlock", 100, set_id=uuid4())
        self.refund["amount"] = 9900
        self.assertIn("실제 차감 100크레딧", self.run_command(apply=True))
        grant(user_id=self.user.pk, amount=70, actor=self.user, reason="test", entry_id=uuid4())
        self.assertIn("실제 차감 0크레딧", self.run_command(apply=True))
        self.wallet.refresh_from_db()
        self.assertEqual(self.wallet.balance, 70)

    def test_later_grant_and_later_paid_renewal_stop_before_writes(self):
        grant(user_id=self.user.pk, amount=20, actor=self.user, reason="test", entry_id=uuid4())
        with self.assertRaisesMessage(CommandError, "환불 이후 적립"):
            self.run_command(apply=True)
        self.invoices["in_next"] = self.invoices["in_old"] | {
            "id": "in_next", "billing_reason": "subscription_cycle",
            "status_transitions": {"paid_at": self.refund["created"] + 1}}
        with self.assertRaisesMessage(CommandError, "환불 이후 결제"):
            self.run_command(apply=True)
        self.assertFalse(CreditPurchaseRefund.objects.exists())
        self.api.subscriptions.cancel.assert_not_called()

    def test_multiple_refunds_require_selection_and_use_cumulative_amount(self):
        self.refunds["re_other"] = self.refund | {"id": "re_other", "amount": 2475}
        self.assertIn("후보가 여러 건", self.run_command())
        with self.assertRaisesMessage(CommandError, "--refund-id"):
            self.run_command(apply=True)
        self.assertIn("실제 차감 100크레딧", self.run_command(refund_id="re_other", apply=True))
        self.assertIn("실제 차감 200크레딧", self.run_command(refund_id="re_sync", apply=True))
        self.assertIn("실제 차감 0크레딧", self.run_command(refund_id="re_sync", apply=True))

    def test_changed_refund_and_unowned_refund_fail_closed(self):
        with self.assertRaisesMessage(CommandError, "맞는 성공한 Plus 환불이 없습니다"):
            self.run_command(refund_id="re_unrelated", apply=True)
        self.api.refunds.retrieve.side_effect = lambda key: page([self.refund | {"payment_intent": "pi_other"}]).data[0]
        with self.assertRaisesMessage(CommandError, "원결제"):
            self.run_command(apply=True)
        self.assertFalse(CreditPurchaseRefund.objects.exists())
        self.api.subscriptions.cancel.assert_not_called()

    def test_charge_only_refund_uses_verified_payment(self):
        snapshot = self.refund | {"charge": "ch_old", "payment_intent": None}
        self.api.refunds.retrieve.return_value = page([snapshot]).data[0]
        self.api.refunds.retrieve.side_effect = None
        self.api.charges.retrieve.return_value = page([{"payment_intent": "pi_old"}]).data[0]
        self.assertIn("실제 차감 200크레딧", self.run_command(apply=True))

    def test_split_payment_is_rejected_before_any_writes(self):
        def split(params):
            if "payment" in params:
                return page([{"invoice": "in_old"}, {"invoice": "in_other"}])
            return self.invoice_payments(params)

        self.api.invoice_payments.list.side_effect = split
        with self.assertRaisesMessage(CommandError, "여러 청구서"):
            self.run_command(apply=True)
        self.assertFalse(CreditPurchaseRefund.objects.exists())
        self.api.subscriptions.cancel.assert_not_called()

    def test_renewal_refund_revokes_root_and_renewal_receipt(self):
        invoice = self.invoices["in_old"] | {"id": "in_cycle", "billing_reason": "subscription_cycle"}
        self.invoices["in_cycle"] = invoice
        apply_paid_invoice(invoice)
        self.refund["payment_intent"] = "pi_cycle"
        self.assertIn("권한 종료 2건", self.run_command(apply=True))
        self.assertEqual(CreditPurchase.objects.filter(subscription_state="revoked").count(), 2)
        self.assertEqual(CreditPurchaseRefund.objects.get().purchase.stripe_invoice_id, "in_cycle")

    def test_plan_refund_cancels_attached_schedule_only_when_applied(self):
        self.subscriptions["sub_old"]["schedule"] = "sub_sched_test"
        self.api.subscription_schedules.cancel.return_value = page([{"id": "sub_sched_test", "status": "canceled"}]).data[0]
        self.assertIn("자동 갱신 취소 예정", self.run_command())
        self.api.subscription_schedules.cancel.assert_not_called()
        self.assertIn("현재 Free", self.run_command(apply=True))
        self.api.subscription_schedules.cancel.assert_called_once_with("sub_sched_test", {"invoice_now": False, "prorate": False})
        self.api.subscriptions.cancel.assert_not_called()

    def test_legacy_pass_does_not_cancel_a_subscription(self):
        CreditPurchase.objects.filter(pk=self.order.pk).update(stripe_invoice_id=None, stripe_subscription_id=None,
            stripe_session_id="cs_legacy", subscription_state=None)
        self.api.checkout.sessions.retrieve.return_value = page([{
            "id": "cs_legacy", "mode": "payment", "payment_status": "paid", "amount_total": self.order.amount,
            "currency": "krw", "metadata": {"credit_purchase_id": str(self.order.pk)}, "payment_intent": "pi_old",
        }]).data[0]
        self.assertIn("실제 차감 200크레딧 | 현재 Free", self.run_command(apply=True))
        self.api.subscriptions.cancel.assert_not_called()

    def test_lost_cancellation_response_rolls_back_then_retries(self):
        def lost_response(sub, params):
            self.cancel(sub, params)
            raise stripe.APIConnectionError("test")

        self.api.subscriptions.cancel.side_effect = lost_response
        with self.assertRaisesMessage(CommandError, "Stripe 요청 실패"):
            self.run_command(apply=True)
        self.assertFalse(CreditPurchaseRefund.objects.exists())
        self.assertTrue(has_active_plan(self.user.pk))
        self.assertIn("실제 차감 200크레딧 | 현재 Free", self.run_command(apply=True))
        self.assertEqual(self.api.subscriptions.cancel.call_count, 1)
