import io
import uuid
from datetime import timedelta

from django.core.management import call_command, get_commands
from django.db import IntegrityError, transaction
from django.test import Client, TransactionTestCase
from django.utils import timezone

from question_bank.models import Item, VisualAsset
from .bank import BankNotReady, load_set
from .models import Attempt, Exam
from .tests import BankFixtures


class IbtTests(BankFixtures, TransactionTestCase):
    def setUp(self):
        super().setUp()
        self.ibt_reading = self.make_set("reading", "ibt")
        self.ibt_listening = self.make_set("listening", "ibt")
        call_command("sync_exams", exam_format="ibt", stdout=io.StringIO())
        self.ibt_exam = Exam.objects.get(source_set_id=self.ibt_reading.pk)
        self.ibt_listen_exam = Exam.objects.get(source_set_id=self.ibt_listening.pk)

    def start(self, exam=None, mode="practice", client=None):
        result = (client or self.client).post("/api/ibt/attempts/", {
            "examId": str((exam or self.ibt_exam).pk), "mode": mode,
        }, content_type="application/json")
        self.assertIn(result.status_code, (200, 201), result.content)
        return result.json()

    def test_catalog_separates_formats_counts_durations_and_guest_slots(self):
        for exam_format, count, durations in (("pbt", 50, {"reading": 4200, "listening": None}),
                                               ("ibt", 30, {"reading": 2400, "listening": None})):
            rows = self.client.get(f"/api/{exam_format}/exams/").json()["exams"]
            self.assertEqual(len(rows), 2)
            for row in rows:
                self.assertEqual(row["examFormat"], exam_format)
                self.assertEqual(row["questionCount"], count)
                self.assertEqual(row["durationSeconds"], durations[row["section"]])
                self.assertTrue(row["guestAvailable"])
        self.assertEqual(self.ibt_exam.guest_slot, self.exam.guest_slot)

    def test_cross_format_start_and_all_attempt_endpoints_are_rejected(self):
        for exam, wrong_format in ((self.exam, "ibt"), (self.ibt_exam, "pbt")):
            response = self.client.post(f"/api/{wrong_format}/attempts/", {
                "examId": str(exam.pk), "mode": "practice",
            }, content_type="application/json")
            self.assertEqual(response.status_code, 404)
        for exam, exam_format, wrong_format in ((self.exam, "pbt", "ibt"), (self.ibt_exam, "ibt", "pbt")):
            data = self.client.post(f"/api/{exam_format}/attempts/", {
                "examId": str(exam.pk), "mode": "practice",
            }, content_type="application/json").json()
            path = f"/api/{wrong_format}/attempts/{data['id']}/"
            for method, suffix, body in (("get", "", None), ("get", "result/", None),
                                         ("post", "submit/", {}), ("put", "answers/1/", {"selectedOption": 2})):
                response = getattr(self.client, method)(path + suffix, body, content_type="application/json")
                self.assertEqual(response.status_code, 404)
        for exam_format in ("pbt", "ibt"):
            history = self.client.get(f"/api/{exam_format}/attempts/").json()["attempts"]
            self.assertEqual(len(history), 1)
            self.assertEqual(history[0]["examFormat"], exam_format)

    def test_ibt_snapshot_groups_images_and_private_answers(self):
        for exam, pair_start in ((self.ibt_exam, 23), (self.ibt_listen_exam, 15)):
            data = self.start(exam)
            response = self.client.get(f"/api/ibt/attempts/{data['id']}/")
            for secret in ("SECRET EXPLANATION", "SECRET SCRIPT", "correctAnswer", "content_json"):
                self.assertNotIn(secret, response.content.decode())
            items = response.json()["items"]
            self.assertEqual(len(items), 30)
            self.assertIsNone(items[pair_start - 2]["groupId"])
            groups = set()
            for position in range(pair_start, 31, 2):
                a, b = items[position - 1:position + 1]
                self.assertTrue(a["groupId"])
                self.assertEqual(a["groupId"], b["groupId"])
                self.assertNotIn(a["groupId"], groups)
                groups.add(a["groupId"])
            if exam.section == "reading":
                self.assertTrue(all(items[p - 1]["materialUrl"] for p in (4, 5, 6, 7)))
                self.assertEqual(items[9]["materialUrl"], "")
            else:
                self.assertTrue(all(item["audioUrl"] for item in items))
                self.assertEqual(items[0]["choices"], [""] * 4)
                self.assertEqual(len(items[1]["visuals"]), 4)

    def test_save_resume_clear_rounding_snapshot_and_idempotent_submit(self):
        self.client.force_login(self.user)
        data = self.start()
        self.assertEqual(data["answeredCount"], 0)
        path = f"/api/ibt/attempts/{data['id']}/"
        self.assertIsNone(data["expiresAt"])
        self.assertEqual(data["id"], self.start()["id"])
        for position in (1, 2):
            self.assertEqual(self.client.put(path + f"answers/{position}/", {"selectedOption": 2}, content_type="application/json").status_code, 200)
        self.client.put(path + "answers/3/", {"selectedOption": 2}, content_type="application/json")
        self.client.put(path + "answers/3/", {"selectedOption": None}, content_type="application/json")
        self.assertEqual(Attempt.objects.get(pk=data["id"]).answered_count, 2)
        self.assertEqual(self.start()["answeredCount"], 2)
        saved = self.client.get(path).json()["items"]
        self.assertEqual(saved[0]["selectedOption"], 2)
        self.assertIsNone(saved[2]["selectedOption"])
        Item.objects.filter(set=self.ibt_reading).update(correct_answer=3, explanation="UPDATED")
        first = self.client.post(path + "submit/").json()
        self.assertEqual(first["answeredCount"], 2)
        self.assertEqual(first["score"], 7)
        self.assertEqual(first["maxScore"], 100)
        self.assertEqual(first["submittedAt"], self.client.post(path + "submit/").json()["submittedAt"])
        result = self.client.get(path + "result/").json()
        self.assertEqual(result["answeredCount"], 2)
        self.assertEqual(result["items"][0]["explanation"], "SECRET EXPLANATION")
        self.assertEqual(result["items"][22]["groupId"], result["items"][23]["groupId"])
        self.assertEqual(self.client.put(path + "answers/3/", {"selectedOption": 2}, content_type="application/json").status_code, 409)

    def test_all_correct_scores_100_and_catalog_shows_member_progress(self):
        self.client.force_login(self.user)
        data = self.start()
        attempt = Attempt.objects.get(pk=data["id"])
        attempt.items.update(selected_option=2)
        self.assertEqual(self.client.post(f"/api/ibt/attempts/{attempt.pk}/submit/").json()["score"], 100)
        next_attempt = self.start()
        row = next(row for row in self.client.get("/api/ibt/exams/").json()["exams"] if row["id"] == str(self.ibt_exam.pk))
        self.assertEqual(row["myProgress"]["practice"]["latestResult"]["score"], 100)
        self.assertEqual(row["myProgress"]["practice"]["inProgressId"], next_attempt["id"])
        for row in self.client.get("/api/pbt/exams/").json()["exams"]:
            self.assertIsNone(row["myProgress"]["practice"]["latestResult"])

    def test_restart_keeps_ibt_score_and_creates_empty_attempt_for_each_mode(self):
        for member in (False, True):
            client = Client()
            if member:
                client.force_login(self.user)
            for mode in ("practice", "timed"):
                with self.subTest(member=member, mode=mode):
                    original = self.start(mode=mode, client=client)
                    old = Attempt.objects.get(pk=original["id"])
                    old.items.filter(position__in=[1, 2]).update(selected_option=2)
                    payload = {"examId": str(self.ibt_exam.pk), "mode": mode, "restartAttemptId": original["id"]}
                    response = client.post("/api/ibt/attempts/", payload, content_type="application/json")
                    self.assertEqual(response.status_code, 201)
                    old.refresh_from_db()
                    self.assertEqual((old.status, old.score), ("submitted", 7))
                    self.assertEqual(old.answered_count, 2)
                    self.assertEqual(response.json()["answeredCount"], 0)
                    result = client.get(f"/api/ibt/attempts/{old.pk}/result/")
                    if member:
                        self.assertEqual(result.json()["score"], 7)
                    else:
                        self.assertEqual(result.status_code, 403)
                    new = Attempt.objects.get(pk=response.json()["id"])
                    self.assertEqual(new.exam_format, "ibt")
                    self.assertEqual(new.items.count(), 30)
                    self.assertFalse(new.items.filter(selected_option__isnull=False).exists())
                    if mode == "timed":
                        self.assertEqual((new.expires_at - new.started_at).total_seconds(), 2400)
                    else:
                        self.assertIsNone(new.expires_at)
                    repeated = client.post("/api/ibt/attempts/", payload, content_type="application/json")
                    self.assertEqual((repeated.status_code, repeated.json()["id"]), (200, str(new.pk)))
                    self.assertEqual(self.start(mode=mode, client=client)["id"], str(new.pk))

    def test_restart_rejects_other_format_and_preserves_both_attempts(self):
        pbt = self.client.post("/api/pbt/attempts/", {
            "examId": str(self.exam.pk), "mode": "practice",
        }, content_type="application/json").json()
        ibt = self.start()
        for exam_format, exam, wrong_id in (("pbt", self.exam, ibt["id"]), ("ibt", self.ibt_exam, pbt["id"])):
            response = self.client.post(f"/api/{exam_format}/attempts/", {
                "examId": str(exam.pk), "mode": "practice", "restartAttemptId": wrong_id,
            }, content_type="application/json")
            self.assertEqual(response.status_code, 404)
        self.assertEqual(Attempt.objects.count(), 2)
        self.assertEqual(Attempt.objects.filter(status="in_progress").count(), 2)

    def test_timed_deadlines_and_late_answers(self):
        self.client.force_login(self.user)
        for exam, seconds in ((self.ibt_exam, 2400),):
            data = self.start(exam, "timed")
            attempt = Attempt.objects.get(pk=data["id"])
            self.assertEqual((attempt.expires_at - attempt.started_at).total_seconds(), seconds)
            path = f"/api/ibt/attempts/{attempt.pk}/"
            self.client.put(path + "answers/1/", {"selectedOption": 2}, content_type="application/json")
            expiry = timezone.now() - timedelta(seconds=1)
            Attempt.objects.filter(pk=attempt.pk).update(expires_at=expiry)
            self.assertEqual(self.client.put(path + "answers/2/", {"selectedOption": 2}, content_type="application/json").status_code, 409)
            result = self.client.get(path + "result/").json()
            self.assertTrue(result["timedOut"])
            self.assertEqual(result["score"], 3)
            self.assertEqual(result["answeredCount"], 1)
            self.assertEqual(result["submittedAt"], expiry.isoformat())

    def test_listening_has_no_overall_deadline_and_submits_explicitly(self):
        self.client.force_login(self.user)
        data = self.start(self.ibt_listen_exam, "timed")
        attempt = Attempt.objects.get(pk=data["id"])
        self.assertIsNone(data["expiresAt"])
        self.assertIsNone(attempt.expires_at)
        Attempt.objects.filter(pk=attempt.pk).update(started_at=timezone.now() - timedelta(hours=2))
        path = f"/api/ibt/attempts/{attempt.pk}/"
        self.assertEqual(self.client.get(path).json()["status"], "in_progress")
        self.assertEqual(self.client.put(path + "answers/30/", {"selectedOption": 2}, content_type="application/json").status_code, 200)
        self.assertEqual(self.start(self.ibt_listen_exam, "timed")["id"], data["id"])
        result = self.client.post(path + "submit/").json()
        self.assertEqual((result["status"], result["score"], result["timedOut"]), ("submitted", 3, False))
        self.assertEqual(self.client.post(path + "submit/").json()["submittedAt"], result["submittedAt"])

    def test_only_timed_listening_allows_a_null_deadline(self):
        for exam in (self.exam, self.listen_exam, self.ibt_exam, self.ibt_listen_exam):
            with self.subTest(exam_format=exam.exam_format, section=exam.section):
                fields = dict(exam=exam, exam_format=exam.exam_format, section=exam.section, title=exam.title,
                              guest_id=uuid.uuid4(), mode="timed", started_at=timezone.now(), expires_at=None)
                if exam.section == "listening":
                    Attempt.objects.create(**fields)
                else:
                    with self.assertRaises(IntegrityError), transaction.atomic():
                        Attempt.objects.create(**fields)

    def test_guest_restrictions_ownership_and_csrf(self):
        self.ibt_exam.guest_slot = None
        self.ibt_exam.save()
        payload = {"examId": str(self.ibt_exam.pk), "mode": "practice"}
        self.assertEqual(self.client.post("/api/ibt/attempts/", payload, content_type="application/json").status_code, 403)
        self.client.force_login(self.user)
        data = self.start()
        path = f"/api/ibt/attempts/{data['id']}/"
        other = Client()
        for method, suffix, body in (("get", "", None), ("get", "result/", None),
                                     ("post", "submit/", {}), ("put", "answers/1/", {"selectedOption": 2})):
            self.assertEqual(getattr(other, method)(path + suffix, body, content_type="application/json").status_code, 404)
        strict = Client(enforce_csrf_checks=True)
        for method, url in (("post", "/api/ibt/attempts/"), ("put", path + "answers/1/"), ("post", path + "submit/")):
            response = getattr(strict, method)(url, {}, content_type="application/json")
            self.assertEqual(response.status_code, 403)
            self.assertEqual(response.json()["error"], "csrf_failed")
        for value in (0, 5, True, "2"):
            self.assertEqual(self.client.put(path + "answers/1/", {"selectedOption": value}, content_type="application/json").status_code, 400)
        self.assertEqual(self.client.put(path + "answers/31/", {"selectedOption": 2}, content_type="application/json").status_code, 404)

    def test_bank_rejects_missing_media_incomplete_sets_and_wrong_format(self):
        with self.assertRaises(BankNotReady):
            load_set(self.ibt_reading.pk, "reading", "pbt")
        for source, section, position in ((self.ibt_reading, "reading", 4), (self.ibt_listening, "listening", 1)):
            VisualAsset.objects.filter(item__set=source, item__position=position).update(is_current=False)
            with self.assertRaises(BankNotReady):
                load_set(source.pk, section, "ibt")
        self.ibt_reading.items.filter(position=30).delete()
        with self.assertRaisesRegex(BankNotReady, "requires_30_questions"):
            load_set(self.ibt_reading.pk, "reading", "ibt")

    def test_bank_rejects_mismatched_shared_material(self):
        item = self.ibt_reading.items.get(position=24)
        item.content_json["passage"] = "Different passage"
        item.save()
        with self.assertRaisesRegex(BankNotReady, "invalid_question_group"):
            load_set(self.ibt_reading.pk, "reading", "ibt")

    def test_grammar_uses_content_stem_when_passage_is_empty(self):
        item = self.ibt_reading.items.get(position=1)
        item.stem = "Choose the correct answer."
        item.content_json.update(passage="", stem="친구와 전화로 ( ) 초인종이 울렸어요.")
        item.save()
        snapshot = load_set(self.ibt_reading.pk, "reading", "ibt")[0]["snapshot"]
        self.assertEqual(snapshot["passage"], item.content_json["stem"])
        self.assertEqual(snapshot["prompt"], "Synthetic prompt")

    def test_sync_defaults_to_both_and_filters_without_touching_existing_rows(self):
        pbt = self.make_set("reading")
        ibt = self.make_set("reading", "ibt")
        before = list(Exam.objects.values())
        output = io.StringIO()
        call_command("sync_exams", check=True, stdout=output)
        self.assertEqual(list(Exam.objects.values()), before)
        self.assertIn("pbt reading", output.getvalue())
        self.assertIn("ibt reading", output.getvalue())
        call_command("sync_exams", exam_format="pbt", stdout=io.StringIO())
        self.assertTrue(Exam.objects.filter(source_set_id=pbt.pk).exists())
        self.assertFalse(Exam.objects.filter(source_set_id=ibt.pk).exists())
        self.ibt_exam.is_published = False
        self.ibt_exam.title = "Custom title"
        self.ibt_exam.save()
        call_command("sync_exams", stdout=io.StringIO())
        added = Exam.objects.get(source_set_id=ibt.pk)
        self.assertEqual((added.display_order, added.guest_slot), (2, 2))
        self.ibt_exam.refresh_from_db()
        self.assertFalse(self.ibt_exam.is_published)
        self.assertEqual(self.ibt_exam.title, "Custom title")
        before = list(Exam.objects.values())
        call_command("sync_exams", stdout=io.StringIO())
        self.assertEqual(list(Exam.objects.values()), before)
        self.assertNotIn("sync_pbt_exams", get_commands())

    def test_guest_slot_uniqueness_is_per_format_and_section(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            Exam.objects.create(source_set_id=uuid.uuid4(), exam_format="ibt", section="reading",
                                title="Duplicate", display_order=2, guest_slot=1)
