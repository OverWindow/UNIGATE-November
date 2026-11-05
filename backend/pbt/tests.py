import io
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Barrier
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.db import connection, connections, DatabaseError, IntegrityError, transaction
from django.test import Client, TransactionTestCase
from django.utils import timezone

from question_bank.models import AudioAsset, Item, ItemAudioBinding, QuestionSet, VisualAsset
from .bank import BankNotReady, load_set
from .models import Attempt, AttemptItem, Exam


class BankFixtures:
    def setUp(self):
        self.bank_models = (QuestionSet, Item, AudioAsset, ItemAudioBinding, VisualAsset)
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

    def make_set(self, section, exam_format="pbt"):
        now = timezone.now()
        source = QuestionSet.objects.create(set_id=uuid.uuid4(), exam_format=exam_format, section=section, generator_provider="synthetic", generator_model="synthetic", generator_version="synthetic", created_at=now, set_sequence=1, review_status="reviewed", default_target_level=4, published_at=now)
        for position in range(1, 31 if exam_format == "ibt" else 51):
            content = {"question_prompt": "Synthetic prompt", "passage": "Synthetic passage", "answer": 2, "explanation": "SECRET EXPLANATION", "dialogue_turns": [{"speaker": "A", "text": "SECRET SCRIPT"}]}
            item_type = "content_match"
            if exam_format == "ibt":
                item_type = "ibt_content_match"
                if section == "listening" and position <= 2:
                    item_type = "ibt_visual_scene" if position == 1 else "ibt_visual_chart"
                elif position >= (15 if section == "listening" else 23):
                    item_type = f"ibt_pair_{(position - 1) // 2}"
            item = Item.objects.create(item_id=uuid.uuid4(), source_key=str(uuid.uuid4()), created_at=now, updated_at=now,
                exam_format=exam_format, section=section, type_slot=position, item_type=item_type, primary_skill=section, target_level=4, stem_length=10, choice_count=4,
                generator_provider="synthetic", generator_model="synthetic", generator_version="synthetic", prompt_version="a" * 64,
                review_status="reviewed", stem="SECRET SCRIPT" if section == "listening" else "Synthetic passage", choices=["a", "b", "c", "d"],
                correct_answer=2, explanation="SECRET EXPLANATION", content_json=content, source_provenance={}, content_hash="b" * 64, set=source, position=position)
            if section == "reading" and position in ((4, 5, 6, 7) if exam_format == "ibt" else (10,)):
                VisualAsset.objects.create(visual_asset_id=uuid.uuid4(), item=item, content_hash=item.content_hash, option_number=1,
                    visual_role="material", storage_bucket="", storage_path="", storage_url="https://example.invalid/chart.png",
                    mime_type="image/png", byte_size=1, is_current=True, created_at=now, storage_backend="s3")
            if exam_format == "ibt" and section == "listening" and position <= 2:
                for option in range(1, 5):
                    VisualAsset.objects.create(visual_asset_id=uuid.uuid4(), item=item, content_hash=item.content_hash,
                        option_number=option, visual_role="choice", storage_bucket="", storage_path="",
                        storage_url=f"https://example.invalid/{option}.png", mime_type="image/png", byte_size=1,
                        is_current=True, created_at=now, storage_backend="s3")
        if section == "listening":
            audio = AudioAsset.objects.create(audio_asset_id=uuid.uuid4(), source_hash="c" * 64, provider="synthetic", model_name="synthetic",
                language_code="ko", female_voice="", male_voice="", mime_type="audio/mpeg", storage_bucket="", storage_path="",
                storage_url="https://example.invalid/audio.mp3", byte_size=1, created_at=now, tts_style={}, narration_version="synthetic", storage_backend="s3")
            ItemAudioBinding.objects.bulk_create([
                ItemAudioBinding(binding_id=uuid.uuid4(), item=item, content_hash=item.content_hash,
                                 audio_asset=audio, source_hash="c" * 64, is_current=True, created_at=now)
                for item in source.items.all()
            ])
        return source


