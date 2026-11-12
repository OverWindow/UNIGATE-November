import json
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from pathlib import Path
from threading import Event
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db import IntegrityError, connections, transaction
from django.test import Client, SimpleTestCase, TestCase, TransactionTestCase
from django.utils import timezone

from accounts.email_delivery import EmailDeliveryError
from accounts.models import RateLimit
from accounts.rate_limits import record_attempt
from .models import Attempt, AttemptItem, Exam, ExamAttemptFeedback
from .result_delivery import build_result_email, token_hash
from .survey import CATALOG, validate_survey


def survey_input(**changes):
    return {"nationalityCode": "ID", "birthYear": 2000, "topikReasons": ["employment"],
            "topikReasonOther": "", "koreanStudyDuration": "1_to_2_years", "topikExperience": "none",
            "currentTopikLevel": None, "targetTopikLevel": 4, "privacyConsent": True,
            "privacyConsentVersion": CATALOG["consentVersion"], **changes}


class FeedbackFixture:
    def setUp(self):
        self.guest_id = uuid.uuid4()
        session = self.client.session
        session["pbt_guest_id"] = str(self.guest_id)
        session.save()
        self.user = get_user_model().objects.create_user(username="feedback-member")
        self.attempt = self.make_attempt()

    def make_attempt(self, exam_format="pbt", user=None, status="submitted"):
        exam = Exam.objects.create(source_set_id=uuid.uuid4(), title="Synthetic exam", section="reading",
                                  display_order=1, exam_format=exam_format)
        attempt = Attempt.objects.create(exam=exam, exam_format=exam_format, title=exam.title, section="reading",
            user=user, guest_id=None if user else self.guest_id, mode="practice", status=status,
            started_at=timezone.now(), submitted_at=timezone.now() if status == "submitted" else None,
            score=2 if status == "submitted" else None)
        AttemptItem.objects.create(attempt=attempt, position=1, source_item_id=uuid.uuid4(),
            snapshot={"prompt": "Question"}, correct_answer=2, selected_option=2, is_correct=True,
            explanation="SECRET EXPLANATION", transcript="SECRET TRANSCRIPT")
        return attempt

    def path(self, attempt=None):
        attempt = attempt or self.attempt
        return f"/api/{attempt.exam_format}/attempts/{attempt.pk}/"

    def send(self, attempt=None, client=None, **changes):
        data = {"email": "learner@example.invalid", "rating": 4, "language": "ko", "survey": survey_input(), **changes}
        return (client or self.client).post(self.path(attempt) + "result-email/", data, content_type="application/json")

    def verify(self, token, attempt=None, client=None):
        attempt = attempt or self.attempt
        return (client or self.client).post(f"/api/{attempt.exam_format}/result-access/",
            {"attemptId": str(attempt.pk), "token": token}, content_type="application/json")

    def allow_resend(self):
        ExamAttemptFeedback.objects.update(email_requested_at=timezone.now() - timedelta(seconds=61))


