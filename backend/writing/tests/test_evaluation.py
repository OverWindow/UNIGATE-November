import json
import uuid
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from datetime import timedelta
from pathlib import Path
from threading import Event
from types import SimpleNamespace
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db import DatabaseError, connections
from django.test import Client, SimpleTestCase, TransactionTestCase, override_settings
from django.utils import timezone

from accounts.credits import grant
from accounts.models import CreditAccount, CreditTransaction
from writing import services
from writing.contract import build_request, empty_response, validate_response
from writing.models import Evaluation
from writing.provider import ProviderError, evaluate


FIXTURES = Path(__file__).resolve().parent / "fixtures"


def fixture(name, file):
    return json.loads((FIXTURES / str(name) / f"{file}.json").read_text(encoding="utf-8"))


def model_result(request, **kwargs):
    response = fixture(request.payload["type_slot"], "response")
    response["request_id"] = request.request_id
    return response, {"total_tokens": 100}, "fixture/resolved-model"


class ContractTests(SimpleTestCase):
    def test_answer_length_limits_for_each_question(self):
        for slot in (51, 52, 53, 54):
            limit = 200 if slot < 53 else 1000
            fields = ("a", "b") if slot < 53 else ("text",)
            inputs = fixture(slot, "input")
            answer = {field: "가" * limit for field in fields}
            with self.subTest(slot=slot, length=limit):
                request = build_request(**(inputs | {"answer": answer}))
                self.assertEqual(request.payload["answer"], answer)
            for field in fields:
                with self.subTest(slot=slot, field=field, length=limit + 1):
                    with self.assertRaises(ValueError):
                        build_request(**(inputs | {"answer": answer | {field: "가" * (limit + 1)}}))

    def test_handoff_examples_and_raw_answers_are_preserved(self):
        for name in ("51", "52", "53", "54", "empty-51", "empty-53"):
            inputs = fixture(name, "input")
            request = build_request(**inputs)
            self.assertEqual(request.payload, fixture(name, "request")["user"])
            validate_response(fixture(name, "response"), request)
            self.assertNotIn("reference_answer", request.payload)

    def test_spaced_markers_are_replaced_simultaneously(self):
        inputs = fixture("51", "input")
        inputs["question"]["passage"] = inputs["question"]["passage"].replace("(㉠)", "( ㉠ )").replace("(㉡)", "(\n㉡\t)")
        inputs["answer"] = {"a": " (㉡) ", "b": "SECOND"}
        request = build_request(**inputs)
        self.assertEqual(request.payload["answer"], inputs["answer"])
        self.assertNotIn("( ㉠ )", request.payload["completed_passage"])
        self.assertIn(" (㉡) ", request.payload["completed_passage"])
        self.assertEqual(request.payload["completed_passage"].count("SECOND"), 1)

    def test_empty_and_invalid_results(self):
        inputs = fixture("53", "input")
        request = build_request(**inputs)
        response = fixture("53", "response")
        for mutate in (lambda r: r["scores"]["language"].update(score=11),
                       lambda r: r["scores"]["content"].update(score=True),
                       lambda r: r["scores"]["content"].update(quotes=["not in original"]),
                       lambda r: r.update(request_id="0" * 64)):
            invalid = deepcopy(response)
            mutate(invalid)
            with self.assertRaises(ValueError):
                validate_response(invalid, request)
        request = build_request(**(inputs | {"answer": {"text": " \r\n\t"}}))
        self.assertEqual(validate_response(empty_response(request), request).total, 0)


@override_settings(BIZROUTER_API_KEY="synthetic", WRITING_EVALUATION_MODEL="fixture/model",
                   WRITING_EVALUATION_CREDITS={51: 3, 52: 3, 53: 5, 54: 8},
                   WRITING_EVALUATION_MAX_CONCURRENT=1, WRITING_EVALUATION_TIMEOUT_SECONDS=45)
