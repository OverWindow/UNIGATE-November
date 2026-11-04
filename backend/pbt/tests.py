import io
import uuid
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.db import connection, IntegrityError, transaction
from django.test import Client, TransactionTestCase
from django.utils import timezone

from question_bank.models import AudioAsset, Item, ItemAudioBinding, QuestionSet, SetItemAudioBinding, VisualAsset
from .bank import BankNotReady, load_set
from .models import Attempt, AttemptItem, Exam


class PbtTests(TransactionTestCase):
    def setUp(self):
        self.bank_models = (QuestionSet, Item, AudioAsset, ItemAudioBinding, SetItemAudioBinding, VisualAsset)
        with connection.cursor() as cursor:
            cursor.execute("CREATE SCHEMA topik_bank")
        with connection.schema_editor() as editor:
            for model in self.bank_models:
                editor.create_model(model)
        self.reading = self.make_set("reading")
        self.listening = self.make_set("listening")
        self.exam = Exam.objects.create(source_set_id=self.reading.pk, title="Synthetic reading", section="reading", display_order=1, guest_slot=1, is_published=True)
        self.listen_exam = Exam.objects.create(source_set_id=self.listening.pk, title="Synthetic listening", section="listening", display_order=1, guest_slot=1, is_published=True)
        self.user = get_user_model().objects.create_user(username="pbt-fixture", password="synthetic-test-only")

    def tearDown(self):
        with connection.schema_editor() as editor:
            for model in reversed(self.bank_models):
                editor.delete_model(model)
        with connection.cursor() as cursor:
            cursor.execute("DROP SCHEMA topik_bank")

    def make_set(self, section):
        now = timezone.now()
        source = QuestionSet.objects.create(set_id=uuid.uuid4(), section=section, generator_provider="synthetic", generator_model="synthetic", generator_version="synthetic", created_at=now, set_sequence=1, review_status="reviewed", default_target_level=4, published_at=now)
        for position in range(1, 51):
            content = {"question_prompt": "Synthetic prompt", "passage": "Synthetic passage", "answer": 2, "explanation": "SECRET EXPLANATION", "dialogue_turns": [{"speaker": "A", "text": "SECRET SCRIPT"}]}
            item = Item.objects.create(item_id=uuid.uuid4(), source_key=str(uuid.uuid4()), created_at=now, updated_at=now,
                section=section, type_slot=position, item_type="content_match", primary_skill=section, target_level=4, stem_length=10, choice_count=4,
                generator_provider="synthetic", generator_model="synthetic", generator_version="synthetic", prompt_version="a" * 64,
                review_status="reviewed", stem="SECRET SCRIPT" if section == "listening" else "Synthetic passage", choices=["a", "b", "c", "d"],
                correct_answer=2, explanation="SECRET EXPLANATION", content_json=content, source_provenance={}, content_hash="b" * 64, set=source, position=position)
            if section == "reading" and position == 10:
                VisualAsset.objects.create(visual_asset_id=uuid.uuid4(), item=item, content_hash=item.content_hash, option_number=1,
                    visual_role="material", storage_bucket="", storage_path="", storage_url="https://example.invalid/chart.png",
                    mime_type="image/png", byte_size=1, is_current=True, created_at=now, storage_backend="s3")
        if section == "listening":
            audio = AudioAsset.objects.create(audio_asset_id=uuid.uuid4(), source_hash="c" * 64, provider="synthetic", model_name="synthetic",
                language_code="ko", female_voice="", male_voice="", mime_type="audio/mpeg", storage_bucket="", storage_path="",
                storage_url="https://example.invalid/audio.mp3", byte_size=1, created_at=now, tts_style={}, narration_version="synthetic", storage_backend="s3")
            SetItemAudioBinding.objects.bulk_create([SetItemAudioBinding(set=source, position=p, audio_asset=audio, source_hash="c" * 64, is_current=True, created_at=now) for p in range(1, 51)])
        return source

    def start(self, exam=None, mode="practice", client=None):
        client = client or self.client
        result = client.post("/api/pbt/attempts/", {"examId": str((exam or self.exam).pk), "mode": mode}, content_type="application/json")
        self.assertIn(result.status_code, (200, 201), result.content)
        return result.json()

    def test_guest_catalog_and_direct_member_access(self):
        for n in (2, 3, 4):
            for section in ("reading", "listening"):
                source = self.make_set(section)
                Exam.objects.create(source_set_id=source.pk, title=f"Synthetic {n}", section=section, display_order=n, guest_slot=n if n <= 3 else None, is_published=True)
        catalog = self.client.get("/api/pbt/exams/")
        self.assertIn("no-store", catalog.headers["Cache-Control"])
        rows = catalog.json()["exams"]
        self.assertEqual(sum(e["accessible"] for e in rows), 6)
        self.assertEqual(sum(e["questionCount"] for e in rows if e["accessible"]), 300)
        locked = next(e for e in rows if not e["accessible"])
        response = self.client.post("/api/pbt/attempts/", {"examId": locked["id"], "mode": "practice"}, content_type="application/json")
        self.assertEqual(response.status_code, 403)
        self.client.force_login(self.user)
        self.assertTrue(all(e["accessible"] for e in self.client.get("/api/pbt/exams/").json()["exams"]))
        with self.assertRaises(IntegrityError), transaction.atomic():
            Exam.objects.create(source_set_id=uuid.uuid4(), title="Fourth slot", section="reading", display_order=5, guest_slot=4)

    def test_practice_unlimited_and_timed_deadlines(self):
        practice = self.start()
        self.assertIsNone(practice["expiresAt"])
        self.assertEqual(AttemptItem.objects.filter(attempt_id=practice["id"]).count(), 50)
        for exam, seconds in ((self.exam, 4200), (self.listen_exam, 3600)):
            data = self.start(exam, "timed")
            attempt = Attempt.objects.get(pk=data["id"])
            self.assertEqual((attempt.expires_at - attempt.started_at).total_seconds(), seconds)
        Attempt.objects.filter(pk=practice["id"]).update(started_at=timezone.now() - timedelta(days=90))
        self.assertEqual(self.client.get(f"/api/pbt/attempts/{practice['id']}/").json()["status"], "in_progress")

    def test_members_can_start_restricted_sets_and_other_accounts_cannot_read_them(self):
        self.exam.guest_slot = None
        self.exam.save()
        denied = self.client.post("/api/pbt/attempts/", {"examId": str(self.exam.pk), "mode": "practice"}, content_type="application/json")
        self.assertEqual(denied.status_code, 403)
        self.client.force_login(self.user)
        data = self.start()
        other = Client()
        other.force_login(get_user_model().objects.create_user(username="other-pbt-fixture", password="synthetic-test-only"))
        path = f"/api/pbt/attempts/{data['id']}/"
        self.assertEqual(other.get(path).status_code, 404)
        self.assertEqual(other.post(path + "submit/").status_code, 404)
        self.assertEqual(other.get("/api/pbt/attempts/").json()["attempts"], [])

    def test_no_answers_or_listening_scripts_before_submission(self):
        data = self.start(self.listen_exam)
        path = f"/api/pbt/attempts/{data['id']}/"
        response = self.client.get(path)
        body = response.content.decode()
        for secret in ("SECRET EXPLANATION", "SECRET SCRIPT", "correctAnswer", "dialogue_turns", "content_json"):
            self.assertNotIn(secret, body)
        self.assertEqual(response.json()["items"][0]["passage"], "")
        self.assertEqual(self.client.get(path + "result/").status_code, 409)
        self.client.post(path + "submit/")
        result = self.client.get(path + "result/").json()
        self.assertEqual(result["items"][0]["correctAnswer"], 2)
        self.assertIn("SECRET SCRIPT", result["items"][0]["transcript"])

    def test_save_resume_snapshot_and_idempotent_submission(self):
        data = self.start()
        path = f"/api/pbt/attempts/{data['id']}/"
        self.assertEqual(self.start()["id"], data["id"])
        self.assertEqual(self.client.put(path + "answers/1/", {"selectedOption": 2}, content_type="application/json").status_code, 200)
        self.assertEqual(self.client.get(path).json()["items"][0]["selectedOption"], 2)
        Item.objects.filter(set=self.reading).update(correct_answer=3, explanation="UPDATED")
        one = self.client.post(path + "submit/").json()
        two = self.client.post(path + "submit/").json()
        self.assertEqual(one["score"], 2)
        self.assertEqual(one["submittedAt"], two["submittedAt"])
        result = self.client.get(path + "result/").json()
        self.assertEqual(result["items"][0]["explanation"], "SECRET EXPLANATION")
        self.assertEqual(self.client.put(path + "answers/2/", {"selectedOption": 2}, content_type="application/json").status_code, 409)

    def test_deadline_rejects_late_answer_and_finalizes_without_browser_timer(self):
        data = self.start(mode="timed")
        path = f"/api/pbt/attempts/{data['id']}/"
        self.client.put(path + "answers/1/", {"selectedOption": 2}, content_type="application/json")
        expiry = timezone.now() - timedelta(seconds=1)
        Attempt.objects.filter(pk=data["id"]).update(expires_at=expiry)
        response = self.client.put(path + "answers/2/", {"selectedOption": 2}, content_type="application/json")
        self.assertEqual(response.status_code, 409)
        result = self.client.get(path + "result/").json()
        self.assertTrue(result["timedOut"])
        self.assertEqual(result["score"], 2)
        self.assertIsNone(result["items"][1]["selectedOption"])
        self.assertEqual(Attempt.objects.get(pk=data["id"]).submitted_at, expiry)

    def test_history_finalizes_expired_attempt(self):
        data = self.start(mode="timed")
        Attempt.objects.filter(pk=data["id"]).update(expires_at=timezone.now() - timedelta(seconds=1))
        row = self.client.get("/api/pbt/attempts/").json()["attempts"][0]
        self.assertEqual(row["status"], "submitted")
        self.assertEqual(row["score"], 0)

    def test_ownership_survives_login_but_not_another_guest(self):
        data = self.start()
        path = f"/api/pbt/attempts/{data['id']}/"
        other = Client()
        for suffix in ("", "result/"):
            self.assertEqual(other.get(path + suffix).status_code, 404)
        self.assertEqual(other.post(path + "submit/").status_code, 404)
        self.assertEqual(other.put(path + "answers/1/", {"selectedOption": 2}, content_type="application/json").status_code, 404)
        self.client.force_login(self.user)
        self.assertEqual(self.client.get(path).status_code, 200)
        member = self.start(self.listen_exam)
        self.assertEqual(Attempt.objects.get(pk=member["id"]).user, self.user)
        self.client.logout()
        self.assertEqual(self.client.get(f"/api/pbt/attempts/{member['id']}/").status_code, 404)

    def test_invalid_answers_and_csrf(self):
        data = self.start()
        path = f"/api/pbt/attempts/{data['id']}/answers/1/"
        for invalid in (0, 5, True, "2", {}, [2]):
            self.assertEqual(self.client.put(path, {"selectedOption": invalid}, content_type="application/json").status_code, 400)
        self.assertEqual(self.client.put(path, {"selectedOption": None}, content_type="application/json").status_code, 200)
        strict = Client(enforce_csrf_checks=True)
        for method, url in (("post", "/api/pbt/attempts/"), ("put", path), ("post", f"/api/pbt/attempts/{data['id']}/submit/")):
            response = getattr(strict, method)(url, {}, content_type="application/json")
            self.assertEqual(response.status_code, 403)
            self.assertEqual(response.json()["error"], "csrf_failed")

    def test_bank_requires_complete_current_assets_and_sanitizes_urls(self):
        self.assertEqual(len(load_set(self.listening.pk, "listening")), 50)
        AudioAsset.objects.update(storage_url="javascript:alert(1)")
        with self.assertRaises(BankNotReady):
            load_set(self.listening.pk, "listening")
        VisualAsset.objects.update(content_hash="outdated")
        with self.assertRaises(BankNotReady):
            load_set(self.reading.pk, "reading")
        response = self.client.post("/api/pbt/attempts/", {"examId": str(self.exam.pk), "mode": "practice"}, content_type="application/json")
        self.assertEqual(response.json()["error"], "exam_not_ready")
        self.assertFalse(Attempt.objects.exists())

    def test_visual_choices_do_not_expose_generation_descriptions(self):
        item = self.listening.items.get(position=1)
        item.item_type = "visual_scene"
        item.choices = []
        item.content_json = {"visual_options": [{"description": "SECRET IMAGE PROMPT"}]}
        item.save()
        for n in range(1, 5):
            VisualAsset.objects.create(visual_asset_id=uuid.uuid4(), item=item, content_hash=item.content_hash, option_number=n,
                visual_role="choice", storage_bucket="", storage_path="", storage_url=f"https://example.invalid/{n}.png",
                mime_type="image/png", byte_size=1, is_current=True, created_at=timezone.now(), storage_backend="s3")
        snapshot = load_set(self.listening.pk, "listening")[0]["snapshot"]
        self.assertEqual(len(snapshot["visuals"]), 4)
        self.assertEqual(snapshot["choices"], ["", "", "", ""])
        self.assertNotIn("SECRET IMAGE PROMPT", str(snapshot))

    def test_catalog_sync_preserves_existing_publication_and_guest_selection(self):
        self.exam.is_published = False
        self.exam.save()
        source = self.make_set("reading")
        call_command("sync_pbt_exams", stdout=io.StringIO(), stderr=io.StringIO())
        self.exam.refresh_from_db()
        self.assertFalse(self.exam.is_published)
        self.assertEqual(Exam.objects.get(source_set_id=source.pk).guest_slot, 2)
        call_command("sync_pbt_exams", stdout=io.StringIO(), stderr=io.StringIO())
        self.assertEqual(Exam.objects.count(), 3)
