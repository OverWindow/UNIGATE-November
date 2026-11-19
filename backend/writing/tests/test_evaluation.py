import json
import uuid
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from datetime import timedelta
from pathlib import Path
from threading import Barrier, Event
from types import SimpleNamespace
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db import DatabaseError, connection, connections
from django.test import Client, SimpleTestCase, TransactionTestCase, override_settings
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from accounts.credits import grant
from accounts.models import CreditAccount, CreditTransaction
from writing import services
from writing.contract import FEEDBACK_LANGUAGES, build_request, digest, empty_response, validate_response
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
    def test_feedback_languages_preserve_scoring_inputs_and_korean_corrections(self):
        for slot in (51, 52, 53, 54):
            inputs = fixture(slot, "input")
            default = build_request(**inputs)
            request_ids = set()
            for language, name in FEEDBACK_LANGUAGES.items():
                with self.subTest(slot=slot, language=language):
                    request = build_request(**inputs, feedback_language=language)
                    request_ids.add(request.request_id)
                    self.assertEqual(request.payload["feedback_language"], language)
                    self.assertIn(f"Feedback language: {name} ({language})", request.system)
                    self.assertIn("Write corrections.suggestion in Korean", request.system)
                    for field in ("summary", "scores.*.rationale", "task_checks.*.reason", "corrections.*.reason", "review_reasons"):
                        self.assertIn(field, request.system)
                    for field in ("question", "answer", "tasks", "rubric", "score_limits", "output_schema"):
                        self.assertEqual(request.payload[field], default.payload[field])
                    response = model_result(request)[0]
                    response["summary"] = {"ko": "요청이 명확합니다.", "en": "The request is clear.",
                                           "id": "Permintaan sudah jelas."}[language]
                    response["corrections"] = [{"original": next(text for text in inputs["answer"].values() if text.strip()),
                                                "suggestion": "수정 문장입니다.", "reason": response["summary"]}]
                    result = validate_response(response, request)
                    self.assertEqual(result.corrections[0].suggestion, "수정 문장입니다.")
                    self.assertEqual(result.corrections[0].original, response["corrections"][0]["original"])
            self.assertEqual(len(request_ids), 3)

    def test_invalid_feedback_language_is_rejected(self):
        for language in (None, "", "fr", "en-US", [], {}, True):
            with self.subTest(language=language), self.assertRaises(ValueError):
                build_request(**fixture(51, "input"), feedback_language=language)

    def test_empty_feedback_is_localized_for_every_slot(self):
        for slot in (51, 52, 53, 54):
            answer = {"a": " \n", "b": "\t"} if slot < 53 else {"text": " \n"}
            for language, reason in (("ko", "미응답"), ("en", "No answer"), ("id", "Tidak ada jawaban")):
                with self.subTest(slot=slot, language=language):
                    request = build_request(**(fixture(slot, "input") | {"answer": answer}), feedback_language=language)
                    result = validate_response(empty_response(request), request)
                    self.assertEqual(result.total, 0)
                    self.assertTrue(all(score.rationale == reason for score in result.scores.values()))
                    self.assertTrue(all(check.reason == reason and check.status == "미충족" for check in result.task_checks))
                    self.assertIn({"ko": "작성된 답안", "en": "No answer", "id": "Tidak ada jawaban"}[language], result.summary)

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
                   PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
                   WRITING_EVALUATION_MAX_CONCURRENT=1, WRITING_EVALUATION_TIMEOUT_SECONDS=45)
