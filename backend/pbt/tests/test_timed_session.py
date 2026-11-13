import uuid
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from unittest.mock import patch

from django.db import connections
from django.test import Client, TransactionTestCase

from ..bank import BankNotReady
from ..models import Attempt, Exam
from .test_core import BankFixtures


class TimedSessionTests(BankFixtures, TransactionTestCase):
    def setUp(self):
        super().setUp()
        self.exams = [self.exam, self.listen_exam]
        for section in ("reading", "listening"):
            source = self.make_set(section, "ibt")
            self.exams.append(Exam.objects.create(source_set_id=source.pk, exam_format="ibt", section=section,
                title="Synthetic timed", display_order=1, guest_slot=1, is_published=True))

    def start(self, exam, client=None, mode="timed"):
        client = client or self.client
        response = client.post(f"/api/{exam.exam_format}/attempts/",
            {"examId": str(exam.pk), "mode": mode}, content_type="application/json")
        self.assertEqual(response.status_code, 201)
        attempt = Attempt.objects.get(pk=response.json()["id"])
        return attempt, f"/api/{exam.exam_format}/attempts/{attempt.pk}/"

    def enter(self, path, token, client=None):
        return (client or self.client).post(path + "enter/", {"sessionToken": token}, content_type="application/json")

    def test_reentry_ends_timed_attempt_and_keeps_saved_answers(self):
        for exam in self.exams:
            for member in (False, True):
                client = Client()
                if member:
                    client.force_login(self.user)
                with self.subTest(format=exam.exam_format, section=exam.section, member=member):
                    attempt, path = self.start(exam, client)
                    token = str(uuid.uuid4())
                    for _ in range(2):
                        entered = self.enter(path, token, client)
                        self.assertEqual(entered.status_code, 200)
                        self.assertEqual(entered.json()["status"], "in_progress")
                        self.assertIn("items", entered.json())
                    attempt.refresh_from_db()
                    self.assertNotEqual(attempt.timed_session_token_hash, token)
                    self.assertNotIn("timed_session_token_hash", entered.json())
                    self.assertEqual(client.put(path + "answers/1/", {"selectedOption": 2},
                        content_type="application/json", HTTP_X_EXAM_SESSION=token).status_code, 200)
                    item = attempt.items.get(position=1)
                    reentry = self.enter(path, str(uuid.uuid4()), client)
                    self.assertEqual(reentry.json()["status"], "submitted")
                    self.assertNotIn("items", reentry.json())
                    attempt.refresh_from_db()
                    item.refresh_from_db()
                    self.assertEqual((item.selected_option, item.is_correct, attempt.answered_count), (2, True, 1))
                    self.assertEqual(attempt.score, 2 if exam.exam_format == "pbt" else 3)
                    self.assertEqual(attempt.items.count(), 1)
                    submitted_at = attempt.submitted_at
                    self.assertEqual(client.put(path + "answers/1/", {"selectedOption": 1},
                        content_type="application/json", HTTP_X_EXAM_SESSION=token).status_code, 409)
                    self.assertEqual(self.enter(path, token, client).json()["status"], "submitted")
                    attempt.refresh_from_db()
                    self.assertEqual(attempt.submitted_at, submitted_at)

    def test_explicit_exit_is_idempotent_and_does_not_touch_other_attempts(self):
        attempt, path = self.start(self.exam)
        practice, practice_path = self.start(self.exam, mode="practice")
        token = str(uuid.uuid4())
        self.enter(path, token)
        self.client.put(path + "answers/1/", {"selectedOption": 2}, content_type="application/json", HTTP_X_EXAM_SESSION=token)
        for _ in range(2):
            self.assertEqual(self.client.post(path + "submit/").json()["status"], "submitted")
        self.assertEqual(self.enter(path, str(uuid.uuid4())).json()["status"], "submitted")
        self.assertEqual(self.client.get(practice_path).json()["status"], "in_progress")
        self.assertEqual(attempt.items.get(position=1).selected_option, 2)
        self.assertFalse(practice.items.exists())
        new, _ = self.start(self.exam)
        self.assertNotEqual(new.pk, attempt.pk)

    def test_timed_details_and_answers_require_current_page_token(self):
        attempt, path = self.start(self.exam)
        token = str(uuid.uuid4())
        for supplied in ("", str(uuid.uuid4())):
            self.assertEqual(self.client.get(path, HTTP_X_EXAM_SESSION=supplied).status_code, 409)
            self.assertEqual(self.client.put(path + "answers/1/", {"selectedOption": 2},
                content_type="application/json", HTTP_X_EXAM_SESSION=supplied).status_code, 409)
        self.enter(path, token)
        self.assertEqual(self.client.get(path, HTTP_X_EXAM_SESSION=token).status_code, 200)
        self.assertEqual(self.client.put(path + "answers/1/", {"selectedOption": 2},
            content_type="application/json", HTTP_X_EXAM_SESSION=str(uuid.uuid4())).status_code, 409)
        attempt.refresh_from_db()
        self.assertEqual(attempt.status, "in_progress")
        self.assertFalse(attempt.items.exists())

    def test_practice_can_reenter_with_different_tokens(self):
        for exam in self.exams:
            attempt, path = self.start(exam, mode="practice")
            self.enter(path, str(uuid.uuid4()))
            self.assertEqual(self.client.put(path + "answers/1/", {"selectedOption": 2}, content_type="application/json").status_code, 200)
            again = self.enter(path, str(uuid.uuid4())).json()
            self.assertEqual(again["status"], "in_progress")
            self.assertEqual(again["items"][0]["selectedOption"], 2)
            self.assertEqual(self.client.get(path).status_code, 200)
            attempt.refresh_from_db()
            self.assertEqual(attempt.timed_session_token_hash, "")

    def test_enter_validates_owner_format_csrf_and_payload_before_claiming(self):
        attempt, path = self.start(self.exam)
        token = str(uuid.uuid4())
        self.assertEqual(self.enter(path, token, Client()).status_code, 404)
        self.assertEqual(self.enter(path.replace("/pbt/", "/ibt/"), token).status_code, 404)
        strict = Client(enforce_csrf_checks=True)
        strict.cookies.update(self.client.cookies)
        self.assertEqual(self.enter(path, token, strict).status_code, 403)
        for value in (None, 3, [], {}, "", "invalid", "a" * 10000):
            self.assertEqual(self.enter(path, value).status_code, 400)
        attempt.refresh_from_db()
        self.assertEqual((attempt.status, attempt.timed_session_token_hash), ("in_progress", ""))

    def test_failed_initial_load_does_not_claim_session(self):
        attempt, path = self.start(self.exam)
        with patch("pbt.services.load_set", side_effect=BankNotReady):
            self.assertEqual(self.enter(path, str(uuid.uuid4())).status_code, 409)
        attempt.refresh_from_db()
        self.assertEqual(attempt.timed_session_token_hash, "")
        self.assertEqual(self.enter(path, str(uuid.uuid4())).json()["status"], "in_progress")

    def test_concurrent_entry_retries_share_the_same_session(self):
        attempt, path = self.start(self.exam)
        token = str(uuid.uuid4())
        clients = [Client(), Client()]
        for client in clients:
            client.cookies.update(self.client.cookies)
        barrier = Barrier(2)

        def enter(client):
            try:
                barrier.wait(timeout=10)
                return self.enter(path, token, client).json()["status"]
            finally:
                connections.close_all()

        with ThreadPoolExecutor(max_workers=2) as pool:
            self.assertEqual(list(pool.map(enter, clients)), ["in_progress", "in_progress"])
        attempt.refresh_from_db()
        self.assertEqual(attempt.status, "in_progress")
