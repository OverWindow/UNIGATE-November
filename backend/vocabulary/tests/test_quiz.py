import io
import json
import uuid
from datetime import timedelta
from unittest.mock import patch

from django.core.management import call_command
from django.db import connection, transaction
from django.test import Client, TransactionTestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from question_bank.models import Vocabulary, VocabularyQuestion
from ..models import VocabularySet, VocabularySetItem


class VocabularyQuizTests(TransactionTestCase):
    def setUp(self):
        with connection.cursor() as cursor:
            cursor.execute("CREATE SCHEMA topik_bank")
        with connection.schema_editor() as editor:
            editor.create_model(Vocabulary)
            editor.create_model(VocabularyQuestion)
        self.group = VocabularySet.objects.create(topik_level=3, set_number=1)
        self.empty = VocabularySet.objects.create(topik_level=3, set_number=2)
        for pk in (1, 2, 3, 4):
            Vocabulary.objects.create(
                vocabulary_id=pk, korean=f"단어{pk}", part_of_speech="명사", topik_level=3,
                english=f"word {pk}", vietnamese="", japanese="", example_korean="예문", example_english="Example",
            )
            VocabularySetItem.objects.create(
                set=self.group if pk < 4 else self.empty, vocabulary_id=pk, position=pk if pk < 4 else 1,
            )
        now = timezone.now()
        for pk, word_id, kind, position in ((1, 1, "sentence_blank", 1), (2, 1, "sentence_blank", 2),
                                            (3, 1, "sentence_blank", 3), (4, 2, "sentence_blank", 1),
                                            (5, 3, "synonym", 7)):
            VocabularyQuestion.objects.create(
                question_id=pk, vocabulary_id=word_id, question_type=kind, position=position,
                instruction="빈칸을 채우세요.", stem=f"{word_id}번 예문 ( )", choices=["보기1", "보기2", "보기3", "보기4"],
                correct_answer=2, accepted_answers=["보기2"] if kind == "sentence_blank" else [],
                explanation="두 번째 보기가 정답입니다.", provider="synthetic", model="synthetic",
                generation_id=uuid.uuid4(), source_hash="a" * 64, created_at=now, updated_at=now,
            )
        self.path = f"/api/vocabulary/sets/{self.group.pk}/questions/"
        self.check_path = self.path + "1/check/"
        self.version = now.isoformat()

    def tearDown(self):
        with connection.schema_editor() as editor:
            editor.delete_model(VocabularyQuestion)
            editor.delete_model(Vocabulary)
        with connection.cursor() as cursor:
            cursor.execute("DROP SCHEMA topik_bank")

    def submit(self, option=2, version=None, path=None):
        return self.client.post(path or self.check_path, {
            "selectedOption": option, "version": self.version if version is None else version,
        }, content_type="application/json")

    def test_one_random_blank_question_per_word_without_answer_fields_or_writes(self):
        with patch("vocabulary.views.random.choice", side_effect=lambda items: items[-1]), \
                patch("vocabulary.views.random.shuffle", side_effect=lambda items: items.reverse()), \
                transaction.atomic():
            with connection.cursor() as cursor:
                cursor.execute("SET TRANSACTION READ ONLY")
            with self.assertNumQueries(5):
                result = self.client.get(self.path)
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result["Cache-Control"], "no-store")
        self.assertNotIn("sessionid", result.cookies)
        data = result.json()
        self.assertEqual((data["wordCount"], len(data["questions"])), (3, 2))
        self.assertEqual([q["id"] for q in data["questions"]], ["4", "3"])
        self.assertEqual(set(data), {"id", "level", "number", "wordCount", "catalogPage", "questions"})
        for question in data["questions"]:
            self.assertEqual(set(question), {"id", "instruction", "stem", "choices", "version"})
            self.assertEqual(len(question["choices"]), 4)

    def test_counts_are_distinct_words_and_empty_quiz_is_successful(self):
        catalog = self.client.get("/api/vocabulary/sets/?level=3").json()
        self.assertEqual([group["quizQuestionCount"] for group in catalog["sets"]], [2, 0])
        detail = self.client.get(f"/api/vocabulary/sets/{self.group.pk}/").json()
        self.assertEqual(detail["quizQuestionCount"], 2)
        result = self.client.get(f"/api/vocabulary/sets/{self.empty.pk}/questions/")
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()["questions"], [])

    def test_grading_is_repeatable_read_only_and_returns_feedback_only_after_submission(self):
        with transaction.atomic():
            with connection.cursor() as cursor:
                cursor.execute("SET TRANSACTION READ ONLY")
            wrong = self.submit(1)
            correct = self.submit(2)
            again = self.submit(2)
        self.assertEqual(wrong.status_code, 200)
        self.assertFalse(wrong.json()["isCorrect"])
        self.assertEqual(correct.json(), again.json())
        self.assertEqual(correct.json(), {
            "isCorrect": True, "correctAnswer": 2, "explanation": "두 번째 보기가 정답입니다.",
            "word": {"korean": "단어1", "meanings": {"en": "word 1", "vi": "", "ja": "", "zh-Hans": "", "id": ""}},
        })
        self.assertEqual(correct["Cache-Control"], "no-store")
        self.assertNotIn("sessionid", correct.cookies)

    def test_invalid_answers_and_methods_cannot_reveal_feedback(self):
        for option in (None, True, False, "2", 2.0, 0, 5, [], {}):
            with self.subTest(option=option):
                result = self.submit(option)
                self.assertEqual(result.status_code, 400)
                self.assertEqual(result.json(), {"error": "invalid_answer"})
        for body in ("null", "[]", "{", json.dumps({"selectedOption": 2}), "x" * 2049):
            self.assertEqual(self.client.post(self.check_path, body, content_type="application/json").status_code, 400)
        self.assertEqual(self.client.post(self.check_path, {"selectedOption": 2}).status_code, 400)
        for method in (self.client.get, self.client.put, self.client.delete):
            self.assertEqual(method(self.check_path).status_code, 405)
        self.assertEqual(self.client.post(self.path).status_code, 405)

    def test_csrf_is_required_and_anonymous_clients_can_submit_with_it(self):
        client = Client(enforce_csrf_checks=True)
        payload = {"selectedOption": 2, "version": self.version}
        self.assertEqual(client.post(self.check_path, payload, content_type="application/json").status_code, 403)
        token = client.get("/api/csrf/").json()["csrfToken"]
        result = client.post(self.check_path, payload, content_type="application/json", HTTP_X_CSRFTOKEN=token)
        self.assertEqual(result.status_code, 200)

    def test_other_sets_non_blank_questions_and_out_of_range_ids_are_rejected(self):
        for path in (f"/api/vocabulary/sets/{self.empty.pk}/questions/1/check/", self.path + "5/check/",
                     self.path + "999999999999999999999/check/", "/api/vocabulary/sets/999999999999999999999/questions/1/check/"):
            with self.subTest(path=path):
                self.assertEqual(self.submit(path=path).status_code, 404)
        for set_id in (9999999, 999999999999999999999):
            self.assertEqual(self.client.get(f"/api/vocabulary/sets/{set_id}/questions/").status_code, 404)

    def test_source_changes_do_not_grade_old_options(self):
        self.assertEqual(self.submit(version="old").status_code, 409)
        VocabularyQuestion.objects.filter(pk=1).update(updated_at=timezone.now() + timedelta(seconds=1))
        result = self.submit()
        self.assertEqual(result.status_code, 409)
        self.assertEqual(result.json(), {"error": "question_changed"})
        VocabularyQuestion.objects.filter(pk=1).delete()
        self.assertEqual(self.submit().status_code, 404)
        Vocabulary.objects.filter(pk=2).update(topik_level=4)
        self.assertEqual(self.client.get(self.path).status_code, 503)

    def test_malformed_source_and_unavailable_table_do_not_break_word_study(self):
        for choices in (["only"], ["a", "b", {}, "d"], ["a", "b", " ", "d"], None):
            # JSON null is not SQL NULL, so use a valid JSON scalar for the final case.
            VocabularyQuestion.objects.filter(pk=1).update(choices=choices if choices is not None else "invalid")
            self.assertEqual(self.client.get(self.path).status_code, 503)
            self.assertEqual(self.submit().status_code, 503)
        with connection.cursor() as cursor:
            cursor.execute("ALTER TABLE topik_bank.vocabulary_questions RENAME TO quiz_temporarily_unavailable")
        try:
            self.assertEqual(self.client.get(self.path).status_code, 503)
            self.assertEqual(self.submit().status_code, 503)
            result = self.client.get(f"/api/vocabulary/sets/{self.group.pk}/")
            self.assertEqual(result.status_code, 200)
            self.assertIsNone(result.json()["quizQuestionCount"])
            self.assertEqual(len(result.json()["words"]), 3)
        finally:
            with connection.cursor() as cursor:
                cursor.execute("ALTER TABLE topik_bank.quiz_temporarily_unavailable RENAME TO vocabulary_questions")

    def test_mapping_migration_does_not_create_or_change_database_tables(self):
        self.assertFalse(VocabularyQuestion._meta.managed)
        output = io.StringIO()
        with CaptureQueriesContext(connection) as queries:
            call_command("sqlmigrate", "question_bank", "0008", stdout=output)
        sql = output.getvalue().upper()
        for mutation in ("CREATE TABLE", "ALTER TABLE", "INSERT INTO", "DROP TABLE"):
            self.assertNotIn(mutation, sql)
            self.assertFalse(any(query["sql"].upper().startswith(mutation) for query in queries))