class EvaluationTests(TransactionTestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username="writing-fixture")
        self.other = get_user_model().objects.create_user(username="writing-other")
        self.admin = get_user_model().objects.create_superuser(username="writing-admin", password="synthetic-only")
        self.client.force_login(self.user)
        grant(user_id=self.user.pk, amount=110, actor=self.admin, reason="test fixture", entry_id=uuid.uuid4())
        self.inputs = fixture(51, "input")
        self.set_id = uuid.uuid4()
        bank = patch("writing.services.complete_sets")
        bank.start().return_value.filter.return_value.exists.return_value = True
        self.addCleanup(bank.stop)
        questions = patch("writing.services.WritingQuestion.objects.filter")
        self.questions = questions.start()
        self.questions.return_value.first.return_value = SimpleNamespace(type_slot=51, content_json=self.inputs["question"])
        self.questions.return_value.order_by.return_value = [
            SimpleNamespace(type_slot=slot, content_json=fixture(slot, "input")["question"]) for slot in (51, 52, 53, 54)
        ]
        self.addCleanup(questions.stop)
        services.unlock(user_id=self.user.pk, set_id=self.set_id)
        provider = patch("writing.services.evaluate", side_effect=model_result)
        self.provider = provider.start()
        self.addCleanup(provider.stop)

    def payload(self, **changes):
        return {"id": str(uuid.uuid4()), "setId": str(self.set_id), "typeSlot": 51,
                "answer": self.inputs["answer"], "priceVersion": services.config_data()["priceVersion"]} | changes

    def post(self, payload):
        return self.client.post("/api/writing/evaluations/", payload, content_type="application/json")

    def processing_evaluation(self, user, *, expired=True, cost=0):
        return Evaluation.objects.create(
            user=user, set_id=self.set_id, type_slot=51, question_snapshot={}, answer={},
            credit_cost=cost, status="processing", expires_at=timezone.now() + timedelta(seconds=-1 if expired else 300),
        )

    def test_feedback_language_is_sent_saved_and_returned_without_repeat_charges(self):
        for language in ("ko", "en", "id"):
            with self.subTest(language=language):
                payload = self.payload(feedbackLanguage=language)
                response = self.post(payload)
                self.assertEqual(response.status_code, 201)
                self.assertEqual(response.json()["feedbackLanguage"], language)
                self.assertEqual(Evaluation.objects.get(pk=payload["id"]).feedback_language, language)
                self.assertEqual(self.provider.call_args.args[0].payload["feedback_language"], language)
                self.assertEqual(self.post(payload).status_code, 200)
                detail = self.client.get(f'/api/writing/evaluations/{payload["id"]}/').json()
                self.assertEqual(detail["feedbackLanguage"], language)
                history = self.client.get("/api/writing/evaluations/").json()["evaluations"]
                self.assertEqual(next(row for row in history if row["id"] == payload["id"])["feedbackLanguage"], language)
        self.assertEqual(self.provider.call_count, 3)
        self.assertEqual(CreditTransaction.objects.filter(kind="capture").count(), 0)
        self.assertEqual(CreditAccount.objects.get(user=self.user).balance, 10)

    def test_changed_language_for_same_id_conflicts_and_legacy_requests_default_to_korean(self):
        payload = self.payload()
        response = self.post(payload)
        self.assertEqual(response.json()["feedbackLanguage"], "ko")
        entry = Evaluation.objects.get(pk=payload["id"])
        self.assertEqual(entry.submission_hash, digest({"set": str(self.set_id), "slot": 51, "answer": entry.answer}))
        self.assertEqual(self.post(payload | {"feedbackLanguage": "ko"}).status_code, 200)
        for language in ("en", "id"):
            response = self.post(payload | {"feedbackLanguage": language})
            self.assertEqual(response.status_code, 409)
            self.assertEqual(response.json()["error"], "request_conflict")
        self.provider.assert_called_once()
        self.assertEqual(CreditTransaction.objects.filter(kind="capture").count(), 0)

    def test_invalid_feedback_languages_do_not_reserve_credits_or_call_provider(self):
        for language in (None, "", "fr", "en-US", [], {}, True, 1):
            with self.subTest(language=language):
                response = self.post(self.payload(feedbackLanguage=language))
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.json()["error"], "invalid_submission")
        self.assertFalse(Evaluation.objects.exists())
        self.assertFalse(CreditTransaction.objects.filter(kind="reserve").exists())
        self.provider.assert_not_called()

    def test_empty_answers_keep_selected_language_without_a_model_call(self):
        for language, summary in (("en", "No answer was submitted, so the score is 0."),
                                  ("id", "Tidak ada jawaban yang dikirim, sehingga nilainya 0.")):
            response = self.post(self.payload(answer={"a": "", "b": ""}, feedbackLanguage=language))
            self.assertEqual(response.json()["feedbackLanguage"], language)
            self.assertEqual(response.json()["result"]["summary"], summary)
            self.assertEqual(response.json()["chargedCredits"], 0)
        self.provider.assert_not_called()

    def test_failed_evaluation_keeps_requested_language(self):
        self.provider.side_effect = ProviderError("provider_unavailable")
        response = self.post(self.payload(feedbackLanguage="id"))
        self.assertEqual(response.json()["status"], "failed")
        self.assertEqual(response.json()["feedbackLanguage"], "id")
        self.assertEqual(response.json()["chargedCredits"], 0)

    def test_success_is_saved_once_and_included_in_set(self):
        payload = self.payload()
        response = self.post(payload)
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()["totalScore"], 9)
        self.assertEqual(response.json()["chargedCredits"], 0)
        self.assertEqual(response.json()["usage"], {"used": 1, "pending": 0, "remaining": 19, "limit": 20})
        entry = Evaluation.objects.get()
        self.assertEqual(entry.answer, self.inputs["answer"])
        self.assertEqual(entry.resolved_model, "fixture/resolved-model")
        self.assertEqual(self.post(payload).status_code, 200)
        self.provider.assert_called_once()
        wallet = CreditAccount.objects.get(user=self.user)
        self.assertEqual((wallet.balance, wallet.reserved), (10, 0))
        self.assertFalse(CreditTransaction.objects.filter(evaluation=entry).exists())
        with override_settings(WRITING_EVALUATION_MODEL=""):
            self.assertEqual(self.post(payload).status_code, 200)

    def test_failed_call_and_invalid_response_restore_quota(self):
        for result in (ProviderError("provider_unavailable"), ([], {}, "fixture/model")):
            self.provider.side_effect = result if isinstance(result, Exception) else None
            self.provider.return_value = result
            response = self.post(self.payload())
            self.assertEqual(response.status_code, 201, response.content)
            self.assertEqual(response.json()["status"], "failed")
            self.assertEqual(response.json()["chargedCredits"], 0)
            self.assertEqual(response.json()["usage"]["remaining"], 20)
        wallet = CreditAccount.objects.get(user=self.user)
        self.assertEqual((wallet.balance, wallet.reserved), (10, 0))
        self.assertEqual(CreditTransaction.objects.filter(kind="release").count(), 0)

    def test_question_image_is_saved_without_changing_grading_input(self):
        inputs = fixture(53, "input")
        image_url = "https://example.invalid/writing/53.png"
        source = inputs["question"] | {"image": {"storage_url": image_url, "storage_bucket": "hidden"}}
        self.questions.return_value.first.return_value = SimpleNamespace(type_slot=53, content_json=source)
        response = self.post(self.payload(typeSlot=53, answer=inputs["answer"]))
        self.assertEqual(response.status_code, 201, response.content)
        entry = Evaluation.objects.get()
        self.assertEqual(entry.status, "succeeded")
        self.assertEqual(entry.question_snapshot["image_url"], image_url)
        self.assertEqual(response.json()["question"]["image_url"], image_url)
        self.assertEqual(self.client.get(f"/api/writing/evaluations/{entry.pk}/").json()["question"]["image_url"], image_url)
        self.assertNotIn("image", entry.question_snapshot)
        request = self.provider.call_args.args[0]
        expected = build_request(f"writing:{self.set_id}:53", inputs["question"], inputs["answer"])
        self.assertEqual(request, expected)

    def test_empty_answer_is_free_and_does_not_call_provider(self):
        response = self.post(self.payload(answer={"a": " \r\n", "b": "\t"}))
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()["totalScore"], 0)
        self.assertEqual(response.json()["creditCost"], 0)
        self.provider.assert_not_called()
        self.assertEqual(CreditTransaction.objects.count(), 2)
        self.assertEqual(response.json()["usage"]["used"], 1)

    def test_missing_provider_and_changed_configuration_require_resubmission(self):
        payload = self.payload()
        with override_settings(WRITING_EVALUATION_MODEL=""):
            self.assertEqual(self.post(payload).json()["error"], "evaluation_unavailable")
        with override_settings(WRITING_EVALUATION_MODEL="changed/model"):
            self.assertEqual(self.post(payload).json()["error"], "price_changed")
        self.assertFalse(Evaluation.objects.exists())
        self.provider.assert_not_called()

    def test_unpurchased_set_does_not_store_or_call(self):
        response = self.post(self.payload(setId=str(uuid.uuid4())))
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["error"], "set_locked")
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
        self.assertEqual(CreditTransaction.objects.filter(kind="release").count(), 0)
        self.assertEqual(response.json()["usage"]["remaining"], 20)

    def test_ordinary_reads_take_no_locks_and_leave_other_members_expired_evaluations_alone(self):
        other = self.processing_evaluation(self.other)
        active = self.processing_evaluation(self.user, expired=False)
        for path in ("/api/credits/", "/api/credits/transactions/", "/api/writing/evaluations/",
                     f"/api/writing/evaluations/{active.pk}/"):
            with self.subTest(path=path):
                with CaptureQueriesContext(connection) as queries:
                    response = self.client.get(path)
                self.assertEqual(response.status_code, 200)
                sql = [query["sql"].upper() for query in queries]
                self.assertFalse(any("PG_ADVISORY" in statement or "FOR UPDATE" in statement for statement in sql))
                other.refresh_from_db()
                self.assertEqual(other.status, "processing")

    def test_reading_writing_history_or_detail_expires_the_owners_evaluation(self):
        other = self.processing_evaluation(self.other)
        for detail in (False, True):
            with self.subTest(detail=detail):
                entry = self.processing_evaluation(self.user)
                path = "/api/writing/evaluations/"
                response = self.client.get(f"{path}{entry.pk}/" if detail else path)
                self.assertEqual(response.status_code, 200)
                body = response.json()
                row = body if detail else next(row for row in body["evaluations"] if row["id"] == str(entry.pk))
                self.assertEqual((row["status"], row["error"]), ("failed", "evaluation_expired"))
                other.refresh_from_db()
                self.assertEqual(other.status, "processing")

    def test_concurrent_balance_and_ledger_reads_release_a_legacy_reservation_once(self):
        entry = self.processing_evaluation(self.user, cost=4)
        other = self.processing_evaluation(self.other)
        wallet = CreditAccount.objects.get(user=self.user)
        wallet.reserved = 4
        wallet.save(update_fields=["reserved"])
        CreditTransaction.objects.create(account=wallet, evaluation=entry, kind="reserve",
            amount=4, balance_after=wallet.balance, reserved_after=4)

        # Both readers must see the expired evaluation before either can settle it.
        gate = Barrier(2)
        evaluation_lock = services.evaluation_lock
        def wait_for_both_readers():
            gate.wait(timeout=10)
            return evaluation_lock()

        def read(path):
            try:
                client = Client()
                client.cookies.update(self.client.cookies)
                return client.get(path)
            finally:
                connections.close_all()

        with patch.object(services, "evaluation_lock", wait_for_both_readers), ThreadPoolExecutor(max_workers=2) as pool:
            balance, ledger = pool.map(read, ("/api/credits/", "/api/credits/transactions/"))
        self.assertEqual((balance.status_code, ledger.status_code), (200, 200))
        self.assertEqual(balance.json(), {"balance": 10, "reserved": 0, "available": 10})
        releases = [row for row in ledger.json()["transactions"] if row["kind"] == "release"]
        self.assertEqual(len(releases), 1)
        self.assertEqual((releases[0]["evaluationId"], releases[0]["amount"], releases[0]["reservedAfter"]),
                         (str(entry.pk), 4, 0))
        entry.refresh_from_db()
        self.assertEqual((entry.status, entry.error_code), ("failed", "evaluation_expired"))
        self.assertEqual(CreditTransaction.objects.filter(evaluation=entry, kind="release").count(), 1)
        other.refresh_from_db()
        self.assertEqual(other.status, "processing")

    def test_result_save_failure_keeps_pending_quota_then_recovers(self):
        original = Evaluation.save
        def fail_result(instance, *args, **kwargs):
            if instance.status == "succeeded":
                raise DatabaseError("synthetic")
            return original(instance, *args, **kwargs)
        with patch.object(Evaluation, "save", fail_result):
            self.assertEqual(self.post(self.payload()).status_code, 503)
        wallet = CreditAccount.objects.get(user=self.user)
        self.assertEqual((wallet.balance, wallet.reserved), (10, 0))
        self.assertEqual(services.evaluation_usage(self.user.pk, self.set_id)["51"]["pending"], 1)
        self.assertFalse(CreditTransaction.objects.filter(kind="capture").exists())
        Evaluation.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
        self.assertEqual(self.client.get("/api/credits/").json(), {"balance": 10, "reserved": 0, "available": 10})

    def test_concurrent_duplicate_and_global_busy_limit(self):
        entered, release = Event(), Event()
        payload = self.payload(feedbackLanguage="en")
        def delayed(request, **kwargs):
            entered.set()
            if not release.wait(10):
                raise AssertionError("test request not released")
            return model_result(request)
        def first():
            try:
                return services.submit(user_id=self.user.pk, evaluation_id=uuid.UUID(payload["id"]),
                    set_id=self.set_id, slot=51, answer=self.inputs["answer"], price_version=payload["priceVersion"],
                    feedback_language="en")
            finally:
                connections.close_all()
        self.provider.side_effect = delayed
        with ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(first)
            try:
                self.assertTrue(entered.wait(10))
                duplicate = self.post(payload)
                self.assertEqual(duplicate.status_code, 202)
                self.assertEqual(duplicate.json()["feedbackLanguage"], "en")
                self.assertEqual(self.post(payload | {"feedbackLanguage": "id"}).status_code, 409)
                self.assertEqual(self.post(self.payload()).json()["error"], "evaluation_busy")
                self.assertEqual(duplicate.json()["usage"]["pending"], 1)
                self.assertEqual(self.client.get("/api/credits/").json()["available"], 10)
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
