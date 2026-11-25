from types import SimpleNamespace
from unittest.mock import Mock, patch

from django.test import SimpleTestCase

from accounts.credits import reconcile_purchase_refunds
from accounts.refunds import revoke_refunded_plan


class RefundPolicyTests(SimpleTestCase):
    def test_shortfall_is_forgiven_once_and_only_real_debits_are_restored(self):
        refunded = {"amount": 300}
        ledger = {"debited": 0, "restored": 0}
        refunds = Mock()
        refunds.filter.return_value.aggregate.side_effect = lambda **kw: {"total": refunded["amount"]}
        entries = Mock()
        entries.aggregate.side_effect = lambda **kw: ledger.copy()
        purchase = SimpleNamespace(status="fulfilled", amount=1000, credits=1000, credited_months=None,
                                   refunds=refunds, refund_entries=entries, refund_sources=[], save=Mock(),
                                   pending_refund_credits=0)
        account = SimpleNamespace(balance=100, reserved=20)

        def record(wallet, kind, amount, **kwargs):
            ledger["debited" if kind == "refund" else "restored"] += amount

        with patch("accounts.credits.record", side_effect=record) as write:
            reconcile_purchase_refunds(account, purchase, previous_refunded=0)
            self.assertEqual((account.balance, account.reserved, purchase.pending_refund_credits), (20, 20, 0))
            self.assertEqual(purchase.refund_sources, [])
            reconcile_purchase_refunds(account, purchase)
            self.assertEqual(write.call_count, 1)
            account.balance += 50
            reconcile_purchase_refunds(account, purchase)
            self.assertEqual(account.balance, 70)
            refunded["amount"] = 600
            reconcile_purchase_refunds(account, purchase, previous_refunded=300)
            self.assertEqual(account.balance, 20)
            self.assertEqual(purchase.refund_sources, [])
            refunded["amount"] = 300
            reconcile_purchase_refunds(account, purchase)
            self.assertEqual(account.balance, 20)
            self.assertEqual(purchase.refund_sources, [])
            refunded["amount"] = 0
            reconcile_purchase_refunds(account, purchase)
            self.assertEqual(account.balance, 150)
            self.assertEqual(ledger, {"debited": 130, "restored": 130})
            self.assertEqual(purchase.refund_sources, [])

    @patch("accounts.refunds.CreditPurchase")
    def test_plan_refund_cancels_renewal_and_revokes_periods(self, purchases):
        order = SimpleNamespace(stripe_subscription_id="sub_test")
        orders = purchases.objects.filter.return_value
        orders.filter.return_value = Mock()
        orders.filter.return_value.__iter__ = Mock(return_value=iter([order]))
        api = Mock()
        account = SimpleNamespace(stripe_customer_id="cus_test")
        api.subscriptions.retrieve.return_value.to_dict.return_value = {"id": "sub_test", "status": "active", "customer": "cus_test"}
        api.subscriptions.cancel.return_value.to_dict.return_value = {"id": "sub_test", "status": "canceled"}
        purchase = SimpleNamespace(plan_months=3, subscription_state=None, user_id=1, pk="purchase")
        revoke_refunded_plan(account, purchase, api)
        api.subscriptions.cancel.assert_called_once_with("sub_test", {"invoice_now": False, "prorate": False})
        self.assertEqual(purchase.subscription_state, "revoked")
        orders.filter.return_value.update.assert_called_once_with(subscription_state="revoked")
        revoke_refunded_plan(account, purchase, api)
        self.assertEqual(api.subscriptions.cancel.call_count, 1)

    def test_topup_refund_does_not_cancel_plus(self):
        api = Mock()
        revoke_refunded_plan(Mock(), SimpleNamespace(plan_months=None), api)
        api.subscriptions.cancel.assert_not_called()