class FeedbackTests(FeedbackFixture, TestCase):
    @patch("pbt.views.send_result_email")
    def test_exhausting_link_checks_does_not_block_another_proxy_client(self, send):
        for attempt in (self.attempt, self.make_attempt("ibt")):
            self.assertEqual(self.send(attempt).status_code, 202)
            token = send.call_args.args[2]
            a = Client(enforce_csrf_checks=True, REMOTE_ADDR="192.0.2.10")
            b = Client(enforce_csrf_checks=True, REMOTE_ADDR="192.0.2.10")
            a.defaults["HTTP_X_CSRFTOKEN"] = a.get("/api/csrf/").json()["csrfToken"]
            b.defaults["HTTP_X_CSRFTOKEN"] = b.get("/api/csrf/").json()["csrfToken"]
            self.assertEqual(self.verify("x" * 43, attempt, a).status_code, 400)
            RateLimit.objects.filter(scope="result-access-subject").update(attempts=99)
            self.assertEqual(self.verify("x" * 43, attempt, a).status_code, 400)
            a.defaults.update(REMOTE_ADDR="203.0.113.10", HTTP_X_FORWARDED_FOR="198.51.100.99")
            blocked = self.verify("x" * 43, attempt, a)
            self.assertEqual(blocked.status_code, 429)
            self.assertGreater(int(blocked["Retry-After"]), 0)
            self.assertEqual(self.verify(token, attempt, b).status_code, 200)
            self.assertEqual(b.get(self.path(attempt) + "result/").status_code, 200)
            RateLimit.objects.filter(scope="result-access-subject").delete()

    @patch("pbt.views.send_result_email")
    def test_result_email_quota_is_separate_for_clients_behind_one_proxy(self, send):
        for attempt in (self.attempt, self.make_attempt("ibt")):
            self.client.defaults["REMOTE_ADDR"] = "192.0.2.10"
            self.assertEqual(self.send(attempt).status_code, 202)
            RateLimit.objects.filter(scope="result-subject").update(attempts=100)
            another = self.make_attempt(attempt.exam_format)
            self.assertEqual(self.send(another, email="other@example.invalid").status_code, 429)
            self.assertFalse(ExamAttemptFeedback.objects.filter(attempt=another).exists())
            b = Client(REMOTE_ADDR="192.0.2.10")
            other = self.make_attempt(attempt.exam_format)
            other.guest_id = uuid.uuid4()
            other.save(update_fields=["guest_id"])
            session = b.session
            session["pbt_guest_id"] = str(other.guest_id)
            session.save()
            self.assertEqual(self.send(other, b, email="other@example.invalid").status_code, 202)
            RateLimit.objects.filter(scope="result-subject").delete()
        self.assertEqual(send.call_count, 4)

    @patch("pbt.views.send_result_email")
    def test_result_access_limit_follows_account_across_sessions(self, send):
        self.assertEqual(self.send().status_code, 202)
        token = send.call_args.args[2]
        a, same_account, other_account = Client(), Client(), Client()
        a.force_login(self.user)
        same_account.force_login(self.user)
        other_account.force_login(get_user_model().objects.create_user(username="other-reader"))
        self.assertEqual(self.verify("x" * 43, client=a).status_code, 400)
        RateLimit.objects.filter(scope="result-access-subject").update(attempts=100)
        self.assertEqual(self.verify(token, client=same_account).status_code, 429)
        self.assertEqual(self.verify(token, client=other_account).status_code, 200)

    @patch("pbt.views.send_result_email")
    def test_obsolete_peer_limits_do_not_block_result_requests(self, send):
        for scope in ("result-peer", "result-access-peer"):
            record_attempt(scope, "127.0.0.1", 100, 3600)
            RateLimit.objects.filter(scope=scope).update(attempts=100)
        self.assertEqual(self.send().status_code, 202)
        self.assertEqual(self.verify(send.call_args.args[2], client=Client()).status_code, 200)
        self.assertEqual(list(RateLimit.objects.filter(scope__in=("result-peer", "result-access-peer"))
                              .values_list("attempts", flat=True)), [100, 100])

    @patch("pbt.views.send_result_email")
    def test_both_formats_require_email_link_and_cross_browser_access_is_read_only(self, send):
        for attempt in (self.attempt, self.make_attempt("ibt")):
            self.assertEqual(self.client.get(self.path(attempt) + "result/").status_code, 403)
            result = self.send(attempt)
            self.assertEqual(result.status_code, 202)
            token = send.call_args.args[2]
            self.assertNotIn(token, result.content.decode())
            self.assertEqual(ExamAttemptFeedback.objects.get(attempt=attempt).result_token_hash, token_hash(token))
            self.assertEqual(self.client.get(self.path(attempt) + "result/").status_code, 403)
            reader = Client()
            self.assertEqual(self.verify(token, attempt, reader).status_code, 200)
            body = reader.get(self.path(attempt) + "result/").json()
            self.assertEqual(body["score"], 2)
            self.assertEqual(body["items"][0]["explanation"], "SECRET EXPLANATION")
            for private in ("email", "survey", "token", "feedback"):
                self.assertNotIn(private, body)
            self.assertEqual(reader.get(self.path(attempt)).status_code, 404)
            self.assertEqual(reader.post(self.path(attempt) + "submit/").status_code, 404)
            self.assertEqual(self.send(attempt, reader).status_code, 404)
            self.assertEqual(reader.get(f"/api/{attempt.exam_format}/attempts/").json()["attempts"], [])
            wrong_format = "ibt" if attempt.exam_format == "pbt" else "pbt"
            self.assertEqual(reader.get(f"/api/{wrong_format}/attempts/{attempt.pk}/result/").status_code, 404)

    def test_all_guest_payloads_hide_scores_and_answers_including_after_login(self):
        for logged_in in (False, True):
            if logged_in:
                self.client.force_login(self.user)
            bodies = [self.client.get(self.path()).json(),
                      self.client.get("/api/pbt/attempts/").json()["attempts"][0],
                      self.client.post(self.path() + "submit/").json(),
                      self.client.put(self.path() + "answers/1/", {"selectedOption": 1}, content_type="application/json").json()["attempt"]]
            for body in bodies:
                self.assertIsNone(body["score"])
                for secret in ("correctAnswer", "isCorrect", "SECRET EXPLANATION", "SECRET TRANSCRIPT"):
                    self.assertNotIn(secret, json.dumps(body))
            self.assertEqual(self.client.get(self.path() + "result/").status_code, 403)

    def test_members_retain_results_and_other_owners_cannot_access(self):
        member = self.make_attempt(user=self.user)
        self.assertEqual(self.client.get(self.path(member) + "result/").status_code, 404)
        self.client.force_login(self.user)
        self.assertEqual(self.client.get(self.path(member) + "result/").json()["score"], 2)
        self.assertEqual(self.send(member).status_code, 409)
        self.assertEqual(Client().get(self.path() + "result/").status_code, 404)

    @patch("pbt.views.send_result_email")
    def test_required_inputs_invalid_types_and_conditional_fields_are_rejected(self, send):
        cases = [{"email": "bad"}, {"email": []}, {"rating": True}, {"rating": 0}, {"rating": 6},
                 {"rating": 2.5}, {"language": []}, {"survey": None},
                 *[{"survey": survey_input(**change)} for change in (
                     {"birthYear": True}, {"birthYear": timezone.localdate().year + 1},
                     {"nationalityCode": "XX"}, {"topikReasons": [[]]}, {"topikReasons": []},
                     {"topikReasons": ["employment", "employment"]}, {"topikReasons": ["other"]},
                     {"topikExperience": "once", "currentTopikLevel": None}, {"targetTopikLevel": 7},
                     {"privacyConsent": False}, {"privacyConsentVersion": "old"})]]
        for changes in cases:
            with self.subTest(changes=changes):
                self.assertEqual(self.send(**changes).status_code, 400)
        self.assertFalse(ExamAttemptFeedback.objects.exists())
        send.assert_not_called()

    @patch("pbt.views.send_result_email")
    def test_resend_preserves_survey_rotates_link_and_invalidates_existing_grants(self, send):
        self.assertEqual(self.send().status_code, 202)
        old = send.call_args.args[2]
        self.verify(old)
        original = ExamAttemptFeedback.objects.get()
        self.assertEqual(self.send().status_code, 429)
        send.assert_called_once()
        self.allow_resend()
        self.assertEqual(self.send(email="changed@example.invalid", survey=survey_input(birthYear=1999)).status_code, 202)
        current = ExamAttemptFeedback.objects.get()
        self.assertEqual(current.birth_year, 2000)
        self.assertEqual(current.survey_completed_at, original.survey_completed_at)
        self.assertEqual(current.privacy_consented_at, original.privacy_consented_at)
        self.assertEqual(self.client.get(self.path() + "result/").status_code, 403)
        self.assertEqual(self.verify(old).status_code, 400)
        new = send.call_args.args[2]
        self.assertEqual(self.verify(new).status_code, 200)
        self.assertEqual(ExamAttemptFeedback.objects.count(), 1)
        ExamAttemptFeedback.objects.update(result_token_expires_at=timezone.now() - timedelta(seconds=1))
        self.assertEqual(self.verify(new).json()["error"], "result_link_expired")
        self.assertEqual(self.client.get(self.path() + "result/").status_code, 403)

    @patch("pbt.views.send_result_email")
    def test_failures_preserve_survey_and_uncertain_delivery_link_can_still_work(self, send):
        send.side_effect = EmailDeliveryError()
        response = self.send()
        self.assertEqual(response.status_code, 503)
        self.assertTrue(response.json()["feedback"]["completed"])
        self.assertEqual(ExamAttemptFeedback.objects.get().email_status, "failed")
        self.allow_resend()
        send.side_effect = EmailDeliveryError(uncertain=True)
        response = self.send(survey=None)
        self.assertEqual(response.json()["error"], "result_email_uncertain")
        self.assertEqual(self.verify(send.call_args.args[2]).status_code, 200)

    @patch("pbt.views.send_result_email")
    def test_hourly_limits_apply_to_attempt_and_recipient(self, send):
        for n in range(5):
            self.allow_resend()
            self.assertEqual(self.send().status_code, 202)
        self.allow_resend()
        self.assertEqual(self.send().status_code, 429)
        another = self.make_attempt()
        self.assertEqual(self.send(another).status_code, 429)
        other = Client()
        session = other.session
        session["pbt_guest_id"] = str(uuid.uuid4())
        session.save()
        another.guest_id = session["pbt_guest_id"]
        another.save(update_fields=["guest_id"])
        self.assertEqual(self.send(another, other).status_code, 429)
        self.assertEqual(send.call_count, 5)

    @patch("pbt.views.send_result_email")
    def test_forged_cross_format_and_cross_attempt_tokens_are_rejected(self, send):
        self.send()
        token = send.call_args.args[2]
        self.assertEqual(self.verify("x" * 43).status_code, 400)
        self.assertEqual(self.verify(token, self.make_attempt()).status_code, 400)
        response = self.client.post("/api/ibt/result-access/", {"attemptId": str(self.attempt.pk), "token": token}, content_type="application/json")
        self.assertEqual(response.status_code, 400)

    @patch("pbt.views.send_result_email")
    def test_csrf_method_and_owner_checks_precede_delivery(self, send):
        client = Client(enforce_csrf_checks=True)
        self.assertEqual(self.send(client=client).status_code, 403)
        self.assertEqual(self.verify("x" * 43, client=client).status_code, 403)
        self.assertEqual(self.client.get(self.path() + "result-email/").status_code, 405)
        self.assertEqual(self.send(client=Client()).status_code, 404)
        self.assertEqual(self.send(self.make_attempt(status="in_progress")).status_code, 409)
        send.assert_not_called()

    @patch("pbt.views.send_result_email")
    def test_timeout_finalizes_attempt_but_keeps_results_locked(self, send):
        self.attempt.status = "in_progress"
        self.attempt.mode = "timed"
        self.attempt.expires_at = timezone.now() - timedelta(seconds=1)
        self.attempt.save()
        detail = self.client.get(self.path()).json()
        self.assertEqual(detail["status"], "submitted")
        self.assertTrue(detail["timedOut"])
        self.assertIsNone(detail["score"])
        self.assertEqual(self.send().status_code, 202)

    @patch("pbt.views.send_result_email")
    def test_database_rating_and_one_to_one_constraints(self, send):
        self.send()
        with self.assertRaises(IntegrityError), transaction.atomic():
            ExamAttemptFeedback.objects.update(rating=0)
        with self.assertRaises(IntegrityError), transaction.atomic():
            ExamAttemptFeedback.objects.create(attempt=self.attempt, email="duplicate@example.invalid", rating=5,
                                               language="ko", **validate_survey(survey_input()))


