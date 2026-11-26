from datetime import UTC, datetime, timedelta
from unittest.mock import Mock, patch
from uuid import uuid4

import stripe
from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.test import TestCase, override_settings

from accounts.credits import account_with_monthly_credits
from accounts.models import CreditAccount, CreditPurchase, CreditTransaction, PlusFreeTrial
from accounts.payments import checkout
from accounts.plans import current_plan, has_active_plan, open_subscription
from accounts.refunds import resolve_refund_purchase, revoke_refunded_plan, save_refund
from accounts.subscriptions import apply_paid_invoice, sync_subscription

from .test_credit_purchases import TEST_SETTINGS, plan_invoice, plan_price, signed_event


class TrialLifecycleTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username="new-trial")
        self.account = CreditAccount.objects.create(user=self.user, stripe_customer_id="cus_fixture_owner")
        self.order = CreditPurchase.objects.create(user=self.user, attempt_id=uuid4(), plan_months=1,
            currency="krw", amount=9900, credits=400, stripe_price_id="price_one", subscription_state="checkout")
        self.start = datetime.now(UTC).replace(microsecond=0) - timedelta(minutes=1)
        self.end = self.start + timedelta(days=7)
        self.trial = PlusFreeTrial.objects.create(purchase=self.order, user=self.user, status="reserved",
            card_fingerprint_digest="f" * 64, consented_at=self.start, consent_version="v1", agreed_trial_ends_at=self.end)
        self.subscription = {
            "id": "sub_fixture", "customer": self.account.stripe_customer_id, "status": "trialing",
            "metadata": {"credit_purchase_id": str(self.order.pk)},
            "trial_start": int(self.start.timestamp()), "trial_end": int(self.end.timestamp()),
            "items": {"data": [{"price": plan_price(1, 9900, "price_one").to_dict(), "quantity": 1}]},
        }
        self.client_factory = Mock()
        self.api = self.client_factory.return_value.v1

    def confirm(self):
        sync_subscription("trial.confirmed", self.subscription, self.client_factory)

    def update(self, **changes):
        self.api.subscriptions.retrieve.return_value.to_dict.return_value = self.subscription | changes
        sync_subscription("customer.subscription.updated", self.subscription, self.client_factory)

    def invoice(self, invoice_id, start, end, *, free=False):
        reason = "subscription_create" if free else "subscription_cycle"
        invoice = plan_invoice(self.order, invoice_id, reason, int(start.timestamp()), int(end.timestamp()))
        if free:
            invoice["amount_paid"] = invoice["lines"]["data"][0]["amount"] = 0
        return invoice

    def test_cancellation_keeps_access_until_expiry_without_a_paid_receipt(self):
        self.confirm()
        self.assertEqual(open_subscription(self.user.pk).subscription_state, "trialing")
        self.assertTrue(has_active_plan(self.user.pk))
        self.assertEqual(current_plan(self.user.pk), (1, self.end))
        self.assertEqual(account_with_monthly_credits(self.user.pk).balance, 0)
        self.update(cancel_at_period_end=True)
        self.confirm()  # Stale create response must preserve the portal cancellation.
        self.assertEqual(open_subscription(self.user.pk).subscription_state, "ending")
        with patch("accounts.plans.timezone.now", return_value=self.end):
            self.assertFalse(has_active_plan(self.user.pk))
            self.assertEqual(current_plan(self.user.pk), (None, None))
        sync_subscription("customer.subscription.deleted", self.subscription | {"status": "canceled"}, self.client_factory)
        self.assertFalse(has_active_plan(self.user.pk))
        self.assertIsNone(open_subscription(self.user.pk))
        self.assertTrue(PlusFreeTrial.objects.filter(user=self.user, status="started").exists())
        self.assertFalse(CreditTransaction.objects.exists())

    def test_paid_invoice_after_failure_then_stale_trial_invoice_credits_once(self):
        self.confirm()
        zero = self.invoice("in_trial", self.start, self.end, free=True)
        apply_paid_invoice(zero)
        self.assertFalse(CreditPurchase.objects.filter(status="fulfilled").exists())
        self.update(status="past_due")
        self.assertFalse(has_active_plan(self.user.pk))
        paid_end = self.end + timedelta(days=30)
        paid = self.invoice("in_first_paid", self.end, paid_end)
        for invoice in (paid, zero, paid):
            apply_paid_invoice(invoice)
        self.assertEqual(CreditTransaction.objects.filter(kind="plan_bonus").count(), 1)
        self.order.refresh_from_db()
        self.assertEqual((self.order.stripe_invoice_id, self.order.credited_months), ("in_first_paid", 1))
        with patch("accounts.plans.timezone.now", return_value=self.end):
            self.assertEqual(current_plan(self.user.pk), (1, paid_end))
        self.assertEqual(account_with_monthly_credits(self.user.pk).balance, 400)

    def test_refund_before_paid_notification_revokes_first_period_without_resetting_trial_history(self):
        self.confirm()
        bill = self.invoice("in_first_paid", self.end, self.end + timedelta(days=30))
        self.api.checkout.sessions.list.return_value.data = []
        payment = Mock()
        payment.to_dict.return_value = {"invoice": bill}
        self.api.invoice_payments.list.return_value.data = [payment]
        self.api.invoice_payments.list.return_value.has_more = False
        purchase, subscription = resolve_refund_purchase(self.api, "pi_paid")
        self.assertEqual(purchase.pk, self.order.pk)
        self.account.refresh_from_db()
        self.api.subscriptions.retrieve.return_value.to_dict.return_value = self.subscription | {"status": "canceled"}
        save_refund(self.account, purchase, {"id": "re_first", "status": "succeeded", "amount": 9900, "currency": "krw"},
                    api=self.api, subscription=subscription)
        apply_paid_invoice(bill)
        self.assertEqual(account_with_monthly_credits(self.user.pk).balance, 0)
        with patch("accounts.plans.timezone.now", return_value=self.end):
            self.assertFalse(has_active_plan(self.user.pk))
        self.assertTrue(PlusFreeTrial.objects.filter(user=self.user, status="started").exists())

    def test_refuses_unconfirmed_or_mismatched_terms(self):
        changed = self.subscription | {"trial_end": int(self.end.timestamp()) + 3600}
        with self.assertRaises(ValueError):
            sync_subscription("trial.confirmed", changed, self.client_factory)
        self.trial.refresh_from_db()
        self.assertEqual(self.trial.status, "reserved")
        self.trial.status = "consent"
        self.trial.save(update_fields=["status"])
        with self.assertRaises(ValueError):
            apply_paid_invoice(self.invoice("in_trial", self.start, self.end, free=True))
        self.assertFalse(has_active_plan(self.user.pk))

    def test_late_subscription_after_revocation_is_canceled_and_keeps_trial_history(self):
        CreditPurchase.objects.filter(pk=self.order.pk).update(status="expired", subscription_state="revoked")
        self.api.subscriptions.retrieve.return_value.to_dict.return_value = self.subscription
        canceled = self.subscription | {"status": "canceled"}
        self.api.subscriptions.cancel.return_value.to_dict.return_value = canceled
        sync_subscription("customer.subscription.created", self.subscription, self.client_factory)
        self.api.subscriptions.cancel.assert_called_once_with(self.subscription["id"], {"invoice_now": False, "prorate": False})
        self.assertTrue(PlusFreeTrial.objects.filter(pk=self.order.pk, status="started").exists())
        self.api.subscriptions.retrieve.return_value.to_dict.return_value = canceled
        self.confirm()  # The create response can arrive after cancellation.
        self.api.subscriptions.cancel.assert_called_once()
        self.assertFalse(has_active_plan(self.user.pk))
        invoice = self.invoice("in_late_paid", self.end, self.end + timedelta(days=30))
        apply_paid_invoice(invoice, get_api=lambda: self.api)
        self.order.refresh_from_db()
        self.assertEqual((self.order.stripe_invoice_id, self.order.subscription_state), ("in_late_paid", "revoked"))
        self.assertFalse(CreditTransaction.objects.filter(kind="plan_bonus").exists())
        with patch("accounts.plans.timezone.now", return_value=self.end):
            self.assertFalse(has_active_plan(self.user.pk))

    def test_reserved_and_started_trials_exclude_duplicate_accounts_or_cards(self):
        for existing_status in ("reserved", "started"):
            if existing_status == "started":
                self.confirm()
            other = get_user_model().objects.create_user(username=f"other-{existing_status}")
            for user, digest in ((self.user, "e" * 64), (other, self.trial.card_fingerprint_digest)):
                purchase = CreditPurchase.objects.create(user=user, attempt_id=uuid4(), plan_months=1,
                    amount=9900, credits=400, stripe_price_id="price_one")
                attempt = PlusFreeTrial.objects.create(user=user, purchase=purchase, card_fingerprint_digest=digest,
                    consent_version="v1", consented_at=self.start, agreed_trial_ends_at=self.end, status="consent")
                with self.assertRaises(IntegrityError), transaction.atomic():
                    PlusFreeTrial.objects.filter(pk=attempt.pk).update(status="reserved")


