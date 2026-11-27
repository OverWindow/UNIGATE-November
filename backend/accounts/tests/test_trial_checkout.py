from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from io import StringIO
from threading import Barrier
from unittest.mock import Mock, patch
from uuid import uuid4

import stripe
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.db import close_old_connections, connection
from django.test import TestCase, TransactionTestCase, override_settings
from django.utils import timezone

from accounts.models import CreditAccount, CreditPurchase, PlusFreeTrial
from accounts.plans import has_active_plan
from accounts.trial_checkout import CONSENT_VERSION, activate_reserved, prepare_confirmation
from .test_credit_purchases import TEST_SETTINGS, plan_invoice, plan_price, signed_event


PLANS = "/api/plans/purchases/"


@override_settings(**(TEST_SETTINGS | {"STRIPE_TRIAL_FINGERPRINT_KEY": "test-trial-comparison-key"}))
class TrialCheckoutTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username="monthly-trial-owner")
        self.customer = "cus_trial"
        self.subscription_id = "sub_trial"
        CreditAccount.objects.create(user=self.user, stripe_customer_id=self.customer)
        self.client.force_login(self.user)
        self.api = self.enterContext(patch("accounts.payments.stripe.StripeClient")).return_value.v1
        self.price = plan_price(1, 9900, "price_one")
        self.api.prices.retrieve.return_value = self.price
        self.api.checkout.sessions.create.return_value = stripe.checkout.Session.construct_from({
            "id": "cs_setup", "status": "open", "url": "https://checkout.stripe.com/c/test",
        }, None)
        self.api.subscriptions.list.return_value.auto_paging_iter.return_value = []
        self.api.subscriptions.create.side_effect = self.subscription

    def setup_order(self):
        response = self.client.post(PLANS, {
            "attemptId": str(uuid4()), "priceId": "price_one", "months": 1, "offer": "monthly_trial",
        }, content_type="application/json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["trial"]["status"], "awaiting_card")
        self.order = CreditPurchase.objects.get(pk=response.json()["id"])
        self.details = f"/api/credits/purchases/{self.order.pk}/?product=plan"
        self.metadata = {"credit_purchase_id": str(self.order.pk)}
        self.session = {"object": "checkout.session", "id": self.order.stripe_session_id, "status": "complete", "mode": "setup",
                        "metadata": self.metadata, "customer": self.customer, "setup_intent": "seti_trial"}
        self.api.checkout.sessions.retrieve.return_value = stripe.checkout.Session.construct_from(self.session, None)
        self.method = {"id": "pm_trial", "customer": self.customer, "type": "card",
                       "card": {"fingerprint": "fixture-card-identifier", "wallet": None}}
        self.api.setup_intents.retrieve.side_effect = lambda *args: stripe.SetupIntent.construct_from({
            "id": "seti_trial", "status": "succeeded", "customer": self.customer,
            "metadata": self.metadata, "payment_method": self.method,
        }, None)

    def subscription(self, params, *, options):
        return stripe.Subscription.construct_from({
            "id": self.subscription_id, "customer": self.customer, "metadata": self.metadata, "status": "trialing",
            "trial_start": int(timezone.now().timestamp()), "trial_end": params["trial_end"],
            "items": {"data": [{"quantity": 1, "price": self.price.to_dict()}]},
        }, None)

    def confirm(self, quote, **changes):
        return self.client.post(PLANS, {"action": "confirm_trial", "purchaseId": str(self.order.pk),
                                "priceId": quote["priceId"], "consentVersion": quote["consentVersion"],
                                "trialEndsAt": quote["endsAt"], **changes}, content_type="application/json")

    def test_card_setup_does_not_consume_trial_and_confirmation_creates_once(self):
        self.setup_order()
        params = self.api.checkout.sessions.create.call_args.args[0]
        self.assertEqual((params["mode"], params["allowed_payment_method_types"], params["customer"]),
                         ("setup", ["card"], self.customer))
        self.assertEqual(params["setup_intent_data"]["metadata"], self.metadata)
        self.assertNotIn("line_items", params)
        self.assertNotIn("subscription_data", params)
        self.assertEqual(signed_event(self.client, "checkout.session.completed", self.session).status_code, 200)
        quote = self.client.get(self.details).json()["trial"]
        self.assertEqual((quote["status"], quote["consentVersion"]), ("awaiting_consent", CONSENT_VERSION))
        trial = PlusFreeTrial.objects.get(pk=self.order.pk)
        self.assertEqual(len(trial.card_fingerprint_digest), 64)
        self.assertNotIn(self.method["card"]["fingerprint"], str(quote))
        self.assertFalse(has_active_plan(self.user.pk))
        self.api.subscriptions.create.assert_not_called()
        self.assertEqual(self.confirm(quote, consentVersion="obsolete").status_code, 409)
        for _ in range(2):
            result = self.confirm(quote)
            self.assertEqual(result.status_code, 200)
            self.assertEqual(result.json()["trial"]["status"], "started")
        self.api.subscriptions.create.assert_called_once()
        params = self.api.subscriptions.create.call_args.args[0]
        self.assertEqual((params["default_payment_method"], params["customer"]), ("pm_trial", self.customer))
        trial.refresh_from_db()
        self.assertEqual(params["trial_end"], int(trial.ends_at.timestamp()))
        self.assertTrue(trial.consented_at)
        self.assertTrue(has_active_plan(self.user.pk))
        self.order.refresh_from_db()
        self.assertEqual((self.order.status, self.order.subscription_state, self.order.transaction_id),
                         ("pending", "trialing", None))

    def test_stale_quote_requires_fresh_consent(self):
        self.setup_order()
        quote = self.client.get(self.details).json()["trial"]
        trial = PlusFreeTrial.objects.get(pk=self.order.pk)
        later = trial.agreed_trial_ends_at - timedelta(days=7) + timedelta(seconds=1)
        with patch("accounts.trial_checkout.timezone.now", return_value=later):
            result = self.confirm(quote)
        self.assertEqual(result.status_code, 409)
        self.assertEqual(result.json()["error"], "trial_terms_changed")
        self.assertNotEqual(quote["endsAt"], result.json()["trial"]["endsAt"])
        self.api.subscriptions.create.assert_not_called()

    def test_unusable_card_ends_only_this_attempt_and_another_account_cannot_read_it(self):
        self.setup_order()
        self.method["card"]["wallet"] = {"type": "apple_pay"}
        result = self.client.get(self.details)
        self.assertEqual((result.json()["status"], result.json()["trial"]["status"]), ("expired", "card_unavailable"))
        self.assertTrue(self.client.get("/api/plans/").json()["trialEligible"])
        other = get_user_model().objects.create_user(username="different-owner")
        self.client.force_login(other)
        self.assertEqual(self.client.get(self.details).status_code, 404)
        self.api.subscriptions.create.assert_not_called()

    def test_duplicate_card_denied_under_database_constraint(self):
        self.setup_order()
        quote = self.client.get(self.details).json()["trial"]
        trial = PlusFreeTrial.objects.get(pk=self.order.pk)
        other = get_user_model().objects.create_user(username="other-claim")
        order = CreditPurchase.objects.create(user=other, attempt_id=uuid4(), amount=9900, credits=400,
                                             plan_months=1, stripe_price_id="price_one")
        PlusFreeTrial.objects.create(purchase=order, user=other, status="reserved",
                                     card_fingerprint_digest=trial.card_fingerprint_digest, consent_version=CONSENT_VERSION,
                                     consented_at=timezone.now(), agreed_trial_ends_at=trial.agreed_trial_ends_at)
        result = self.confirm(quote)
        self.assertEqual(result.json()["trial"]["status"], "card_used")
        self.assertTrue(self.client.get("/api/plans/").json()["trialEligible"])
        self.api.subscriptions.create.assert_not_called()
        self.api.checkout.sessions.create.return_value = stripe.checkout.Session.construct_from({
            "id": "cs_replacement_card", "status": "open", "url": "https://checkout.stripe.com/c/test",
        }, None)
        self.setup_order()
        self.method["card"]["fingerprint"] = "unused-replacement"
        self.assertEqual(self.confirm(self.client.get(self.details).json()["trial"]).json()["trial"]["status"], "started")

    def test_poll_recovers_lost_creation_response_without_duplicate_or_new_consent(self):
        self.setup_order()
        quote = self.client.get(self.details).json()["trial"]
        self.api.subscriptions.create.side_effect = stripe.APIConnectionError("test connection lost")
        self.assertEqual(self.confirm(quote).status_code, 503)
        trial = PlusFreeTrial.objects.get(pk=self.order.pk)
        self.assertEqual(trial.status, "reserved")
        found = self.subscription({"trial_end": int(trial.agreed_trial_ends_at.timestamp())}, options={})
        self.api.subscriptions.list.return_value.auto_paging_iter.return_value = [found]
        self.assertEqual(self.client.get(self.details).json()["trial"]["status"], "started")
        self.api.subscriptions.create.assert_called_once()

    def test_stale_client_cannot_create_an_immediate_monthly_charge(self):
        for offer in ({}, {"offer": "monthly_paid"}):
            result = self.client.post(PLANS, {"months": 1, "priceId": "price_one", "attemptId": str(uuid4()), **offer},
                                      content_type="application/json")
            self.assertEqual((result.status_code, result.json()["error"]), (409, "trial_offer_changed"))
        self.assertFalse(CreditPurchase.objects.exists())
        self.api.checkout.sessions.create.assert_not_called()

    def test_former_quarterly_and_six_month_members_can_start_their_first_trial(self):
        end = timezone.now() - timedelta(days=1)
        for months, amount in ((3, 23900), (6, 43900)):
            with self.subTest(months=months):
                self.user = get_user_model().objects.create_user(username=f"former-paid-{months}")
                self.customer = f"cus_former_{months}"
                self.subscription_id = f"sub_former_{months}"
                CreditAccount.objects.create(user=self.user, stripe_customer_id=self.customer)
                self.client.force_login(self.user)
                CreditPurchase.objects.create(user=self.user, attempt_id=uuid4(), amount=amount, credits=400,
                    plan_months=months, stripe_price_id=f"price_{months}", stripe_invoice_id=f"in_{months}",
                    status="fulfilled", subscription_state="ended", plan_starts_at=end - timedelta(days=30 * months),
                    plan_ends_at=end, credited_months=0)
                session_id = f"cs_setup_{months}"
                self.api.checkout.sessions.create.return_value = stripe.checkout.Session.construct_from({
                    "id": session_id, "status": "open", "url": "https://checkout.stripe.com/c/test",
                }, None)
                self.assertTrue(self.client.get("/api/plans/").json()["trialEligible"])
                self.setup_order()
                self.method["card"]["fingerprint"] = f"card_{months}"
                quote = self.client.get(self.details).json()["trial"]
                self.assertEqual(self.confirm(quote).json()["trial"]["status"], "started")
                self.assertTrue(has_active_plan(self.user.pk))

    def test_used_account_can_rejoin_at_full_price_but_cannot_start_another_trial(self):
        self.setup_order()
        quote = self.client.get(self.details).json()["trial"]
        self.assertEqual(self.confirm(quote).json()["trial"]["status"], "started")
        subscription = {"object": "subscription", "id": self.subscription_id, "customer": self.customer,
                        "metadata": self.metadata, "status": "canceled"}
        self.assertEqual(signed_event(self.client, "customer.subscription.deleted", subscription).status_code, 200)
        self.method["card"]["fingerprint"] = "previously-unused-card"
        with self.settings(STRIPE_TRIAL_FINGERPRINT_KEY=""):
            catalog = self.client.get("/api/plans/").json()
        self.assertFalse(catalog["trialEligible"])
        monthly = next(offer for offer in catalog["plans"] if offer["months"] == 1)
        self.assertEqual((monthly["priceId"], monthly["trialDays"], monthly["amount"]), ("price_one", 0, 9900))
        retry = self.client.post(PLANS, {"attemptId": str(uuid4()), "priceId": "price_one", "months": 1,
                                        "offer": "monthly_trial"}, content_type="application/json")
        self.assertEqual((retry.status_code, retry.json()["error"]), (409, "trial_account_used"))
        self.api.checkout.sessions.create.assert_called_once()
        self.api.subscriptions.create.assert_called_once()

        session = stripe.checkout.Session.construct_from({
            "id": "cs_paid_monthly", "status": "open", "mode": "subscription", "url": "https://checkout.stripe.com/c/paid",
        }, None)
        self.api.checkout.sessions.create.return_value = session
        self.api.checkout.sessions.retrieve.return_value = session
        payload = {"attemptId": str(uuid4()), "priceId": "price_one", "months": 1, "offer": "monthly_paid"}
        with self.settings(STRIPE_TRIAL_FINGERPRINT_KEY=""):
            result = self.client.post(PLANS, payload, content_type="application/json")
            self.assertEqual(result.status_code, 201)
            self.assertEqual(result.json()["checkoutUrl"], session.url)
            self.assertNotIn("trial", result.json())
            for attempt in (payload, {**payload, "attemptId": str(uuid4())}):
                result_again = self.client.post(PLANS, attempt, content_type="application/json")
                self.assertEqual((result_again.status_code, result_again.json()["id"]), (200, result.json()["id"]))
        self.assertEqual(self.api.checkout.sessions.create.call_count, 2)
        params = self.api.checkout.sessions.create.call_args.args[0]
        self.assertEqual((params["mode"], params["line_items"]), ("subscription", [{"price": "price_one", "quantity": 1}]))
        self.assertNotIn("trial_period_days", params["subscription_data"])
        self.assertNotIn("trial_end", params["subscription_data"])

        stale = self.client.post(PLANS, {**payload, "offer": "monthly_trial"}, content_type="application/json")
        self.assertEqual((stale.status_code, stale.json()["error"]), (409, "trial_offer_changed"))
        command_client = "accounts.management.commands.expire_legacy_monthly_checkouts.stripe_client"
        with patch(command_client) as billing:
            billing.return_value.v1 = self.api
            call_command("expire_legacy_monthly_checkouts", stdout=StringIO())
        self.api.checkout.sessions.expire.assert_not_called()

        order = CreditPurchase.objects.get(pk=result.json()["id"])
        self.assertEqual((order.amount, order.plan_months), (9900, 1))
        self.assertFalse(has_active_plan(self.user.pk))
        start = timezone.now()
        invoice = plan_invoice(order, "in_paid_monthly", "subscription_create",
                               int(start.timestamp()), int((start + timedelta(days=30)).timestamp()))
        invoice["customer"] = self.customer
        self.assertEqual(signed_event(self.client, "invoice.paid", invoice).status_code, 200)
        self.assertTrue(has_active_plan(self.user.pk))
        self.assertEqual(CreditAccount.objects.get(user=self.user).balance, 400)
        self.assertEqual(PlusFreeTrial.objects.filter(user=self.user, status="started").count(), 1)

    def test_revoked_reservation_never_creates_a_subscription_and_releases_after_reconciliation(self):
        self.setup_order()
        quote = self.client.get(self.details).json()["trial"]
        terms = {"consentVersion": CONSENT_VERSION, "priceId": "price_one", "trialEndsAt": quote["endsAt"]}
        state, method = prepare_confirmation(self.order, terms, self.api)
        self.assertEqual(state, "new_reservation")
        CreditPurchase.objects.filter(pk=self.order.pk).update(subscription_state="revoked", status="expired")
        client = Mock(v1=self.api)
        activate_reserved(self.order, client, lambda: client, method)
        self.api.subscriptions.create.assert_not_called()
        with patch("accounts.trial_checkout.timezone.now", return_value=timezone.now() + timedelta(days=1, minutes=1)):
            self.client.get(self.details)
        self.assertEqual(PlusFreeTrial.objects.get(pk=self.order.pk).status, "closed")
        self.api.subscriptions.create.assert_not_called()


class CompetingTrialTests(TransactionTestCase):
    def test_same_card_two_users_create_only_one_subscription(self):
        trial_end = (timezone.now() + timedelta(days=7, minutes=3)).replace(microsecond=0)
        orders = []
        for index in range(2):
            user = get_user_model().objects.create_user(username=f"competing-trial-{index}")
            CreditAccount.objects.create(user=user, stripe_customer_id=f"cus_{index}")
            order = CreditPurchase.objects.create(user=user, attempt_id=uuid4(), amount=9900, credits=400,
                                                 plan_months=1, stripe_price_id="price_one", subscription_state="checkout",
                                                 stripe_session_id=f"cs_{index}")
            PlusFreeTrial.objects.create(purchase=order, user=user, status="consent", card_fingerprint_digest="a" * 64,
                                         agreed_trial_ends_at=trial_end)
            orders.append(order.pk)
        terms = {"consentVersion": CONSENT_VERSION, "priceId": "price_one", "trialEndsAt": trial_end.isoformat()}
        service = Mock()
        def subscription(params, *, options):
            return stripe.Subscription.construct_from({
                "id": "sub_winner", "items": {"data": [{"quantity": 1, "price": plan_price(1, 9900, "price_one").to_dict()}]},
                "customer": params["customer"], "metadata": params["metadata"], "status": "trialing",
                "trial_start": int(timezone.now().timestamp()), "trial_end": params["trial_end"],
            }, None)
        service.v1.subscriptions.create.side_effect = subscription
        ready = Barrier(2, timeout=10)
        def verified_card(api, session, order, customer):
            ready.wait()
            return f"pm_{customer}", "a" * 64
        def attempt(pk):
            close_old_connections()
            try:
                order = CreditPurchase.objects.get(pk=pk)
                state, method = prepare_confirmation(order, terms, service.v1)
                if state == "new_reservation":
                    activate_reserved(order, service, lambda: service, method)
            finally:
                connection.close()
        with patch("accounts.trial_checkout.setup_card", side_effect=verified_card), ThreadPoolExecutor(max_workers=2) as pool:
            list(pool.map(attempt, orders))
        self.assertCountEqual(PlusFreeTrial.objects.values_list("status", flat=True), ["started", "rejected"])
        service.v1.subscriptions.create.assert_called_once()