class EvaluationTests(TransactionTestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username="writing-fixture")
        self.other = get_user_model().objects.create_user(username="writing-other")
        self.admin = get_user_model().objects.create_superuser(username="writing-admin", password="synthetic-only")
        self.client.force_login(self.user)
        grant(user_id=self.user.pk, amount=10, actor=self.admin, reason="test fixture", entry_id=uuid.uuid4())
        self.inputs = fixture(51, "input")
        self.set_id = uuid.uuid4()
        bank = patch("writing.services.complete_sets")
        bank.start().return_value.filter.return_value.exists.return_value = True
        self.addCleanup(bank.stop)
        questions = patch("writing.services.WritingQuestion.objects.filter")
        self.questions = questions.start()
        self.questions.return_value.first.return_value = SimpleNamespace(type_slot=51, content_json=self.inputs["question"])
        self.addCleanup(questions.stop)
        provider = patch("writing.services.evaluate", side_effect=model_result)
        self.provider = provider.start()
        self.addCleanup(provider.stop)

    def payload(self, **changes):
        return {"id": str(uuid.uuid4()), "setId": str(self.set_id), "typeSlot": 51,
                "answer": self.inputs["answer"], "priceVersion": services.config_data()["priceVersion"]} | changes

    def post(self, payload):
        return self.client.post("/api/writing/evaluations/", payload, content_type="application/json")

    def test_success_is_saved_and_charged_only_once(self):
        payload = self.payload()
        response = self.post(payload)
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()["totalScore"], 9)
        self.assertEqual(response.json()["chargedCredits"], 3)
        entry = Evaluation.objects.get()
        self.assertEqual(entry.answer, self.inputs["answer"])
        self.assertEqual(entry.resolved_model, "fixture/resolved-model")
        self.assertEqual(self.post(payload).status_code, 200)
        self.provider.assert_called_once()
        wallet = CreditAccount.objects.get(user=self.user)
        self.assertEqual((wallet.balance, wallet.reserved), (7, 0))
        self.assertEqual(list(CreditTransaction.objects.filter(evaluation=entry).order_by("created_at").values_list("kind", flat=True)), ["reserve", "capture"])
        with override_settings(WRITING_EVALUATION_MODEL="changed", WRITING_EVALUATION_CREDITS={51: None, 52: None, 53: None, 54: None}):
            self.assertEqual(self.post(payload).status_code, 200)

    def test_failed_call_and_invalid_response_release_reservation(self):
        for result in (ProviderError("provider_unavailable"), ([], {}, "fixture/model")):
            self.provider.side_effect = result if isinstance(result, Exception) else None
            self.provider.return_value = result
            response = self.post(self.payload())
            self.assertEqual(response.status_code, 201, response.content)
            self.assertEqual(response.json()["status"], "failed")
            self.assertEqual(response.json()["chargedCredits"], 0)
        wallet = CreditAccount.objects.get(user=self.user)
        self.assertEqual((wallet.balance, wallet.reserved), (10, 0))
        self.assertEqual(CreditTransaction.objects.filter(kind="release").count(), 2)

    def test_empty_answer_is_free_and_does_not_call_provider(self):
        response = self.post(self.payload(answer={"a": " \r\n", "b": "\t"}))
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()["totalScore"], 0)
        self.assertEqual(response.json()["creditCost"], 0)
        self.provider.assert_not_called()
        self.assertEqual(CreditTransaction.objects.count(), 1)

    def test_missing_price_is_not_free_and_price_change_requires_resubmission(self):
        payload = self.payload()
        with override_settings(WRITING_EVALUATION_CREDITS={51: None, 52: None, 53: None, 54: None}):
            self.assertEqual(self.post(payload).json()["error"], "evaluation_unavailable")
        with override_settings(WRITING_EVALUATION_CREDITS={51: 4, 52: 3, 53: 5, 54: 8}):
            self.assertEqual(self.post(payload).json()["error"], "price_changed")
        self.assertFalse(Evaluation.objects.exists())
        self.provider.assert_not_called()

    def test_insufficient_balance_does_not_store_or_call(self):
        with override_settings(WRITING_EVALUATION_CREDITS={51: 11, 52: 3, 53: 5, 54: 8}):
            response = self.post(self.payload())
        self.assertEqual(response.json()["error"], "insufficient_credits")
        self.assertFalse(Evaluation.objects.exists())
        self.provider.assert_not_called()

    def test_idempotency_conflict_and_owner_isolation(self):
        payload = self.payload()
        self.post(payload)
        self.assertEqual(self.post(payload | {"answer": {"a": "different"}}).json()["error"], "request_conflict")
        self.client.force_login(self.other)
        self.assertEqual(self.client.get(f'/api/writing/evaluations/{payload["id"]}/').status_code, 404)
        self.assertEqual(self.post(payload).status_code, 409)
        self.assertEqual(self.client.get("/api/writing/evaluations/").json()["evaluations"], [])
        self.assertEqual(self.client.get("/api/credits/transactions/").json()["transactions"], [])

    def test_authentication_and_csrf_are_required(self):
        anonymous = Client()
        for path in ("/api/writing/evaluation-config/", "/api/writing/evaluations/", "/api/credits/", "/api/credits/transactions/"):
            self.assertEqual(anonymous.get(path).status_code, 401)
        csrf_client = Client(enforce_csrf_checks=True)
        csrf_client.force_login(self.user)
        response = csrf_client.post("/api/writing/evaluations/", self.payload(), content_type="application/json")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["error"], "csrf_failed")
        self.provider.assert_not_called()

    def test_raw_answer_bounds_and_no_client_problem_or_price(self):
        for fields in ({"answer": {"a": "x" * 201}}, {"answer": {"b": "x" * 201}},
                       {"answer": {"a": True}}, {"typeSlot": True},
                       {"question": {}}, {"creditCost": 0}):
            self.assertEqual(self.post(self.payload(**fields)).status_code, 400)
        self.provider.assert_not_called()

    def test_crash_recovery_and_late_result_cannot_charge(self):
        def late(request, **kwargs):
            Evaluation.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
            self.assertEqual(self.client.get("/api/credits/").json()["reserved"], 0)
            return model_result(request)
        self.provider.side_effect = late
        response = self.post(self.payload())
        self.assertEqual(response.json()["status"], "failed")
        self.assertEqual(response.json()["error"], "evaluation_expired")
        self.assertEqual(CreditTransaction.objects.filter(kind="capture").count(), 0)
        self.assertEqual(CreditTransaction.objects.filter(kind="release").count(), 1)

    def test_result_save_failure_rolls_back_charge_then_recovers(self):
        original = Evaluation.save
        def fail_result(instance, *args, **kwargs):
            if instance.status == "succeeded":
                raise DatabaseError("synthetic")
            return original(instance, *args, **kwargs)
        with patch.object(Evaluation, "save", fail_result):
            self.assertEqual(self.post(self.payload()).status_code, 503)
        wallet = CreditAccount.objects.get(user=self.user)
        self.assertEqual((wallet.balance, wallet.reserved), (10, 3))
        self.assertFalse(CreditTransaction.objects.filter(kind="capture").exists())
        Evaluation.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
        self.assertEqual(self.client.get("/api/credits/").json(), {"balance": 10, "reserved": 0, "available": 10})

    def test_concurrent_duplicate_busy_and_insufficient_credit(self):
        entered, release = Event(), Event()
        payload = self.payload()
        def delayed(request, **kwargs):
            entered.set()
            if not release.wait(10):
                raise AssertionError("test request not released")
            return model_result(request)
        def first():
            try:
                return services.submit(user_id=self.user.pk, evaluation_id=uuid.UUID(payload["id"]),
                    set_id=self.set_id, slot=51, answer=self.inputs["answer"], price_version=payload["priceVersion"])
            finally:
                connections.close_all()
        self.provider.side_effect = delayed
        with ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(first)
            try:
                self.assertTrue(entered.wait(10))
                self.assertEqual(self.post(payload).status_code, 202)
                self.assertEqual(self.post(self.payload()).json()["error"], "evaluation_busy")
                with override_settings(WRITING_EVALUATION_MAX_CONCURRENT=2, WRITING_EVALUATION_CREDITS={51: 8, 52: 3, 53: 5, 54: 8}):
                    self.assertEqual(self.post(self.payload()).json()["error"], "insufficient_credits")
                self.assertEqual(self.client.get("/api/credits/").json()["available"], 7)
            finally:
                release.set()
            self.assertEqual(future.result(timeout=10)[0].status, "succeeded")
        self.provider.assert_called_once()

    def test_manual_grant_is_idempotent_and_admin_balances_are_read_only(self):
        grant_id = uuid.uuid4()
        kwargs = dict(user_id=self.user.pk, amount=5, actor=self.admin, reason="synthetic grant", entry_id=grant_id)
        grant(**kwargs)
        grant(**kwargs)
        self.assertEqual(CreditAccount.objects.get(user=self.user).balance, 15)
        self.client.force_login(self.admin)
        response = self.client.post(f"/admin/accounts/creditaccount/{self.user.pk}/change/", {"balance": 999})
        self.assertEqual(response.status_code, 403)
        form = {"user_id": self.user.pk, "amount": 2, "reason": "admin fixture", "grant_id": str(uuid.uuid4())}
        self.assertEqual(self.client.post("/admin/accounts/creditaccount/grant/", form).status_code, 302)
        self.assertEqual(self.client.post("/admin/accounts/creditaccount/grant/", form).status_code, 302)
        self.assertEqual(CreditAccount.objects.get(user=self.user).balance, 17)