@override_settings(**TEST_SETTINGS)
class RevokedPlanCheckoutTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username="revoked-plan")
        self.account = CreditAccount.objects.create(user=self.user, stripe_customer_id="cus_fixture_owner")
        self.order = CreditPurchase.objects.create(user=self.user, attempt_id=uuid4(), plan_months=3, amount=23900,
            credits=400, stripe_price_id="price_three", subscription_state="checkout", stripe_session_id="cs_revoked")
        client = patch("accounts.payments.stripe.StripeClient")
        self.api = client.start().return_value.v1
        self.addCleanup(client.stop)
        self.session = {"id": self.order.stripe_session_id, "object": "checkout.session", "status": "open",
                        "customer": self.account.stripe_customer_id, "mode": "subscription",
                        "metadata": {"credit_purchase_id": str(self.order.pk)}}
        self.subscription = {"id": "sub_fixture", "object": "subscription", "status": "active",
                             "customer": self.account.stripe_customer_id, "metadata": self.session["metadata"]}
        self.api.subscriptions.retrieve.return_value.to_dict.return_value = self.subscription

        def cancel(subscription_id, options):
            self.subscription["status"] = "canceled"
            return stripe.Subscription.construct_from(self.subscription, None)
        self.api.subscriptions.cancel.side_effect = cancel

    def checkout(self, **changes):
        return stripe.checkout.Session.construct_from(self.session | changes, None)

    def test_revocation_closes_only_the_checkout_matching_order_and_customer(self):
        sessions = self.api.checkout.sessions
        for changes in ({"customer": "cus_other"}, {"metadata": {}}, {"id": "cs_other"}, {"mode": "payment"}):
            sessions.retrieve.return_value = self.checkout(**changes)
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                revoke_refunded_plan(self.account, self.order, self.api)
        sessions.expire.assert_not_called()
        sessions.retrieve.return_value = self.checkout()
        sessions.expire.return_value = self.checkout(status="expired")
        revoke_refunded_plan(self.account, self.order, self.api)
        sessions.expire.assert_called_once_with(self.session["id"])
        self.order.refresh_from_db()
        self.assertEqual((self.order.status, self.order.subscription_state), ("expired", "revoked"))

    def test_completion_wins_expiration_then_checkout_and_lifecycle_events_are_idempotent(self):
        sessions = self.api.checkout.sessions
        complete = self.checkout(status="complete", subscription=self.subscription["id"])
        sessions.retrieve.side_effect = [self.checkout(), complete]
        sessions.expire.side_effect = stripe.InvalidRequestError("Checkout already completed", "id")
        revoke_refunded_plan(self.account, self.order, self.api)
        for event_type, obj in (("checkout.session.completed", complete.to_dict()),
                                ("customer.subscription.created", self.subscription | {"status": "active"})):
            self.assertEqual(signed_event(self.client, event_type, obj).status_code, 200)
        self.api.subscriptions.cancel.assert_called_once()
        self.order.refresh_from_db()
        self.assertEqual(self.order.stripe_subscription_id, self.subscription["id"])
        self.assertEqual(self.order.subscription_state, "revoked")

    def test_retry_of_previously_revoked_checkout_expires_its_saved_session(self):
        CreditPurchase.objects.filter(pk=self.order.pk).update(subscription_state="revoked", status="expired")
        self.order.refresh_from_db()
        self.api.checkout.sessions.retrieve.return_value = self.checkout()
        self.api.checkout.sessions.expire.return_value = self.checkout(status="expired")
        self.assertIsNone(checkout(self.order, Mock(v1=self.api), retry=True))
        self.api.checkout.sessions.expire.assert_called_once_with(self.session["id"])
        self.api.checkout.sessions.list.assert_not_called()

    def test_retry_endpoint_reports_unavailable_if_saved_checkout_belongs_to_another_order(self):
        CreditPurchase.objects.filter(pk=self.order.pk).update(subscription_state="revoked", status="expired")
        self.api.checkout.sessions.retrieve.return_value = self.checkout(metadata={"credit_purchase_id": str(uuid4())})
        self.client.force_login(self.user)
        response = self.client.post("/api/plans/purchases/", {
            "attemptId": str(self.order.attempt_id), "months": 3, "priceId": self.order.stripe_price_id,
        }, content_type="application/json")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["error"], "payments_unavailable")
        self.api.checkout.sessions.expire.assert_not_called()
        self.api.subscriptions.cancel.assert_not_called()
        self.order.refresh_from_db()
        self.assertEqual((self.order.status, self.order.subscription_state, self.order.stripe_subscription_id),
                         ("expired", "revoked", None))

    def test_revocation_during_remote_checkout_creation_closes_new_session(self):
        self.order.stripe_session_id = None
        self.order.save(update_fields=["stripe_session_id"])
        sessions = self.api.checkout.sessions

        def create(*args, **kwargs):
            CreditPurchase.objects.filter(pk=self.order.pk).update(subscription_state="revoked", status="expired")
            return self.checkout()

        sessions.create.side_effect = create
        sessions.retrieve.return_value = self.checkout()
        sessions.expire.return_value = self.checkout(status="expired")
        self.assertIsNone(checkout(self.order, Mock(v1=self.api), retry=False))
        sessions.expire.assert_called_once_with(self.session["id"])

    def test_first_paid_invoice_cancels_revoked_subscription_once_and_preserves_receipt_without_bonus(self):
        CreditPurchase.objects.filter(pk=self.order.pk).update(subscription_state="revoked", status="expired")
        start = datetime.now(UTC) - timedelta(days=1)
        invoice = plan_invoice(self.order, "in_revoked", "subscription_create", int(start.timestamp()),
                               int((start + timedelta(days=90)).timestamp()))
        self.api.subscriptions.retrieve.return_value.to_dict.return_value = self.subscription | {"metadata": {}}
        self.assertEqual(signed_event(self.client, "invoice.paid", invoice).status_code, 400)
        self.api.subscriptions.cancel.assert_not_called()
        self.assertFalse(CreditPurchase.objects.filter(stripe_invoice_id=invoice["id"]).exists())
        self.api.subscriptions.retrieve.return_value.to_dict.return_value = self.subscription
        for _ in range(2):
            self.assertEqual(signed_event(self.client, "invoice.paid", invoice).status_code, 200)
        self.api.subscriptions.cancel.assert_called_once()
        self.order.refresh_from_db()
        self.assertEqual((self.order.status, self.order.subscription_state, self.order.credited_months),
                         ("fulfilled", "revoked", 0))
        self.assertEqual(self.order.stripe_invoice_id, invoice["id"])
        self.assertFalse(has_active_plan(self.user.pk))
        self.assertFalse(CreditTransaction.objects.exists())

    def test_late_lifecycle_event_alone_cancels_revoked_but_preserves_naturally_ended_order(self):
        for state in ("ended", "revoked"):
            CreditPurchase.objects.filter(pk=self.order.pk).update(subscription_state=state, status="expired")
            self.assertEqual(signed_event(self.client, "customer.subscription.created", self.subscription).status_code, 200)
            self.order.refresh_from_db()
            self.assertEqual(self.order.subscription_state, state)
            if state == "ended":
                self.api.subscriptions.cancel.assert_not_called()
        self.api.subscriptions.cancel.assert_called_once()

    def test_replayed_revoked_legacy_payment_cannot_restore_access_or_start_a_subscription(self):
        CreditPurchase.objects.filter(pk=self.order.pk).update(subscription_state="revoked", status="expired",
                                                              stripe_payment_intent_id="pi_legacy")
        legacy = self.session | {"mode": "payment", "status": "complete", "payment_status": "paid",
                                 "amount_total": self.order.amount, "currency": "krw", "payment_intent": "pi_legacy"}
        self.assertEqual(signed_event(self.client, "checkout.session.completed", legacy).status_code, 200)
        self.assertFalse(has_active_plan(self.user.pk))
        self.assertFalse(CreditTransaction.objects.exists())
        self.assertEqual(signed_event(self.client, "customer.subscription.created", self.subscription).status_code, 400)
        self.api.subscriptions.cancel.assert_not_called()

    @override_settings(STRIPE_SECRET_KEY="")
    def test_regular_paid_invoice_only_needs_the_signing_secret(self):
        start = datetime.now(UTC) - timedelta(days=1)
        invoice = plan_invoice(self.order, "in_regular", "subscription_create", int(start.timestamp()),
                               int((start + timedelta(days=90)).timestamp()))
        self.assertEqual(signed_event(self.client, "invoice.paid", invoice).status_code, 200)
        self.assertTrue(has_active_plan(self.user.pk))
