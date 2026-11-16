import copy
import importlib
import uuid
from types import SimpleNamespace
from django.contrib.auth.models import AnonymousUser
from unittest.mock import MagicMock, patch

from django.db import DatabaseError, connection
from django.db.migrations.state import ProjectState
from django.test import SimpleTestCase
from django.utils import timezone

from ..models import WritingQuestion, WritingSet
from ..writing import WritingUnavailable, material, question


def prompt(slot):
    return {
        "exam_format": "pbt", "section": "writing", "type_slot": slot,
        "instruction": "다음을 읽고 쓰십시오.", "passage": "안내문입니다. ( ㉠ )", "topic": "연습",
        "materials": [{"kind": "bar", "title": "변화", "unit": "%", "categories": ["이전", "이후"],
                       "series": [{"label": "비율", "values": [20, 40]}]}] if slot == 53 else [],
        "requirements": ["자신의 생각을 쓰십시오."] if slot == 54 else [],
    }


class WritingPromptTests(SimpleTestCase):
    def test_only_prompt_fields_leave_the_bank(self):
        source = prompt(53)
        source.update(answer="hidden", provider="hidden", explanation="hidden")
        source["materials"][0]["answer"] = "hidden"
        source["materials"][0]["series"][0]["secret"] = "hidden"
        original = copy.deepcopy(source)
        result = question(WritingQuestion(type_slot=53, content_json=source))
        self.assertEqual(source, original)
        self.assertEqual(result["materials"][0]["series"], [{"label": "비율", "values": [20, 40]}])
        self.assertNotIn("hidden", str(result))
        self.assertNotIn("source_generated_id", result)

    def test_missing_or_mismatched_prompt_is_unavailable(self):
        for slot, changes in [(51, {"instruction": ""}), (52, {"passage": ""}),
                              (53, {"materials": []}), (54, {"requirements": []}),
                              (51, {"exam_format": "ibt"}), (51, {"type_slot": 52}),
                              (51, {"requirements": "invalid"}), (51, {"materials": None})]:
            with self.subTest(slot=slot, changes=changes), self.assertRaises(WritingUnavailable):
                question(WritingQuestion(type_slot=slot, content_json=prompt(slot) | changes))

    def test_chart_values_must_match_labels_and_be_finite(self):
        chart = prompt(53)["materials"][0]
        for values in ([1], [1, "2"], [True, 2], [float("nan"), 2], [float("inf"), 2]):
            with self.subTest(values=values), self.assertRaises(WritingUnavailable):
                material(chart | {"series": [{"label": "비율", "values": values}]})
        self.assertEqual(material(chart | {"kind": "line"})["kind"], "line")

    def test_mapping_migration_emits_no_schema_sql(self):
        migration = importlib.import_module("migration.question_bank.0009_writing_models").Migration(
            "0009_writing_models", "question_bank",
        )
        with connection.schema_editor(collect_sql=True, atomic=False) as editor:
            state = migration.apply(ProjectState(), editor)
        self.assertEqual(editor.collected_sql, [])
        for name in ("WritingSet", "WritingQuestion"):
            self.assertFalse(state.apps.get_model("question_bank", name)._meta.managed)
        self.assertEqual(WritingQuestion._meta.pk.field_names, ("set_id", "type_slot"))


class WritingAPITests(SimpleTestCase):
    def setUp(self):
        self.auth = patch("django.contrib.auth.middleware.get_user", return_value=SimpleNamespace(is_authenticated=True))
        self.auth.start()
        self.addCleanup(self.auth.stop)
        self.set_id = uuid.uuid4()
        self.group = WritingSet(set_id=self.set_id, created_at=timezone.now())
        self.path = f"/api/writing/sets/{self.set_id}/"

    @patch("question_bank.writing.complete_sets")
    def test_catalog_requires_login_and_does_not_create_a_session(self, complete):
        complete.return_value.only.return_value = [self.group]
        result = self.client.get("/api/writing/sets/")
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json(), {"sets": [{"id": str(self.set_id), "number": 1, "questionCount": 4}]})
        self.assertEqual(result["Cache-Control"], "private, no-store")
        self.assertNotIn("sessionid", result.cookies)
        complete.return_value.only.return_value = []
        self.assertEqual(self.client.get("/api/writing/sets/").json(), {"sets": []})
        with patch("django.contrib.auth.middleware.get_user", return_value=AnonymousUser()):
            self.assertEqual(self.client.get("/api/writing/sets/").status_code, 401)
            self.assertEqual(self.client.get(self.path).status_code, 401)

    @patch("question_bank.writing.WritingQuestion.objects")
    @patch("question_bank.writing.complete_sets")
    def test_detail_exposes_four_prompts_without_answers(self, complete, questions):
        groups = MagicMock()
        complete.return_value = groups
        groups.filter.return_value.first.return_value = self.group
        groups.filter.return_value.count.return_value = 0
        questions.filter.return_value.order_by.return_value = [
            WritingQuestion(type_slot=slot, content_json=prompt(slot)) for slot in (51, 52, 53, 54)
        ]
        result = self.client.get(self.path)
        self.assertEqual(result.status_code, 200)
        self.assertEqual([entry["number"] for entry in result.json()["questions"]], [51, 52, 53, 54])
        self.assertNotIn("sessionid", result.cookies)
        questions.filter.return_value.order_by.return_value = []
        self.assertEqual(self.client.get(self.path).status_code, 503)

    @patch("question_bank.writing.complete_sets")
    def test_missing_sets_and_database_failure_have_distinct_errors(self, complete):
        complete.return_value.filter.return_value.first.return_value = None
        self.assertEqual(self.client.get(self.path).status_code, 404)
        self.assertEqual(self.client.get("/api/writing/sets/not-a-uuid/").status_code, 404)
        complete.side_effect = DatabaseError("private database detail")
        for path in ("/api/writing/sets/", self.path):
            result = self.client.get(path)
            self.assertEqual(result.status_code, 503)
            self.assertEqual(result.json(), {"error": "writing_unavailable"})

    def test_writes_and_submission_are_not_available(self):
        for path in ("/api/writing/sets/", self.path):
            for method in (self.client.post, self.client.put, self.client.patch, self.client.delete):
                self.assertEqual(method(path).status_code, 405)
        self.assertEqual(self.client.post(self.path + "submit/").status_code, 404)
