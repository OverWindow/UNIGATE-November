from datetime import timedelta
from itertools import permutations

from django.test import Client, SimpleTestCase, TransactionTestCase
from django.utils import timezone

from question_bank.models import Item
from .bank import BankNotReady, load_set
from .models import Attempt, Exam
from .sentence_order import choice_order, sentence_material, valid_selected_order
from .tests import BankFixtures


PASSAGE = "(가) 첫 번째 문장입니다.\n(나) 두 번째 문장입니다.\n(다) 세 번째 문장입니다.\n(라) 네 번째 문장입니다."
CHOICES = ["(가) - (나) - (다) - (라)", "(나) - (라) - (가) - (다)",
           "(라) - (나) - (가) - (다)", "(나) - (라) - (다) - (가)"]
CORRECT = ["나", "라", "가", "다"]


class SentenceOrderParsingTests(SimpleTestCase):
    def test_parse_multiline_sentences_and_all_orders(self):
        sentences = sentence_material(PASSAGE.replace("첫 번째", "첫 줄\n두 번째 줄"), CHOICES)
        self.assertEqual([sentence["id"] for sentence in sentences], list("가나다라"))
        self.assertIn("\n", sentences[0]["text"])
        self.assertEqual(choice_order(CHOICES[1]), CORRECT)
        for order in permutations("가나다라"):
            self.assertTrue(valid_selected_order(list(order)))
        self.assertTrue(valid_selected_order(["나", None, "가", None]))

    def test_malformed_material_and_choices_are_rejected(self):
        for passage, choices in [(PASSAGE.replace("(라)", "(가)"), CHOICES),
                                 (PASSAGE, [CHOICES[0]] * 4),
                                 (PASSAGE, ["(가) - (가) - (다) - (라)"] + CHOICES[1:]),
                                 (PASSAGE, [CHOICES[0] + " extra"] + CHOICES[1:])]:
            with self.assertRaises(ValueError):
                sentence_material(passage, choices)


