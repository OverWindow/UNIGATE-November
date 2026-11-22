import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Barrier, Event
from types import SimpleNamespace
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db import DatabaseError, IntegrityError, connections, transaction
from django.test import Client, TransactionTestCase, override_settings
from django.utils import timezone

from accounts.credits import grant
from accounts.models import CreditAccount, CreditPurchase, CreditTransaction
from writing import services
from writing.access import evaluation_usage, has_access
from writing.models import Evaluation
from writing.tests.test_evaluation import fixture, model_result


@override_settings(BIZROUTER_API_KEY="synthetic", WRITING_EVALUATION_MODEL="fixture/model",
                   PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
                   WRITING_EVALUATION_MAX_CONCURRENT=4, WRITING_EVALUATION_TIMEOUT_SECONDS=45)
class SetCreditTests(TransactionTestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username="set-owner")
        self.other = get_user_model().objects.create_user(username="set-other")
        self.client.force_login(self.user)
        grant(user_id=self.user.pk, amount=200, actor=self.other, reason="fixture", entry_id=uuid.uuid4())
        self.set_id = uuid.uuid4()
        self.path = f"/api/writing/sets/{self.set_id}/unlock/"
        bank = patch("writing.services.complete_sets")
        self.bank = bank.start()
        self.bank.return_value.filter.return_value.exists.return_value = True
        self.addCleanup(bank.stop)
        questions = patch("writing.services.WritingQuestion.objects.filter")
        self.questions = questions.start()
        self.items = [SimpleNamespace(type_slot=slot, content_json=fixture(slot, "input")["question"])
                      for slot in (51, 52, 53, 54)]
        self.questions.return_value.order_by.return_value = self.items
        self.questions.return_value.first.return_value = self.items[0]
        self.addCleanup(questions.stop)
        provider = patch("writing.services.evaluate", side_effect=model_result)
        self.provider = provider.start()
        self.addCleanup(provider.stop)

    def purchase(self):
        return self.client.post(self.path, {}, content_type="application/json")

    def submit(self, *, slot=51, set_id=None, evaluation_id=None):
        self.questions.return_value.first.return_value = self.items[slot - 51]
        return self.client.post("/api/writing/evaluations/", {
            "id": str(evaluation_id or uuid.uuid4()), "setId": str(set_id or self.set_id), "typeSlot": slot,
            "answer": fixture(slot, "input")["answer"], "priceVersion": services.config_data()["priceVersion"],
        }, content_type="application/json")

    def history(self, count, *, slot=51, status="succeeded", user=None, set_id=None, expired=False):
        now = timezone.now()
        Evaluation.objects.bulk_create([Evaluation(
            user=user or self.user, set_id=set_id or self.set_id, type_slot=slot, question_snapshot={}, answer={},
            credit_cost=0, status=status, expires_at=now + timedelta(seconds=-1 if expired else 120),
            completed_at=None if status == "processing" else now,
            result={} if status == "succeeded" else None, total_score=0 if status == "succeeded" else None,
        ) for _ in range(count)])

    def test_first_open_costs_100_and_retries_preserve_access_at_zero_balance(self):
        CreditAccount.objects.filter(user=self.user).update(balance=100)
        self.assertEqual(self.purchase().status_code, 201)
        result = self.purchase()
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()["chargedCredits"], 0)
        self.assertEqual(result.json()["credits"], {"balance": 0, "reserved": 0, "available": 0})
        self.assertEqual(CreditTransaction.objects.filter(kind="unlock").count(), 1)
        self.assertFalse(Evaluation.objects.exists())
        self.provider.assert_not_called()
        result = self.submit()
        self.assertEqual(result.status_code, 201)
        self.assertEqual(result.json()["chargedCredits"], 0)
        self.assertEqual(CreditAccount.objects.get(user=self.user).balance, 0)
        ledger = self.client.get("/api/credits/transactions/").json()["transactions"]
        self.assertEqual(next(row for row in ledger if row["kind"] == "unlock")["setId"], str(self.set_id))

    def test_insufficient_available_credits_and_invalid_prompts_never_charge(self):
        for balance, reserved in ((99, 0), (100, 1)):
            CreditAccount.objects.filter(user=self.user).update(balance=balance, reserved=reserved)
            self.assertEqual(self.purchase().json()["error"], "insufficient_credits")
            self.assertFalse(CreditTransaction.objects.filter(kind="unlock").exists())
        CreditAccount.objects.filter(user=self.user).update(balance=200, reserved=0)
        self.items[3].content_json = self.items[3].content_json | {"requirements": []}
        self.assertEqual(self.purchase().status_code, 503)
        self.assertEqual(CreditAccount.objects.get(user=self.user).balance, 200)
        self.assertFalse(CreditTransaction.objects.filter(kind="unlock").exists())
        self.provider.assert_not_called()

    def test_spending_applies_earned_months_without_a_balance_read(self):
        account = CreditAccount.objects.get(user=self.user)
        account.balance = 50
        account.save(update_fields=["balance"])
        first = CreditTransaction.objects.create(account=account, kind="plan_bonus", amount=400, balance_after=400, reserved_after=0)
        now = timezone.now()
        CreditPurchase.objects.create(user=self.user, attempt_id=uuid.uuid4(), amount=23900, credits=400,
            plan_months=3, credited_months=1, status="fulfilled", stripe_invoice_id="in_expired_plan", transaction=first,
            plan_starts_at=now - timedelta(days=100), plan_ends_at=now - timedelta(days=8))
        payment = self.purchase().json()
        self.assertEqual((payment["chargedCredits"], payment["credits"]["available"]), (100, 750))
        self.assertEqual(self.purchase().json()["credits"]["available"], 750)

    def test_plus_bonus_pays_for_four_sets_and_purchases_survive_expiry(self):
        self.client.force_login(self.other)
        now = timezone.now()
        end = now + timedelta(days=1)
        CreditPurchase.objects.create(
            user=self.other, attempt_id=uuid.uuid4(), status="fulfilled", amount=9900, credits=400,
            plan_months=1, credited_months=0, stripe_invoice_id="in_writing_plus",
            plan_starts_at=now - timedelta(days=1), plan_ends_at=end,
        )
        self.history(1, user=self.other)
        previous = Evaluation.objects.get(user=self.other)
        self.assertEqual(self.client.get(f"/api/writing/evaluations/{previous.pk}/").status_code, 200)
        self.assertEqual(self.submit().json()["error"], "set_locked")
        self.assertEqual(self.client.get("/api/credits/").json()["available"], 400)

        first = self.purchase()
        self.assertEqual(first.status_code, 201)
        self.assertEqual((first.json()["chargedCredits"], first.json()["credits"]["available"]), (100, 300))
        again = self.purchase()
        self.assertEqual(again.status_code, 200)
        self.assertEqual((again.json()["chargedCredits"], again.json()["credits"]["available"]), (0, 300))

        for remaining in (200, 100, 0):
            result = self.client.post(f"/api/writing/sets/{uuid.uuid4()}/unlock/", {}, content_type="application/json")
            self.assertEqual(result.status_code, 201)
            self.assertEqual(result.json()["credits"]["available"], remaining)
        locked = uuid.uuid4()
        denied = self.client.post(f"/api/writing/sets/{locked}/unlock/", {}, content_type="application/json")
        self.assertEqual(denied.status_code, 409)
        self.assertEqual(denied.json()["error"], "insufficient_credits")
        self.assertFalse(has_access(self.other.pk, locked))
        self.assertEqual(CreditTransaction.objects.filter(account_id=self.other.pk, kind="unlock").count(), 4)
        with patch("django.utils.timezone.now", return_value=end):
            result = self.submit()
            self.assertEqual(result.status_code, 201)
            self.assertEqual((result.json()["chargedCredits"], result.json()["usage"]["used"]), (0, 2))

    def test_missing_set_authentication_csrf_and_client_prices(self):
        self.bank.return_value.filter.return_value.exists.return_value = False
        self.assertEqual(self.purchase().status_code, 404)
        self.assertEqual(Client().post(self.path, {}, content_type="application/json").status_code, 401)
        csrf = Client(enforce_csrf_checks=True)
        csrf.force_login(self.user)
        self.assertEqual(csrf.post(self.path, {}, content_type="application/json").status_code, 403)
        self.assertEqual(self.client.get(self.path).status_code, 405)
        for body in ({"amount": 0}, {"userId": self.other.pk}, []):
            self.assertEqual(self.client.post(self.path, body, content_type="application/json").status_code, 400)
        self.assertFalse(CreditTransaction.objects.filter(kind="unlock").exists())

    def test_ledger_failure_rolls_back_balance_and_access(self):
        with patch("accounts.credits.CreditTransaction.objects.create", side_effect=DatabaseError("synthetic")):
            self.assertEqual(self.purchase().status_code, 503)
        self.assertEqual(CreditAccount.objects.get(user=self.user).balance, 200)
        self.assertFalse(CreditTransaction.objects.filter(kind="unlock").exists())

    def test_concurrent_repeated_open_charges_once_and_different_sets_cannot_overspend(self):
        def race(set_ids):
            gate = Barrier(2)
            def open_set(set_id):
                try:
                    gate.wait(timeout=10)
                    return services.unlock(user_id=self.user.pk, set_id=set_id)[0]["chargedCredits"]
                except services.EvaluationError as exc:
                    return exc.code
                finally:
                    connections.close_all()
            with ThreadPoolExecutor(max_workers=2) as pool:
                return list(pool.map(open_set, set_ids))
        self.assertCountEqual(race([self.set_id, self.set_id]), [100, 0])
        self.assertCountEqual(race([uuid.uuid4(), uuid.uuid4()]), [100, "insufficient_credits"])
        self.assertEqual(CreditAccount.objects.get(user=self.user).balance, 0)
        self.assertEqual(CreditTransaction.objects.filter(kind="unlock").count(), 2)

    def test_database_prevents_duplicate_or_invalid_unlock_transactions(self):
        self.purchase()
        entry = CreditTransaction.objects.get(kind="unlock")
        values = {"account_id": self.user.pk, "kind": "unlock", "set_id": self.set_id,
                  "amount": 100, "balance_after": 100, "reserved_after": 0}
        for changes in ({}, {"set_id": None}, {"set_id": uuid.uuid4(), "amount": 0},
                        {"set_id": uuid.uuid4(), "actor_id": self.user.pk}):
            with self.subTest(changes=tuple(changes)), self.assertRaises(IntegrityError), transaction.atomic():
                CreditTransaction.objects.create(**(values | changes))
        self.assertTrue(CreditTransaction.objects.filter(pk=entry.pk).exists())

    def test_quota_is_separate_for_each_question_set_and_user_and_replays_are_free(self):
        self.purchase()
        for slot in (51, 52, 53, 54):
            self.history(19, slot=slot)
            evaluation_id = uuid.uuid4()
            result = self.submit(slot=slot, evaluation_id=evaluation_id)
            self.assertEqual(result.status_code, 201)
            self.assertEqual(result.json()["usage"]["used"], 20)
            self.assertEqual(self.submit(slot=slot).json()["error"], "evaluation_limit_reached")
            self.assertEqual(self.submit(slot=slot, evaluation_id=evaluation_id).status_code, 200)
        self.assertEqual(self.provider.call_count, 4)
        self.assertEqual(CreditAccount.objects.get(user=self.user).balance, 100)
        other_set = uuid.uuid4()
        services.unlock(user_id=self.user.pk, set_id=other_set)
        self.assertEqual(self.submit(set_id=other_set).json()["usage"]["used"], 1)
        self.assertEqual(evaluation_usage(self.other.pk, self.set_id)["51"]["remaining"], 20)
        self.client.force_login(self.other)
        self.assertEqual(self.submit().json()["error"], "set_locked")

    def test_failed_and_expired_requests_do_not_consume_quota(self):
        self.purchase()
        self.history(19)
        self.history(3, status="failed")
        self.history(1, status="processing", expired=True)
        result = self.submit()
        self.assertEqual(result.status_code, 201)
        self.assertEqual(result.json()["usage"], {"used": 20, "pending": 0, "remaining": 0, "limit": 20})
        self.assertFalse(Evaluation.objects.filter(status="processing").exists())

    def test_last_attempt_is_reserved_across_concurrent_requests(self):
        self.purchase()
        self.history(19)
        entered, release = Event(), Event()
        def delayed(request, **kwargs):
            entered.set()
            if not release.wait(10):
                raise AssertionError("provider was not released")
            return model_result(request)
        def submit_once():
            try:
                return services.submit(user_id=self.user.pk, evaluation_id=uuid.uuid4(), set_id=self.set_id,
                    slot=51, answer=fixture(51, "input")["answer"], price_version=services.config_data()["priceVersion"])
            finally:
                connections.close_all()
        self.provider.side_effect = delayed
        with ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(submit_once)
            try:
                self.assertTrue(entered.wait(10))
                self.assertEqual(evaluation_usage(self.user.pk, self.set_id)["51"],
                                 {"used": 19, "pending": 1, "remaining": 0, "limit": 20})
                self.assertEqual(self.submit().json()["error"], "evaluation_limit_reached")
            finally:
                release.set()
            self.assertEqual(future.result(timeout=10)[0].status, "succeeded")
        self.assertEqual(Evaluation.objects.filter(status="succeeded").count(), 20)
        self.provider.assert_called_once()