class PbtTests(BankFixtures, TransactionTestCase):
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

    def test_catalog_shows_latest_submitted_score_per_mode_and_resume(self):
        self.client.force_login(self.user)
        empty = {"latestResult": None, "inProgressId": None}
        catalog = self.client.get("/api/pbt/exams/").json()["exams"]
        self.assertTrue(all(e["myProgress"] == {"practice": empty, "timed": empty} for e in catalog))

        first = self.start()
        first_path = f"/api/pbt/attempts/{first['id']}/"
        self.client.put(first_path + "answers/1/", {"selectedOption": 2}, content_type="application/json")
        self.client.post(first_path + "submit/")
        latest = self.start()
        self.client.post(f"/api/pbt/attempts/{latest['id']}/submit/")
        now = timezone.now()
        # Submission order wins over both starting order and the highest score.
        Attempt.objects.filter(pk=first["id"]).update(started_at=now - timedelta(hours=3), submitted_at=now - timedelta(hours=2))
        Attempt.objects.filter(pk=latest["id"]).update(started_at=now - timedelta(hours=4), submitted_at=now - timedelta(hours=1))
        timed = self.start(mode="timed")
        timed_path = f"/api/pbt/attempts/{timed['id']}/"
        self.client.put(timed_path + "answers/1/", {"selectedOption": 2}, content_type="application/json")
        self.client.post(timed_path + "submit/")
        response = self.client.get("/api/pbt/exams/")
        self.assertIn("no-store", response.headers["Cache-Control"])
        self.assertIn("Cookie", response.headers["Vary"])
        progress = next(e for e in response.json()["exams"] if e["id"] == str(self.exam.pk))["myProgress"]
        self.assertEqual(progress["practice"], {"latestResult": {
            "id": latest["id"], "score": 0, "maxScore": 100,
            "submittedAt": (now - timedelta(hours=1)).isoformat(),
        }, "inProgressId": None})
        self.assertEqual(progress["timed"]["latestResult"]["id"], timed["id"])
        self.assertEqual(progress["timed"]["latestResult"]["score"], 2)

        active = self.start()
        progress = next(e for e in self.client.get("/api/pbt/exams/").json()["exams"] if e["id"] == str(self.exam.pk))["myProgress"]
        self.assertEqual(progress["practice"]["inProgressId"], active["id"])
        self.assertEqual(progress["practice"]["latestResult"]["id"], latest["id"])
        self.assertIsNone(progress["timed"]["inProgressId"])

    def test_catalog_progress_excludes_guests_and_other_accounts(self):
        guest = self.start()
        self.client.post(f"/api/pbt/attempts/{guest['id']}/submit/")
        self.assertTrue(all(e["myProgress"] is None for e in self.client.get("/api/pbt/exams/").json()["exams"]))
        self.client.force_login(self.user)
        other = Client()
        other.force_login(get_user_model().objects.create_user(username="catalog-other", password="synthetic-test-only"))
        foreign = self.start(client=other)
        other.post(f"/api/pbt/attempts/{foreign['id']}/submit/")
        self.start(mode="timed", client=other)
        for exam in self.client.get("/api/pbt/exams/").json()["exams"]:
            for progress in exam["myProgress"].values():
                self.assertIsNone(progress["latestResult"])
                self.assertIsNone(progress["inProgressId"])
        self.assertEqual(self.client.get(f"/api/pbt/attempts/{foreign['id']}/result/").status_code, 404)

        own = self.start()
        self.client.post(f"/api/pbt/attempts/{own['id']}/submit/")
        for client, expected in ((self.client, own), (other, foreign)):
            progress = next(e for e in client.get("/api/pbt/exams/").json()["exams"] if e["id"] == str(self.exam.pk))["myProgress"]
            self.assertEqual(progress["practice"]["latestResult"]["id"], expected["id"])
        self.assertTrue(all(e["myProgress"] is None for e in Client().get("/api/pbt/exams/").json()["exams"]))

    def test_catalog_progress_includes_attempts_beyond_recent_hundred(self):
        self.client.force_login(self.user)
        old = self.start()
        self.client.post(f"/api/pbt/attempts/{old['id']}/submit/")
        active = self.start()
        old_time = timezone.now() - timedelta(days=90)
        Attempt.objects.filter(pk=old["id"]).update(started_at=old_time, submitted_at=old_time)
        Attempt.objects.filter(pk=active["id"]).update(started_at=old_time)
        Attempt.objects.bulk_create([Attempt(exam=self.listen_exam, user=self.user, title=self.listen_exam.title,
            section="listening", mode="practice", status="submitted", started_at=timezone.now(),
            submitted_at=timezone.now(), score=100) for _ in range(100)])
        history = self.client.get("/api/pbt/attempts/").json()["attempts"]
        self.assertEqual(len(history), 100)
        self.assertNotIn(old["id"], [a["id"] for a in history])
        self.assertNotIn(active["id"], [a["id"] for a in history])
        progress = next(e for e in self.client.get("/api/pbt/exams/").json()["exams"] if e["id"] == str(self.exam.pk))["myProgress"]["practice"]
        self.assertEqual(progress["latestResult"]["id"], old["id"])
        self.assertEqual(progress["latestResult"]["score"], 0)
        self.assertEqual(progress["inProgressId"], active["id"])

    def test_catalog_finalizes_expired_member_attempt(self):
        self.client.force_login(self.user)
        active = self.start(mode="timed")
        path = f"/api/pbt/attempts/{active['id']}/"
        self.client.put(path + "answers/1/", {"selectedOption": 2}, content_type="application/json")
        expiry = timezone.now() - timedelta(seconds=1)
        Attempt.objects.filter(pk=active["id"]).update(expires_at=expiry)
        for _ in range(2):
            progress = next(e for e in self.client.get("/api/pbt/exams/").json()["exams"] if e["id"] == str(self.exam.pk))["myProgress"]["timed"]
            self.assertIsNone(progress["inProgressId"])
            self.assertEqual(progress["latestResult"], {"id": active["id"], "score": 2, "maxScore": 100, "submittedAt": expiry.isoformat()})
        result = self.client.get(path + "result/").json()
        self.assertTrue(result["timedOut"])
        self.assertEqual(result["score"], 2)

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

    def test_restart_preserves_results_and_starts_with_empty_answers(self):
        for member in (False, True):
            client = Client()
            if member:
                client.force_login(self.user)
            for mode in ("practice", "timed"):
                with self.subTest(member=member, mode=mode):
                    data = self.start(mode=mode, client=client)
                    old = Attempt.objects.get(pk=data["id"])
                    old.items.filter(position=1).update(selected_option=2)
                    old.items.filter(position=2).update(selected_option=1)
                    old.started_at -= timedelta(minutes=5)
                    if old.expires_at:
                        old.expires_at -= timedelta(minutes=5)
                    old.save()
                    response = client.post("/api/pbt/attempts/", {
                        "examId": str(self.exam.pk), "mode": mode, "restartAttemptId": data["id"],
                    }, content_type="application/json")
                    self.assertEqual(response.status_code, 201, response.content)
                    new = Attempt.objects.get(pk=response.json()["id"])
                    old.refresh_from_db()
                    self.assertNotEqual(new.pk, old.pk)
                    self.assertEqual((old.status, old.score, old.timed_out), ("submitted", 2, False))
                    self.assertIsNotNone(old.submitted_at)
                    self.assertEqual(old.items.get(position=1).selected_option, 2)
                    self.assertTrue(old.items.get(position=1).is_correct)
                    self.assertFalse(old.items.get(position=3).is_correct)
                    self.assertEqual((new.status, new.score, new.user_id, new.guest_id),
                                     ("in_progress", None, old.user_id, old.guest_id))
                    self.assertEqual(new.items.count(), 50)
                    self.assertFalse(new.items.filter(selected_option__isnull=False).exists())
                    if mode == "timed":
                        self.assertEqual((new.expires_at - new.started_at).total_seconds(), 4200)
                        self.assertGreater(new.expires_at, old.expires_at)
                    else:
                        self.assertIsNone(new.expires_at)
                    self.assertEqual(self.start(mode=mode, client=client)["id"], str(new.pk))
                    result = client.get(f"/api/pbt/attempts/{old.pk}/result/").json()
                    self.assertEqual(result["score"], 2)
                    self.assertEqual(result["items"][0]["selectedOption"], 2)
                    self.assertEqual(client.put(f"/api/pbt/attempts/{old.pk}/answers/2/",
                        {"selectedOption": 2}, content_type="application/json").status_code, 409)
                    if member:
                        row = next(e for e in client.get("/api/pbt/exams/").json()["exams"] if e["id"] == str(self.exam.pk))
                        self.assertEqual(row["myProgress"][mode]["latestResult"]["id"], str(old.pk))
                        self.assertEqual(row["myProgress"][mode]["inProgressId"], str(new.pk))

    def test_restart_retries_do_not_close_the_replacement(self):
        original = self.start()
        other_mode = self.start(mode="timed")
        payload = {"examId": str(self.exam.pk), "mode": "practice", "restartAttemptId": original["id"]}
        first = self.client.post("/api/pbt/attempts/", payload, content_type="application/json")
        second = self.client.post("/api/pbt/attempts/", payload, content_type="application/json")
        self.assertEqual((first.status_code, second.status_code), (201, 200))
        self.assertEqual(first.json()["id"], second.json()["id"])
        self.assertEqual(second.json()["status"], "in_progress")
        self.assertEqual(Attempt.objects.filter(mode="practice").count(), 2)
        self.assertEqual(Attempt.objects.get(pk=other_mode["id"]).status, "in_progress")
        self.client.post(f"/api/pbt/attempts/{first.json()['id']}/submit/")
        stale = self.client.post("/api/pbt/attempts/", payload, content_type="application/json")
        self.assertEqual((stale.status_code, stale.json()["error"]), (409, "attempt_closed"))
        self.assertEqual(Attempt.objects.filter(mode="practice").count(), 2)

    def test_concurrent_restart_requests_create_one_replacement(self):
        original = self.start()
        barrier = Barrier(2)
        clients = [Client(), Client()]
        for client in clients:
            client.cookies.update(self.client.cookies)

        def restart(client):
            try:
                barrier.wait(timeout=10)
                response = client.post("/api/pbt/attempts/", {
                    "examId": str(self.exam.pk), "mode": "practice", "restartAttemptId": original["id"],
                }, content_type="application/json")
                return response.status_code, response.json()
            finally:
                connections.close_all()

        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(restart, clients))
        self.assertEqual(sorted(status for status, _ in results), [200, 201])
        self.assertEqual(len({data["id"] for _, data in results}), 1)
        self.assertEqual(Attempt.objects.count(), 2)
        self.assertEqual(Attempt.objects.filter(status="in_progress").count(), 1)
        self.assertEqual(Attempt.objects.get(pk=original["id"]).status, "submitted")

    def test_restart_failures_preserve_existing_attempt_and_answers(self):
        original = self.start()
        old = Attempt.objects.get(pk=original["id"])
        old.items.filter(position=1).update(selected_option=2)
        payload = {"examId": str(self.exam.pk), "mode": "practice", "restartAttemptId": original["id"]}
        failures = (
            ("pbt.views.record_attempt", {"return_value": 60}, 429),
            ("pbt.views.load_set", {"side_effect": BankNotReady("synthetic")}, 409),
            ("pbt.views.AttemptItem.objects.bulk_create", {"side_effect": DatabaseError("synthetic")}, 503),
        )
        for target, options, status in failures:
            with self.subTest(target=target), patch(target, **options):
                response = self.client.post("/api/pbt/attempts/", payload, content_type="application/json")
                self.assertEqual(response.status_code, status)
            old.refresh_from_db()
            self.assertEqual((old.status, old.score, old.submitted_at), ("in_progress", None, None))
            self.assertEqual(old.items.get(position=1).selected_option, 2)
            self.assertIsNone(old.items.get(position=1).is_correct)
            self.assertEqual(Attempt.objects.count(), 1)
            self.assertEqual(AttemptItem.objects.count(), 50)

    def test_restart_validates_id_owner_set_mode_and_csrf(self):
        original = self.start()
        payload = {"examId": str(self.exam.pk), "mode": "practice", "restartAttemptId": original["id"]}
        for invalid in (None, True, 1, "", "not-a-uuid", [], {}):
            with self.subTest(invalid=invalid):
                response = self.client.post("/api/pbt/attempts/", {**payload, "restartAttemptId": invalid}, content_type="application/json")
                self.assertEqual(response.status_code, 400)
        for changes in ({"restartAttemptId": str(uuid.uuid4())}, {"examId": str(self.listen_exam.pk)}, {"mode": "timed"}):
            self.assertEqual(self.client.post("/api/pbt/attempts/", {**payload, **changes}, content_type="application/json").status_code, 404)
        for invalid_payload in ({"restartAttemptId": original["id"]}, {**payload, "unexpected": True}):
            self.assertEqual(self.client.post("/api/pbt/attempts/", invalid_payload, content_type="application/json").status_code, 400)
        other = Client()
        for member in (False, True):
            if member:
                other.force_login(self.user)
            self.assertEqual(other.post("/api/pbt/attempts/", payload, content_type="application/json").status_code, 404)
        strict = Client(enforce_csrf_checks=True)
        strict.cookies.update(self.client.cookies)
        self.assertEqual(strict.post("/api/pbt/attempts/", payload, content_type="application/json").status_code, 403)
        self.assertEqual(Attempt.objects.count(), 1)
        self.assertEqual(Attempt.objects.get(pk=original["id"]).status, "in_progress")

    def test_restart_guest_attempt_after_login_creates_member_attempt(self):
        original = self.start()
        self.client.force_login(self.user)
        payload = {"examId": str(self.exam.pk), "mode": "practice", "restartAttemptId": original["id"]}
        first = self.client.post("/api/pbt/attempts/", payload, content_type="application/json")
        self.assertEqual(first.status_code, 201)
        new = Attempt.objects.get(pk=first.json()["id"])
        self.assertEqual(new.user_id, self.user.pk)
        self.assertIsNone(new.guest_id)
        old = Attempt.objects.get(pk=original["id"])
        self.assertIsNone(old.user_id)
        self.assertEqual(old.status, "submitted")
        second = self.client.post("/api/pbt/attempts/", payload, content_type="application/json")
        self.assertEqual((second.status_code, second.json()["id"]), (200, str(new.pk)))

    def test_restart_expired_attempt_preserves_deadline_and_resets_timer(self):
        original = self.start(mode="timed")
        expiry = timezone.now() - timedelta(seconds=1)
        Attempt.objects.filter(pk=original["id"]).update(expires_at=expiry)
        response = self.client.post("/api/pbt/attempts/", {
            "examId": str(self.exam.pk), "mode": "timed", "restartAttemptId": original["id"],
        }, content_type="application/json")
        self.assertEqual(response.status_code, 201)
        old = Attempt.objects.get(pk=original["id"])
        self.assertEqual((old.status, old.timed_out, old.submitted_at), ("submitted", True, expiry))
        new = Attempt.objects.get(pk=response.json()["id"])
        self.assertEqual((new.expires_at - new.started_at).total_seconds(), 4200)

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

    def test_audio_uses_item_identity_and_ignores_history(self):
        item = self.listening.items.get(position=1)
        current = item.audio_bindings.get(is_current=True)
        audio = current.audio_asset
        audio.pk = uuid.uuid4()
        audio.source_hash = "d" * 64
        audio.storage_url = "https://example.invalid/current.mp3"
        audio.save(force_insert=True)
        current.audio_asset = audio
        # Origin records the old location, not the item's current membership.
        current.origin_set_id = uuid.uuid4()
        current.origin_position = 50
        current.save()
        for content_hash in (None, item.content_hash):
            ItemAudioBinding.objects.create(
                binding_id=uuid.uuid4(), item=item, content_hash=content_hash,
                audio_asset=AudioAsset.objects.exclude(pk=audio.pk).first(), source_hash="c" * 64,
                is_current=False, created_at=timezone.now())
        questions = load_set(self.listening.pk, "listening")
        self.assertEqual(questions[0]["snapshot"]["audioUrl"], "https://example.invalid/current.mp3")
        self.assertEqual(questions[49]["snapshot"]["audioUrl"], "https://example.invalid/audio.mp3")
        current.is_current = False
        current.save()
        with self.assertRaisesRegex(BankNotReady, "missing_audio"):
            load_set(self.listening.pk, "listening")

    def test_current_audio_requires_matching_hash_and_live_asset(self):
        item = self.listening.items.get(position=1)
        binding = item.audio_bindings.get(is_current=True)
        binding.content_hash = "outdated"
        binding.save()
        with self.assertRaisesRegex(BankNotReady, "missing_audio"):
            load_set(self.listening.pk, "listening")
        binding.content_hash = item.content_hash
        binding.save()
        AudioAsset.objects.filter(pk=binding.audio_asset_id).update(deleted_at=timezone.now())
        with self.assertRaisesRegex(BankNotReady, "missing_audio"):
            load_set(self.listening.pk, "listening")

    def test_sync_check_does_not_register_new_exams(self):
        self.make_set("reading")
        before = list(Exam.objects.values())
        call_command("sync_exams", check=True, stdout=io.StringIO(), stderr=io.StringIO())
        self.assertEqual(list(Exam.objects.values()), before)

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
        call_command("sync_exams", stdout=io.StringIO(), stderr=io.StringIO())
        self.exam.refresh_from_db()
        self.assertFalse(self.exam.is_published)
        self.assertEqual(Exam.objects.get(source_set_id=source.pk).guest_slot, 2)
        call_command("sync_exams", stdout=io.StringIO(), stderr=io.StringIO())
        self.assertEqual(Exam.objects.count(), 3)
