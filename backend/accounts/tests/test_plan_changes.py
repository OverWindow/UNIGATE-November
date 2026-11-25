from copy import deepcopy
from datetime import UTC, datetime
from unittest.mock import patch
from uuid import uuid4

import stripe
from django.contrib.auth import get_user_model
from django.test import Client, TestCase, override_settings
from django.utils import timezone

from accounts.models import PLAN_AMOUNTS, CreditAccount, CreditPurchase
from accounts.plans import add_calendar_months
from accounts.tests.test_credit_purchases import TEST_SETTINGS, plan_invoice, plan_price, signed_event


CHANGE = "/api/subscriptions/me/plan-change/"


@override_settings(**TEST_SETTINGS)
class PlanChangeTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username="subscription-change-owner")
        self.wallet = CreditAccount.objects.create(user=self.user, stripe_customer_id="cus_fixture_owner")
        self.client = Client(enforce_csrf_checks=True)
        self.client.force_login(self.user)
        self.csrf = self.client.get("/api/csrf/").json()["csrfToken"]
        self.api = self.enterContext(patch("accounts.payments.stripe.StripeClient")).return_value.v1
        self.api.subscriptions.retrieve.side_effect = lambda *args: stripe.Subscription.construct_from(self.sub, None)
        self.api.prices.retrieve.side_effect = lambda price_id: next(
            plan_price(m, PLAN_AMOUNTS[m], p) for m, p in TEST_SETTINGS["STRIPE_PLAN_PRICE_IDS"].items() if p == price_id)
        self.schedules = self.api.subscription_schedules
        self.schedules.create.side_effect = self.create_schedule
        self.schedules.update.side_effect = self.update_schedule
        self.schedules.release.side_effect = self.release_schedule
        self.last_schedule_id = "sub_sched_missing"

    def paid_subscription(self, months):
        self.start = int(timezone.now().timestamp()) - 60
        self.end = int(add_calendar_months(datetime.fromtimestamp(self.start, UTC), months).timestamp())
        self.date = datetime.fromtimestamp(self.end, UTC).isoformat().replace("+00:00", "Z")
        price_id = TEST_SETTINGS["STRIPE_PLAN_PRICE_IDS"][months]
        self.order = CreditPurchase.objects.create(user=self.user, attempt_id=uuid4(), amount=PLAN_AMOUNTS[months],
            credits=400, plan_months=months, stripe_price_id=price_id, subscription_state="checkout")
        initial = plan_invoice(self.order, "in_first", "subscription_create", self.start, self.end)
        self.assertEqual(signed_event(self.client, "invoice.paid", initial).status_code, 200)
        self.sub = {"id": "sub_fixture", "object": "subscription", "status": "active", "customer": "cus_fixture_owner",
                    "metadata": {"credit_purchase_id": str(self.order.pk)}, "schedule": None,
                    "items": {"data": [{"price": plan_price(months, self.order.amount, price_id).to_dict(), "quantity": 1,
                                        "current_period_start": self.start, "current_period_end": self.end}]}}

    def create_schedule(self, params):
        self.assertEqual(params, {"from_subscription": self.sub["id"]})
        self.assertIsNone(self.sub["schedule"])
        self.sub["schedule"] = {"id": f"sub_sched_{self.schedules.create.call_count}", "customer": self.sub["customer"],
                                "subscription": self.sub["id"], "status": "active", "end_behavior": "release",
                                "current_phase": {"start_date": self.start, "end_date": self.end},
                                "phases": [{"start_date": self.start, "end_date": self.end,
                                            "items": [{"price": self.order.stripe_price_id, "quantity": 1}]}]}
        self.last_schedule_id = self.sub["schedule"]["id"]
        return stripe.SubscriptionSchedule.construct_from(self.sub["schedule"], None)

    def update_schedule(self, schedule_id, params):
        schedule = self.sub["schedule"]
        self.assertEqual(schedule_id, schedule["id"])
        self.assertEqual(params["proration_behavior"], "none")
        self.assertEqual(params["phases"][0]["start_date"], self.start)
        metadata = (schedule.get("metadata") or {}) | params.get("metadata", {})
        schedule.update(deepcopy(params), metadata=metadata)
        return stripe.SubscriptionSchedule.construct_from(schedule, None)

    def release_schedule(self, schedule_id, params):
        self.assertEqual(schedule_id, self.sub["schedule"]["id"])
        self.assertTrue(params["preserve_cancel_date"])
        self.sub["schedule"] = None

    def change(self, months, *, method="post", date=None, **fields):
        payload = {"months": months, "effectiveAt": date or self.date}
        if method == "post":
            payload["priceId"] = TEST_SETTINGS["STRIPE_PLAN_PRICE_IDS"][months]
        else:
            payload["id"] = self.last_schedule_id
        return getattr(self.client, method)(CHANGE, payload | fields, content_type="application/json", HTTP_X_CSRFTOKEN=self.csrf)

    def test_each_longer_plan_can_be_reserved_and_retried(self):
        self.paid_subscription(1)
        for months in (3, 6):
            with self.subTest(months=months):
                response = self.change(months)
                expected = {"id": self.last_schedule_id, "months": months, "effectiveAt": self.date, "amount": PLAN_AMOUNTS[months]}
                self.assertEqual(response.json(), {"scheduledChange": expected})
                self.assertEqual(self.change(months).json(), {"scheduledChange": expected})
                for path in ("/api/plans/", "/api/subscriptions/me/"):
                    summary = self.client.get(path).json()
                    self.assertEqual(summary["currentPlanMonths"], 1)
                    self.assertEqual(summary["nextBillingAt"], self.date)
                    self.assertEqual(summary["scheduledChange"], expected)
                    self.assertFalse(summary["canChangePlan"])
                self.assertEqual(self.change(months, method="delete").json(), {"scheduledChange": None})
                self.assertEqual(self.change(months, method="delete").status_code, 200)
        self.assertEqual(self.schedules.create.call_count, 2)
        self.schedules.cancel.assert_not_called()
        self.api.subscriptions.cancel.assert_not_called()
        self.assertEqual(CreditPurchase.objects.count(), 1)
        self.wallet.refresh_from_db()
        self.assertEqual(self.wallet.balance, 400)

    def test_stale_cancel_cannot_remove_an_identical_rebooking(self):
        self.paid_subscription(1)
        old_id = self.change(3).json()["scheduledChange"]["id"]
        self.assertEqual(self.change(3, method="delete").status_code, 200)
        new_id = self.change(3).json()["scheduledChange"]["id"]
        self.assertNotEqual(old_id, new_id)
        self.assertEqual(self.change(3, method="delete", id=old_id).status_code, 409)
        self.assertEqual(self.client.get("/api/subscriptions/me/").json()["scheduledChange"]["id"], new_id)

    def test_rebooking_after_interrupted_detach_gets_a_new_identity(self):
        self.paid_subscription(1)
        old_id = self.change(3).json()["scheduledChange"]["id"]
        self.schedules.release.side_effect = stripe.APIConnectionError("fixture")
        self.assertEqual(self.change(3, method="delete").status_code, 503)
        self.schedules.release.side_effect = self.release_schedule
        new_id = self.change(3).json()["scheduledChange"]["id"]
        self.assertNotEqual(old_id, new_id)
        self.assertEqual(self.change(3, method="delete", id=old_id).status_code, 409)
        self.assertEqual(self.client.get("/api/subscriptions/me/").json()["scheduledChange"]["id"], new_id)

    def test_quarterly_to_six_months_paid_invoice_uses_the_reserved_terms(self):
        self.paid_subscription(3)
        self.assertEqual(self.change(6).status_code, 200)
        future = self.sub["schedule"]["phases"][1]
        new_end = int(add_calendar_months(datetime.fromtimestamp(self.end, UTC), 6).timestamp())
        self.assertEqual((future["start_date"], future["duration"], future["proration_behavior"]),
                         (self.end, {"interval": "month", "interval_count": 6}, "none"))
        bill = plan_invoice(self.order, "in_changed", "subscription_cycle", self.end, new_end)
        bill["parent"]["subscription_details"]["metadata"] = future["metadata"]
        line = bill["lines"]["data"][0]
        bill["amount_paid"] = line["amount"] = PLAN_AMOUNTS[6]
        line["pricing"]["price_details"]["price"] = future["items"][0]["price"]
        for _ in range(2):
            self.assertEqual(signed_event(self.client, "invoice.paid", bill).status_code, 200)
        receipt = CreditPurchase.objects.get(stripe_invoice_id="in_changed")
        self.assertEqual((receipt.plan_months, receipt.amount, receipt.credited_months), (6, 43900, 0))
        self.wallet.refresh_from_db()
        self.assertEqual(self.wallet.balance, 400)

    def test_current_plan_price_date_and_other_reservation_are_protected(self):
        self.paid_subscription(3)
        self.assertEqual(self.change(1).status_code, 409)
        self.assertEqual(self.change(3).status_code, 409)
        self.assertEqual(self.change(6, priceId="price_outdated").json(), {"error": "price_changed"})
        self.assertEqual(self.change(6, date="2020-01-01T00:00:00Z").status_code, 409)
        self.assertEqual(self.change(6).status_code, 200)
        self.assertEqual(self.change(3, method="delete").status_code, 409)
        at_renewal = datetime.fromtimestamp(self.end, UTC)
        with patch("accounts.plan_changes.timezone") as clock:
            clock.now.return_value = at_renewal
            self.assertEqual(self.change(6, method="delete").status_code, 409)
            self.assertIsNone(self.client.get("/api/subscriptions/me/").json()["scheduledChange"])
        self.schedules.release.assert_not_called()
        self.assertEqual(self.schedules.update.call_count, 1)

    def test_an_interrupted_attachment_or_cancellation_can_be_retried(self):
        self.paid_subscription(1)
        self.schedules.update.side_effect = stripe.APIConnectionError("fixture")
        self.assertEqual(self.change(3).status_code, 503)
        self.schedules.update.side_effect = self.update_schedule
        self.assertEqual(self.change(3).status_code, 200)
        self.schedules.create.assert_called_once()
        self.schedules.release.side_effect = stripe.APIConnectionError("fixture")
        self.assertEqual(self.change(3, method="delete").status_code, 503)
        self.schedules.release.side_effect = self.release_schedule
        self.assertEqual(self.change(3, method="delete").status_code, 200)
        self.assertIsNone(self.sub["schedule"])

    def test_foreign_schedule_and_canceling_subscription_are_not_modified(self):
        self.paid_subscription(1)
        self.sub["cancel_at_period_end"] = True
        self.assertEqual(self.change(3).status_code, 409)
        self.sub["cancel_at_period_end"] = False
        self.create_schedule({"from_subscription": self.sub["id"]})
        self.sub["schedule"]["metadata"] = {"source": "another_app"}
        self.assertEqual(self.change(3).status_code, 409)
        self.assertEqual(self.change(3, method="delete").status_code, 409)
        self.schedules.update.assert_not_called()
        self.schedules.release.assert_not_called()

    def test_webhook_detaches_an_interrupted_cancellation(self):
        self.paid_subscription(1)
        self.assertEqual(self.change(3).status_code, 200)
        self.schedules.release.side_effect = stripe.APIConnectionError("fixture")
        self.assertEqual(self.change(3, method="delete").status_code, 503)
        self.schedules.release.side_effect = self.release_schedule
        event = {key: self.sub[key] for key in ("object", "id", "customer", "metadata")}
        self.assertEqual(signed_event(self.client, "customer.subscription.updated", event).status_code, 200)
        self.assertIsNone(self.sub["schedule"])

    def test_applied_phase_releases_the_schedule_and_keeps_the_new_cycle(self):
        self.paid_subscription(1)
        self.assertEqual(self.change(3).status_code, 200)
        schedule = self.sub["schedule"]
        future = schedule["phases"][1]
        self.sub["metadata"].update(future["metadata"])
        schedule["current_phase"] = {"start_date": self.end}
        self.schedules.retrieve.return_value = stripe.SubscriptionSchedule.construct_from(schedule, None)
        self.sub["items"]["data"][0]["price"] = plan_price(3, 23900, "price_three").to_dict()
        event = {key: self.sub[key] for key in ("object", "id", "customer", "metadata")}
        self.assertEqual(signed_event(self.client, "customer.subscription.updated", event).status_code, 200)
        self.schedules.release.assert_called_once_with(schedule["id"], {"preserve_cancel_date": True})
        self.assertIsNone(self.sub["schedule"])
        self.assertEqual(self.sub["items"]["data"][0]["price"]["id"], "price_three")
        self.schedules.cancel.assert_not_called()

    def test_migrated_phase_keeps_existing_billing_settings_and_open_ended_period(self):
        self.paid_subscription(1)
        self.create_schedule({"from_subscription": self.sub["id"]})
        original = self.sub["schedule"]["phases"][0]
        original.update(end_date=None, default_payment_method="pm_existing", metadata=self.sub["metadata"],
                        automatic_tax={"enabled": False, "disabled_reason": None})
        self.assertEqual(self.change(3).status_code, 200)
        for phase in self.sub["schedule"]["phases"]:
            self.assertEqual(phase["default_payment_method"], "pm_existing")
            self.assertEqual(phase["metadata"]["credit_purchase_id"], str(self.order.pk))
            self.assertEqual(phase["automatic_tax"], {"enabled": False})

    def test_details_and_changes_remain_private_with_stripe_unavailable(self):
        self.paid_subscription(1)
        self.assertEqual(Client().post(CHANGE).status_code, 401)
        self.assertEqual(self.client.delete(CHANGE, {}, content_type="application/json").status_code, 403)
        self.api.subscriptions.retrieve.side_effect = stripe.APIConnectionError("fixture")
        summary = self.client.get("/api/subscriptions/me/").json()
        self.assertTrue(summary["active"])
        self.assertTrue(summary["planChangeUnavailable"])
        self.assertFalse(summary["canChangePlan"])
        self.assertEqual(self.change(3).status_code, 503)