class FeedbackConcurrencyTests(FeedbackFixture, TransactionTestCase):
    def test_parallel_link_checks_share_one_session_limit(self):
        self.assertEqual(self.verify("x" * 43).status_code, 400)
        RateLimit.objects.filter(scope="result-access-subject").update(attempts=99)

        def request(_):
            client = Client()
            client.cookies = self.client.cookies.copy()
            try:
                return self.verify("x" * 43, client=client).status_code
            finally:
                connections.close_all()

        with ThreadPoolExecutor(max_workers=4) as pool:
            statuses = sorted(pool.map(request, range(4)))
        self.assertEqual(statuses, [400, 429, 429, 429])
        self.assertEqual(RateLimit.objects.filter(scope="result-access-subject").count(), 1)

    @patch("pbt.views.send_result_email")
    def test_simultaneous_requests_send_once_without_holding_database_lock_during_delivery(self, send):
        entered, release = Event(), Event()
        def delivery(*args):
            entered.set()
            if not release.wait(10):
                raise AssertionError("Timed out waiting for concurrent request")
        send.side_effect = delivery
        def request():
            client = Client()
            client.cookies = self.client.cookies.copy()
            try:
                return self.send(client=client).status_code
            finally:
                connections.close_all()
        with ThreadPoolExecutor(max_workers=2) as pool:
            first = pool.submit(request)
            try:
                self.assertTrue(entered.wait(5))
                second = pool.submit(request)
                self.assertEqual(second.result(timeout=5), 429)
            finally:
                release.set()
            self.assertEqual(first.result(timeout=5), 202)
        send.assert_called_once()
        self.assertEqual(ExamAttemptFeedback.objects.count(), 1)