@override_settings(BIZROUTER_API_KEY="synthetic-only")
class ProviderTests(SimpleTestCase):
    def test_transport_uses_only_server_key_and_no_retry(self):
        request = build_request(**fixture(51, "input"))
        response = {"choices": [{"finish_reason": "stop", "message": {"content": json.dumps(fixture(51, "response"))}}],
                    "model": "fixture/resolved", "usage": {"total_tokens": 12, "prompt_tokens": True, "private": "discard"}}
        with patch("writing.provider.urlopen") as send:
            send.return_value.__enter__.return_value.read1.side_effect = [json.dumps(response).encode(), b""]
            _, usage, model = evaluate(request, model="fixture/model", options={"max_tokens": 4096}, evaluation_id=uuid.uuid4(), timeout=5)
            outgoing = send.call_args.args[0]
            body = json.loads(outgoing.data)
            self.assertEqual(outgoing.full_url, "https://api.bizrouter.ai/v1/chat/completions")
            self.assertEqual(body["messages"][1]["content"], request.user)
            self.assertEqual(usage, {"total_tokens": 12})
            self.assertEqual(model, "fixture/resolved")
        with patch("writing.provider.urlopen", side_effect=TimeoutError("private")) as send:
            with self.assertRaisesRegex(ProviderError, "^provider_unavailable$"):
                evaluate(request, model="fixture/model", options={}, evaluation_id=uuid.uuid4(), timeout=5)
            send.assert_called_once()
