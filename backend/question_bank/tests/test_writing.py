import copy
import importlib
import json
import uuid
from datetime import timedelta
from types import SimpleNamespace
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from unittest.mock import MagicMock, patch

from django.db import DatabaseError, connection
from django.db.migrations.state import ProjectState
from django.test import RequestFactory, SimpleTestCase, TestCase
from django.utils import timezone

from ..models import WritingQuestion, WritingSet
from ..writing import WritingUnavailable, detail as set_detail, material, question, sets
from writing.models import Evaluation
from accounts.models import CreditAccount, CreditTransaction


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
        source["image"] = {"storage_url": "https://example.invalid/writing/53.png", "storage_bucket": "hidden"}
        original = copy.deepcopy(source)
        result = question(WritingQuestion(type_slot=53, content_json=source))
        self.assertEqual(source, original)
        self.assertEqual(result["materials"][0]["series"], [{"label": "비율", "values": [20, 40]}])
        self.assertNotIn("hidden", str(result))
        self.assertNotIn("source_generated_id", result)
        self.assertEqual(result["imageUrl"], source["image"]["storage_url"])

    def test_missing_or_invalid_image_keeps_structured_materials(self):
        for image in (None, "invalid", {}, {"storage_url": None}, {"storage_url": "javascript:alert(1)"},
                      {"storage_url": "https://user:password@example.invalid/53.png"}):
            with self.subTest(image=image):
                result = question(WritingQuestion(type_slot=53, content_json=prompt(53) | {"image": image}))
                self.assertEqual(result["imageUrl"], "")
                self.assertTrue(result["materials"])

    def test_images_are_only_exposed_for_question_53(self):
        for slot in (51, 52, 54):
            with self.subTest(slot=slot):
                source = prompt(slot) | {"image": {"storage_url": "https://example.invalid/writing/53.png"}}
                self.assertEqual(question(WritingQuestion(type_slot=slot, content_json=source))["imageUrl"], "")

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
        self.auth = patch("django.contrib.auth.middleware.get_user", return_value=SimpleNamespace(is_authenticated=True, pk=1))
        self.auth.start()
        self.addCleanup(self.auth.stop)
        evaluations = patch("question_bank.writing.Evaluation.objects")
        evaluations.start().filter.return_value.order_by.return_value.values_list.return_value.distinct.return_value = []
        self.addCleanup(evaluations.stop)
        for name, value in (("has_access", True), ("has_active_plan", False), ("evaluation_usage", {})):
            mocked = patch(f"question_bank.writing.{name}", return_value=value)
            mocked.start()
            self.addCleanup(mocked.stop)
        ledger = patch("question_bank.writing.CreditTransaction.objects")
        self.ledger = ledger.start()
        self.ledger.filter.return_value.values_list.return_value = []
        self.addCleanup(ledger.stop)
        self.set_id = uuid.uuid4()
        self.group = WritingSet(set_id=self.set_id, created_at=timezone.now())
        self.path = f"/api/writing/sets/{self.set_id}/"

    @patch("question_bank.writing.complete_sets")
    def test_catalog_does_not_create_a_session(self, complete):
        complete.return_value.only.return_value = [self.group]
        result = self.client.get("/api/writing/sets/")
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json(), {"sets": [{"id": str(self.set_id), "number": 1, "questionCount": 4,
                                                  "submittedSlots": [], "unlocked": False, "setCost": 100}]})
        self.assertEqual(result["Cache-Control"], "private, no-store")
        self.assertNotIn("sessionid", result.cookies)
        complete.return_value.only.return_value = []
        self.assertEqual(self.client.get("/api/writing/sets/").json(), {"sets": []})

    @patch("question_bank.writing.Evaluation.objects.filter")
    @patch("question_bank.writing.WritingQuestion.objects")
    @patch("question_bank.writing.complete_sets")
    def test_guests_can_read_catalog_but_not_prompts_or_personal_history(self, complete, questions, history):
        groups = complete.return_value
        groups.only.return_value = [self.group]
        groups.filter.return_value.first.return_value = self.group
        groups.filter.return_value.count.return_value = 0
        questions.filter.return_value.order_by.return_value = [
            WritingQuestion(type_slot=slot, content_json=prompt(slot)) for slot in (51, 52, 53, 54)
        ]
        with patch("django.contrib.auth.middleware.get_user", return_value=AnonymousUser()):
            catalog = self.client.get("/api/writing/sets/")
            self.assertEqual(catalog.status_code, 200)
            self.assertEqual(catalog.json(), {"sets": [{"id": str(self.set_id), "number": 1, "questionCount": 4,
                                                      "submittedSlots": [], "unlocked": False, "setCost": 100}]})
            complete.assert_called_once()
            complete.reset_mock()
            detail = self.client.get(self.path)
        self.assertEqual(detail.status_code, 401)
        self.assertEqual(detail.json(), {"error": "authentication_required"})
        for result in (catalog, detail):
            self.assertEqual(result["Cache-Control"], "private, no-store")
            self.assertIn("Cookie", result["Vary"])
            self.assertNotIn("sessionid", result.cookies)
        complete.assert_not_called()
        questions.filter.assert_not_called()
        history.assert_not_called()
        self.ledger.filter.assert_not_called()

    @patch("question_bank.writing.has_active_plan", return_value=True)
    @patch("question_bank.writing.complete_sets")
    def test_plan_members_can_open_the_catalog_without_purchasing_each_set(self, complete, active):
        complete.return_value.only.return_value = [self.group]
        result = self.client.get("/api/writing/sets/")
        self.assertEqual(result.status_code, 200)
        item, = result.json()["sets"]
        self.assertTrue(item["unlocked"])
        self.assertEqual(item["setCost"], 0)
        active.assert_called_once_with(1)
        self.ledger.filter.assert_not_called()

    @patch("question_bank.writing.has_access", return_value=False)
    @patch("question_bank.writing.WritingQuestion.objects")
    @patch("question_bank.writing.complete_sets")
    def test_locked_set_returns_no_prompt_or_image(self, complete, questions, access):
        complete.return_value.filter.return_value.first.return_value = self.group
        response = self.client.get(self.path)
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json(), {"error": "set_locked"})
        questions.filter.assert_not_called()

    def test_guests_cannot_evaluate_or_read_private_data(self):
        with patch("django.contrib.auth.middleware.get_user", return_value=AnonymousUser()):
            for path in ("/api/writing/evaluation-config/", "/api/writing/evaluations/",
                         f"/api/writing/evaluations/{uuid.uuid4()}/", "/api/credits/", "/api/credits/transactions/"):
                with self.subTest(path=path):
                    result = self.client.get(path)
                    self.assertEqual(result.status_code, 401)
                    self.assertEqual(result.json(), {"error": "authentication_required"})
            self.assertEqual(self.client.post("/api/writing/evaluations/", {}, content_type="application/json").status_code, 401)

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


class WritingSubmissionHistoryTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username="submission-fixture")
        self.other = get_user_model().objects.create_user(username="submission-other")
        self.group = WritingSet(set_id=uuid.uuid4(), created_at=timezone.now())
        self.second = WritingSet(set_id=uuid.uuid4(), created_at=timezone.now())
        self.empty = WritingSet(set_id=uuid.uuid4(), created_at=timezone.now())
        for user in (self.user, self.other):
            wallet = CreditAccount.objects.create(user=user)
            CreditTransaction.objects.create(account=wallet, set_id=self.group.pk, kind="unlock", amount=100,
                                             balance_after=0, reserved_after=0)
        self.factory = RequestFactory()
        bank = patch("question_bank.writing.complete_sets")
        self.groups = bank.start().return_value
        self.groups.only.return_value = [self.group, self.second, self.empty]
        self.groups.filter.return_value.first.return_value = self.group
        self.groups.filter.return_value.count.return_value = 0
        self.addCleanup(bank.stop)
        questions = patch("question_bank.writing.WritingQuestion.objects")
        questions.start().filter.return_value.order_by.return_value = [
            WritingQuestion(type_slot=slot, content_json=prompt(slot)) for slot in (51, 52, 53, 54)
        ]
        self.addCleanup(questions.stop)

    def record(self, slot, *, status="succeeded", user=None, group=None):
        return Evaluation.objects.create(
            user=user or self.user, set_id=(group or self.group).pk, type_slot=slot,
            question_snapshot={}, answer={}, credit_cost=0, status=status,
            expires_at=timezone.now() - timedelta(days=1),
            completed_at=None if status == "processing" else timezone.now(),
            result={} if status == "succeeded" else None,
            total_score=0 if status == "succeeded" else None,
        )

    def read(self, *, user=None, detail=False):
        request = self.factory.get("/api/writing/sets/")
        request.user = user or self.user
        with self.assertNumQueries(4 if detail else 3):
            result = set_detail(request, self.group.pk) if detail else sets(request)
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result["Cache-Control"], "private, no-store")
        self.assertIn("Cookie", result["Vary"])
        return json.loads(result.content)

    def test_all_saved_statuses_and_old_submissions_count_once(self):
        self.record(53, status="processing")
        self.record(52, status="failed")
        # More than a page of newer attempts must not hide earlier slots.
        for _ in range(25):
            self.record(51)
        self.record(54, user=self.other)
        self.record(54, group=self.second)
        self.record(54, group=WritingSet(set_id=uuid.uuid4()))
        result = self.read()
        self.assertEqual([entry["submittedSlots"] for entry in result["sets"]], [[51, 52, 53], [54], []])
        self.assertEqual(self.read(detail=True)["submittedSlots"], [51, 52, 53])
        self.assertEqual(self.read(user=self.other)["sets"][0]["submittedSlots"], [54])
        self.assertEqual(self.read(user=self.other, detail=True)["submittedSlots"], [54])
        self.assertEqual(Evaluation.objects.filter(status="processing").count(), 1)

    def test_no_history_returns_empty_arrays(self):
        self.record(51, user=self.other)
        self.assertEqual([entry["submittedSlots"] for entry in self.read()["sets"]], [[], [], []])
        self.assertEqual(self.read(detail=True)["submittedSlots"], [])

    def test_empty_catalog_does_not_query_history(self):
        self.groups.only.return_value = []
        request = self.factory.get("/api/writing/sets/")
        request.user = self.user
        with self.assertNumQueries(0):
            self.assertJSONEqual(sets(request).content, {"sets": []})