class SentenceOrderTests(BankFixtures, TransactionTestCase):
    def setUp(self):
        super().setUp()
        self.ibt_reading = self.make_set("reading", "ibt")
        self.ibt_exam = Exam.objects.create(source_set_id=self.ibt_reading.pk, exam_format="ibt", title="Synthetic IBT",
                                           section="reading", display_order=1, guest_slot=1, is_published=True)
        for source, item_type in [(self.reading, "sentence_order"), (self.ibt_reading, "ibt_sentence_order")]:
            positions = [13, 14, 15] if source.exam_format == "pbt" else [13, 14]
            Item.objects.filter(set=source, position__in=positions).update(
                item_type=item_type, stem=PASSAGE, choices=CHOICES, correct_answer=2,
                content_json={"passage": PASSAGE, "question_prompt": "순서를 고르십시오.", "answer": 2})
        self.client.force_login(self.user)

    def start(self, exam_format, mode="practice"):
        exam = self.ibt_exam if exam_format == "ibt" else self.exam
        result = self.client.post(f"/api/{exam_format}/attempts/", {"examId": str(exam.pk), "mode": mode}, content_type="application/json")
        self.assertEqual(result.status_code, 201, result.content)
        return f"/api/{exam_format}/attempts/{result.json()['id']}/"

    def save(self, path, value, position=13, client=None):
        return (client or self.client).put(path + f"answers/{position}/", value, content_type="application/json")

    def test_partial_restore_and_all_24_permutations_are_saved(self):
        path = self.start("ibt")
        partial = ["나", None, "가", None]
        self.assertEqual(self.save(path, {"selectedOrder": partial}).status_code, 200)
        self.assertEqual(self.client.get(path).json()["answeredCount"], 0)
        item = self.client.get(path).json()["items"][12]
        self.assertEqual(item["selectedOrder"], partial)
        self.assertEqual(item["answerMode"], "sentence_order")
        self.assertEqual(len(item["sentences"]), 4)
        self.assertEqual(item["choices"], [])
        self.assertNotIn("correctOrder", item)
        self.assertNotIn("correctAnswer", item)
        for order in permutations("가나다라"):
            self.assertEqual(self.save(path, {"selectedOrder": list(order)}).status_code, 200)
            self.assertEqual(self.client.get(path).json()["items"][12]["selectedOrder"], list(order))
            self.assertEqual(self.client.get(path).json()["answeredCount"], 1)
        self.assertEqual(self.save(path, {"selectedOrder": partial}).status_code, 200)
        self.assertEqual(self.client.get(path).json()["answeredCount"], 0)
        self.assertEqual(self.save(path, {"selectedOrder": [None] * 4}).status_code, 200)
        self.assertEqual(self.client.get(path).json()["items"][12]["selectedOrder"], [None] * 4)
        self.assertEqual(Attempt.objects.get(pk=path.split("/")[-2]).answered_count, 0)

    def test_pbt_sentence_order_keeps_choices_saves_resumes_and_grades(self):
        path = self.start("pbt")
        items = self.client.get(path).json()["items"][12:15]
        for item in items:
            self.assertEqual(item["itemType"], "sentence_order")
            self.assertEqual(item["passage"], PASSAGE)
            self.assertEqual(item["prompt"], "순서를 고르십시오.")
            self.assertEqual(item["choices"], CHOICES)
            self.assertNotIn("answerMode", item)
            self.assertNotIn("sentences", item)
            self.assertNotIn("selectedOrder", item)
            self.assertNotIn("correctAnswer", item)
            self.assertEqual(self.save(path, {"selectedOrder": CORRECT}, position=item["position"]).status_code, 400)
        for position, option in [(13, 2), (14, 1), (15, 2), (15, None)]:
            self.assertEqual(self.save(path, {"selectedOption": option}, position=position).status_code, 200)
        resumed = self.client.post("/api/pbt/attempts/", {"examId": str(self.exam.pk), "mode": "practice"}, content_type="application/json")
        self.assertEqual(resumed.status_code, 200)
        self.assertEqual(resumed.json()["id"], path.split("/")[-2])
        self.assertEqual(resumed.json()["answeredCount"], 2)
        self.assertEqual([item["selectedOption"] for item in self.client.get(path).json()["items"][12:15]], [2, 1, None])
        Item.objects.filter(set=self.reading, position=13).update(correct_answer=1)
        self.assertEqual(self.client.post(path + "submit/").json()["score"], 2)
        result = self.client.get(path + "result/").json()["items"][12:15]
        self.assertEqual([item["isCorrect"] for item in result], [True, False, False])
        for item in result:
            self.assertEqual(item["choices"], CHOICES)
            self.assertNotIn("correctOrder", item)
            self.assertNotIn("answerMode", item)

    def test_correct_grading_uses_snapshot_and_result_exposes_order(self):
        path = self.start("ibt")
        self.save(path, {"selectedOrder": CORRECT})
        self.save(path, {"selectedOrder": ["가", None, "라", None]}, position=14)
        Item.objects.filter(set=self.ibt_reading, position=13).update(correct_answer=1)
        result = self.client.post(path + "submit/").json()
        self.assertEqual(result["score"], 3)
        self.assertEqual(result["answeredCount"], 1)
        items = self.client.get(path + "result/").json()["items"]
        self.assertTrue(items[12]["isCorrect"])
        self.assertFalse(items[13]["isCorrect"])
        self.assertEqual(items[12]["correctOrder"], CORRECT)
        self.assertEqual(items[13]["selectedOrder"], ["가", None, "라", None])
        self.assertEqual(self.save(path, {"selectedOrder": CORRECT}).status_code, 409)
        self.assertEqual(self.client.post(path + "submit/").json()["submittedAt"], result["submittedAt"])

    def test_non_choice_order_is_wrong_and_guest_cannot_see_result(self):
        self.client.logout()
        path = self.start("ibt")
        order = ["다", "가", "나", "라"]
        self.save(path, {"selectedOrder": order})
        self.client.post(path + "submit/")
        item = self.client.get(path).json()["items"][12]
        self.assertEqual(item["selectedOrder"], order)
        self.assertNotIn("correctOrder", item)
        self.assertNotIn("isCorrect", item)
        self.assertEqual(self.client.get(path + "result/").status_code, 403)
        stored = Attempt.objects.get(pk=path.split("/")[-2]).items.get(position=13)
        self.assertFalse(stored.is_correct)
        self.assertEqual(stored.attempt.answered_count, 1)

    def test_bad_payload_wrong_mode_and_foreign_owner_are_rejected(self):
        path = self.start("ibt")
        self.save(path, {"selectedOrder": CORRECT})
        for order in (None, [], "가나다라", ["가"] * 4, ["가", "나", "다", "마"],
                      [True, None, None, None], [{}, None, None, None], ["", None, None, None]):
            self.assertEqual(self.save(path, {"selectedOrder": order}).status_code, 400)
        for value in ({}, {"selectedOption": 2}, {"selectedOrder": CORRECT, "selectedOption": 2}):
            self.assertEqual(self.save(path, value).status_code, 400)
        self.assertEqual(self.save(path, {"selectedOrder": CORRECT}, position=1).status_code, 400)
        self.assertEqual(self.save(path, {"selectedOption": 2}, position=1).status_code, 200)
        self.assertEqual(self.save(path, {"selectedOrder": CORRECT}, client=Client()).status_code, 404)
        self.assertEqual(self.client.get(path).json()["items"][12]["selectedOrder"], CORRECT)

    def test_expiry_grades_last_saved_order_and_legacy_stays_multiple_choice(self):
        path = self.start("ibt", mode="timed")
        self.save(path, {"selectedOrder": CORRECT})
        attempt = Attempt.objects.get(pk=path.split("/")[-2])
        legacy = attempt.items.get(position=14)
        legacy.snapshot.pop("answerMode")
        legacy.snapshot.pop("sentences")
        legacy.save(update_fields=["snapshot"])
        self.assertEqual(self.save(path, {"selectedOption": 2}, position=14).status_code, 200)
        self.assertEqual(self.save(path, {"selectedOrder": CORRECT}, position=14).status_code, 400)
        Attempt.objects.filter(pk=attempt.pk).update(expires_at=timezone.now() - timedelta(seconds=1))
        self.assertEqual(self.save(path, {"selectedOrder": [None] * 4}).status_code, 409)
        result = self.client.get(path + "result/").json()
        self.assertTrue(result["timedOut"])
        self.assertEqual(result["answeredCount"], 2)
        self.assertTrue(result["items"][12]["isCorrect"])
        self.assertEqual(result["items"][12]["selectedOrder"], CORRECT)
        self.assertTrue(result["items"][13]["isCorrect"])
        self.assertNotIn("answerMode", result["items"][13])
        self.assertEqual(result["items"][13]["choices"], CHOICES)

    def test_invalid_source_material_does_not_start_an_attempt(self):
        Item.objects.filter(set=self.ibt_reading, position=13).update(content_json={"passage": "Malformed"})
        with self.assertRaises(BankNotReady):
            load_set(self.ibt_reading.pk, "reading", "ibt")
        result = self.client.post("/api/ibt/attempts/", {"examId": str(self.ibt_exam.pk), "mode": "practice"}, content_type="application/json")
        self.assertEqual(result.status_code, 409)
        self.assertFalse(Attempt.objects.exists())
