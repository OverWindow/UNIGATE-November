from unittest.mock import patch

from django.db import DatabaseError
from django.test import Client, TransactionTestCase

from question_bank.models import Item
from ..bank import BankNotReady
from ..models import Attempt, Exam
from .test_core import BankFixtures


class AnswerStorageTests(BankFixtures, TransactionTestCase):
    def setUp(self):
        super().setUp()
        self.exams = [self.exam, self.listen_exam]
        for section in ("reading", "listening"):
            source = self.make_set(section, "ibt")
            self.exams.append(Exam.objects.create(source_set_id=source.pk, exam_format="ibt",
                title="Synthetic IBT", section=section, display_order=1, guest_slot=1, is_published=True))

    def start(self, exam, client=None, mode="practice"):
        client = client or self.client
        response = client.post(f"/api/{exam.exam_format}/attempts/",
            {"examId": str(exam.pk), "mode": mode}, content_type="application/json")
        self.assertEqual(response.status_code, 201)
        self.enter_timed(response.json(), client)
        attempt = Attempt.objects.get(pk=response.json()["id"])
        return attempt, f"/api/{exam.exam_format}/attempts/{attempt.pk}/"

    def answer(self, client, path, position, option):
        response = client.put(path + f"answers/{position}/", {"selectedOption": option},
                              content_type="application/json")
        self.assertEqual(response.status_code, 200)

    def test_only_answers_are_stored_and_all_questions_are_returned(self):
        for exam in self.exams:
            count = 50 if exam.exam_format == "pbt" else 30
            for member in (False, True):
                client = Client()
                if member:
                    client.force_login(self.user)
                for mode in ("practice", "timed"):
                    with self.subTest(format=exam.exam_format, section=exam.section, member=member, mode=mode):
                        attempt, path = self.start(exam, client, mode)
                        self.assertFalse(attempt.items.exists())
                        detail = client.get(path).json()
                        self.assertEqual(len(detail["items"]), count)
                        self.assertTrue(all(q["selectedOption"] is None for q in detail["items"]))
                        self.assertFalse(attempt.items.exists())
                        self.answer(client, path, 1, None)
                        self.assertFalse(attempt.items.exists())
                        self.answer(client, path, 1, 2)
                        first_id = attempt.items.get(position=1).pk
                        self.answer(client, path, 1, 1)
                        self.assertEqual(attempt.items.get(position=1).pk, first_id)
                        self.answer(client, path, count, 2)
                        self.assertEqual(attempt.items.count(), 2)
                        self.answer(client, path, 1, None)
                        self.answer(client, path, 1, None)
                        self.assertEqual(attempt.items.count(), 1)
                        restored = client.get(path).json()
                        self.assertEqual(restored["answeredCount"], 1)
                        self.assertEqual([q["position"] for q in restored["items"]], list(range(1, count + 1)))
                        self.assertIsNone(restored["items"][0]["selectedOption"])
                        self.assertEqual(restored["items"][-1]["selectedOption"], 2)
                        for question in restored["items"]:
                            self.assertNotIn("_answerOnly", question)
                            self.assertNotIn("correctAnswer", question)
                        submitted = client.post(path + "submit/").json()
                        self.assertEqual(submitted["answeredCount"], 1)
                        self.assertEqual(attempt.items.count(), 1)
                        result = client.get(path + "result/")
                        if member:
                            self.assertEqual(submitted["score"], 2 if count == 50 else 3)
                            questions = result.json()["items"]
                            self.assertEqual(len(questions), count)
                            self.assertFalse(questions[0]["isCorrect"])
                            self.assertTrue(questions[-1]["isCorrect"])
                            self.assertNotIn("_answerOnly", questions[-1])
                        else:
                            self.assertEqual(result.status_code, 403)
                        self.assertEqual(attempt.items.count(), 1)

    def test_empty_submission_does_not_create_items(self):
        self.client.force_login(self.user)
        for exam in self.exams:
            attempt, path = self.start(exam)
            for _ in range(2):
                submitted = self.client.post(path + "submit/").json()
                self.assertEqual((submitted["score"], submitted["answeredCount"]), (0, 0))
            result = self.client.get(path + "result/").json()
            self.assertEqual(len(result["items"]), 50 if exam.exam_format == "pbt" else 30)
            self.assertTrue(all(q["isCorrect"] is False for q in result["items"]))
            self.assertFalse(attempt.items.exists())

    def test_saved_content_is_frozen_and_cleared_content_comes_from_bank(self):
        self.client.force_login(self.user)
        for exam in (self.exam, self.exams[2]):
            attempt, path = self.start(exam)
            self.answer(self.client, path, 1, 2)
            original = attempt.items.get(position=1)
            Item.objects.filter(set_id=exam.source_set_id, position__in=[1, 2]).update(
                content_json={"question_prompt": "Updated prompt"}, correct_answer=3, explanation="Updated explanation")
            questions = self.client.get(path).json()["items"]
            self.assertEqual(questions[0]["prompt"], original.snapshot["prompt"])
            self.assertEqual(questions[1]["prompt"], "Updated prompt")
            self.answer(self.client, path, 1, None)
            self.assertFalse(attempt.items.exists())
            self.assertEqual(self.client.get(path).json()["items"][0]["prompt"], "Updated prompt")
            self.answer(self.client, path, 1, 3)
            saved = attempt.items.get(position=1)
            self.assertEqual((saved.correct_answer, saved.explanation), (3, "Updated explanation"))
            self.assertNotEqual(saved.pk, original.pk)

    def test_legacy_snapshots_survive_reads_clears_and_bank_unavailability(self):
        self.client.force_login(self.user)
        for exam in self.exams:
            attempt, path = self.start(exam)
            self.store_legacy_items(attempt)
            original = list(attempt.items.values())
            with patch("pbt.services.load_set", side_effect=BankNotReady), \
                    patch("pbt.views.load_set", side_effect=BankNotReady):
                self.assertEqual(self.client.get(path).status_code, 200)
                self.assertEqual(list(attempt.items.values()), original)
                self.answer(self.client, path, 1, 2)
                self.answer(self.client, path, 1, None)
                self.assertEqual(list(attempt.items.values_list("pk", flat=True)), [row["id"] for row in original])
                cleared = attempt.items.get(position=1)
                self.assertIsNone(cleared.selected_option)
                self.assertEqual(cleared.snapshot, original[0]["snapshot"])
                self.answer(self.client, path, 2, 2)
                self.assertEqual(self.client.post(path + "submit/").status_code, 200)
                final_items = list(attempt.items.values())
                final_attempt = Attempt.objects.values().get(pk=attempt.pk)
                for _ in range(2):
                    self.assertEqual(self.client.get(path + "result/").status_code, 200)
                    self.assertEqual(self.client.post(path + "submit/").status_code, 200)
                self.assertEqual(list(attempt.items.values()), final_items)
                self.assertEqual(Attempt.objects.values().get(pk=attempt.pk), final_attempt)

    def test_missing_bank_returns_controlled_error_but_saved_answers_can_be_submitted(self):
        self.client.force_login(self.user)
        for exam in (self.exam, self.exams[2]):
            attempt, path = self.start(exam)
            self.answer(self.client, path, 1, 2)
            with patch("pbt.services.load_set", side_effect=BankNotReady), \
                    patch("pbt.views.load_set", side_effect=BankNotReady):
                detail = self.client.get(path)
                self.assertEqual((detail.status_code, detail.json()["error"]), (409, "exam_not_ready"))
                missing = self.client.put(path + "answers/2/", {"selectedOption": 2}, content_type="application/json")
                self.assertEqual(missing.status_code, 409)
                self.answer(self.client, path, 1, 2)
                submitted = self.client.post(path + "submit/")
                self.assertEqual(submitted.status_code, 200)
                self.assertEqual(submitted.json()["score"], 2 if exam.exam_format == "pbt" else 3)
                self.assertEqual(attempt.items.count(), 1)

    def test_failed_clear_rolls_back_item_deletion_and_count(self):
        attempt, path = self.start(self.exam)
        self.answer(self.client, path, 1, 2)
        before = list(attempt.items.values())
        with patch("pbt.views.Attempt.save", side_effect=DatabaseError("synthetic")):
            response = self.client.put(path + "answers/1/", {"selectedOption": None}, content_type="application/json")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(list(attempt.items.values()), before)
        attempt.refresh_from_db()
        self.assertEqual(attempt.answered_count, 1)

    def test_positions_outside_exam_are_rejected_without_saving(self):
        for exam in self.exams:
            attempt, path = self.start(exam)
            count = 50 if exam.exam_format == "pbt" else 30
            for position in (0, count + 1, 100):
                response = self.client.put(path + f"answers/{position}/", {"selectedOption": 2},
                                           content_type="application/json")
                self.assertEqual(response.status_code, 404)
            self.assertFalse(attempt.items.exists())
