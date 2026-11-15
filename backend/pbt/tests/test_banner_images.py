import uuid
from unittest.mock import patch

from django.db import connection
from django.test import TransactionTestCase

from question_bank.models import Item, VisualAsset
from ..bank import BankNotReady
from ..models import Attempt, Exam
from .test_core import BankFixtures


class BannerImageTests(BankFixtures, TransactionTestCase):
    def setUp(self):
        super().setUp()
        self.source = self.make_set("reading", "ibt")
        self.ibt_exam = Exam.objects.create(source_set_id=self.source.pk, exam_format="ibt",
            title="Synthetic IBT", section="reading", display_order=1, guest_slot=1, is_published=True)
        self.client.force_login(self.user)

    def start(self, legacy=False, mode="practice", exam=None):
        exam = exam or self.ibt_exam
        response = self.client.post(f"/api/{exam.exam_format}/attempts/",
            {"examId": str(exam.pk), "mode": mode}, content_type="application/json")
        self.assertEqual(response.status_code, 201)
        self.enter_timed(response.json(), self.client)
        attempt = Attempt.objects.get(pk=response.json()["id"])
        if legacy:
            self.store_legacy_items(attempt)
        return attempt, f"/api/{exam.exam_format}/attempts/{attempt.pk}/"

    def answer(self, path, position):
        response = self.client.put(path + f"answers/{position}/", {"selectedOption": 2},
                                  content_type="application/json")
        self.assertEqual(response.status_code, 200)

    def test_new_banners_only_change_display_for_saved_and_legacy_attempts(self):
        for legacy in (False, True):
            for mode in ("practice", "timed"):
                with self.subTest(legacy=legacy, mode=mode):
                    attempt, path = self.start(legacy, mode)
                    for position in (4, 5, 6, 7):
                        self.answer(path, position)
                        item = attempt.items.get(position=position)
                        item.snapshot["materialUrl"] = "" if position == 4 else "https://example.invalid/old.png"
                        item.save(update_fields=["snapshot"])
                    original_items = list(attempt.items.values())
                    original_attempt = Attempt.objects.values().get(pk=attempt.pk)
                    expected = self.client.get(path).json()["items"]
                    for position in (4, 5, 6, 7):
                        url = f"https://example.invalid/banner-{legacy}-{mode}-{position}.png"
                        VisualAsset.objects.filter(item__set=self.source, item__position=position).update(storage_url=url)
                        expected[position - 1]["materialUrl"] = url
                    Item.objects.filter(set=self.source, position__in=(4, 5, 6, 7)).update(explanation="New explanation")

                    detail = self.client.get(path)
                    self.assertEqual(detail.status_code, 200)
                    self.assertEqual(detail.json()["items"], expected)
                    entered = self.client.post(path + "enter/",
                        {"sessionToken": self.client.defaults.get("HTTP_X_EXAM_SESSION", str(uuid.uuid4()))},
                        content_type="application/json")
                    self.assertEqual(entered.status_code, 200)
                    self.assertEqual(entered.json()["items"], expected)
                    self.assertEqual(list(attempt.items.values()), original_items)
                    self.assertEqual(Attempt.objects.values().get(pk=attempt.pk), original_attempt)

                    submitted = self.client.post(path + "submit/").json()
                    self.assertEqual(submitted["score"], 13)
                    stored_result = list(attempt.items.values())
                    stored_attempt = Attempt.objects.values().get(pk=attempt.pk)
                    result = self.client.get(path + "result/")
                    self.assertEqual(result.status_code, 200)
                    self.assertEqual(result.json()["score"], 13)
                    originals = {item["position"]: item for item in original_items}
                    for position in (4, 5, 6, 7):
                        question = result.json()["items"][position - 1]
                        self.assertEqual(question["materialUrl"], expected[position - 1]["materialUrl"])
                        self.assertEqual(question["explanation"], originals[position]["explanation"])
                        self.assertEqual((question["selectedOption"], question["correctAnswer"], question["isCorrect"]), (2, 2, True))
                    self.assertEqual(list(attempt.items.values()), stored_result)
                    self.assertEqual(Attempt.objects.values().get(pk=attempt.pk), stored_attempt)

    def test_changed_question_content_or_answer_keeps_saved_banner(self):
        attempt, path = self.start()
        self.answer(path, 4)
        saved = attempt.items.get(position=4)
        original = self.source.items.get(position=4)
        baseline = {"content_json": original.content_json, "choices": original.choices,
                    "correct_answer": original.correct_answer, "item_type": original.item_type}
        VisualAsset.objects.filter(item=original).update(storage_url="https://example.invalid/new.png")
        changes = [{"content_json": {**original.content_json, field: "Changed content"}}
                   for field in ("passage", "question_prompt", "auxiliary_text", "highlight_text")]
        changes += [{"choices": ["b", "a", "c", "d"]}, {"correct_answer": 3}, {"item_type": "changed_type"}]
        for change in changes:
            with self.subTest(change=change):
                Item.objects.filter(pk=original.pk).update(**(baseline | change))
                response = self.client.get(path)
                self.assertEqual(response.status_code, 200)
                question = response.json()["items"][3]
                self.assertEqual(question["materialUrl"], saved.snapshot["materialUrl"])
                self.assertEqual(question["passage"], saved.snapshot["passage"])
                self.assertEqual(question["choices"], saved.snapshot["choices"])
                self.assertEqual(question["selectedOption"], 2)
                saved.refresh_from_db()
                self.assertEqual(saved.correct_answer, 2)

    def test_different_source_item_keeps_saved_banner(self):
        attempt, path = self.start()
        self.answer(path, 4)
        saved = attempt.items.get(position=4)
        saved.source_item_id = uuid.uuid4()
        saved.save(update_fields=["source_item_id"])
        VisualAsset.objects.filter(item__set=self.source, item__position=4).update(storage_url="https://example.invalid/new.png")
        self.assertEqual(self.client.get(path).json()["items"][3]["materialUrl"], saved.snapshot["materialUrl"])

    def test_inactive_mismatched_or_invalid_assets_keep_legacy_banner(self):
        attempt, path = self.start(legacy=True)
        asset = VisualAsset.objects.get(item__set=self.source, item__position=4)
        baseline = {"is_current": True, "content_hash": asset.content_hash, "storage_url": asset.storage_url}
        original = list(attempt.items.values())
        for change in ({"is_current": False}, {"content_hash": "f" * 64}, {"storage_url": "javascript:alert(1)"}):
            with self.subTest(change=change):
                VisualAsset.objects.filter(pk=asset.pk).update(**(baseline | change))
                response = self.client.get(path)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()["items"][3]["materialUrl"], asset.storage_url)
                self.assertEqual(list(attempt.items.values()), original)

    def test_legacy_display_survives_bank_unavailability_and_database_errors(self):
        attempt, path = self.start(legacy=True)
        original = list(attempt.items.values())

        def missing_table(*args):
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1 FROM topik_bank.missing_banner_test_table")

        for failure in (BankNotReady, missing_table):
            with self.subTest(failure=failure), patch("pbt.services.load_set", side_effect=failure):
                response = self.client.get(path)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()["items"][3]["materialUrl"], original[3]["snapshot"]["materialUrl"])
                self.assertEqual(list(attempt.items.values()), original)

    def test_pbt_and_other_ibt_positions_keep_saved_materials(self):
        for exam, position in ((self.exam, 10), (self.ibt_exam, 8)):
            with self.subTest(format=exam.exam_format, position=position):
                attempt, path = self.start(exam=exam)
                self.answer(path, position)
                saved = attempt.items.get(position=position)
                source = Item.objects.get(pk=saved.source_item_id)
                asset = VisualAsset.objects.get(item__set=self.source, item__position=4)
                asset.pk = uuid.uuid4()
                asset.item = source
                asset.storage_url = "https://example.invalid/new.png"
                asset.save(force_insert=True)
                response = self.client.get(path)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()["items"][position - 1]["materialUrl"], saved.snapshot["materialUrl"])