class SurveyContractTests(SimpleTestCase):
    def test_frontend_and_backend_catalogs_match(self):
        frontend = Path(__file__).resolve().parents[2] / "frontend-TOPIQ/src/lib/survey-catalog.json"
        self.assertEqual(json.loads(frontend.read_text(encoding="utf-8")), CATALOG)

    def test_conditional_fields_normalize_and_all_languages_have_mail(self):
        value = validate_survey(survey_input(currentTopikLevel=4, topikReasonOther="unused"))
        self.assertIsNone(value["current_topik_level"])
        self.assertEqual(value["topik_reason_other"], "")
        attempt = Attempt(id=uuid.uuid4(), exam_format="ibt", title="<Synthetic>", section="listening", mode="timed")
        for language in ("ko", "en", "id"):
            body = build_result_email(attempt, "token/&", language)
            self.assertIn(f"/ibt/attempts/{attempt.pk}/result#token=token%2F%26", body["textContent"])
            self.assertIn("&lt;Synthetic&gt;", body["htmlContent"])
            self.assertNotIn("<Synthetic>", body["htmlContent"])
            details = {"ko": "IBT · 듣기 · 실전", "en": "IBT · Listening · Timed", "id": "IBT · Menyimak · Simulasi"}[language]
            self.assertIn(details, body["textContent"])
            self.assertIn(details, body["htmlContent"])
