import uuid
from datetime import timedelta

from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase
from django.utils import timezone


class ListeningDeadlineMigrationTests(TransactionTestCase):
    def test_only_active_listening_deadlines_are_cleared_and_rollback_is_valid(self):
        before = [("pbt", "0003_exam_attempt_feedback")]
        after = [("pbt", "0004_ibt_listening_passage_timing")]
        executor = MigrationExecutor(connection)
        executor.migrate(before)
        old_apps = executor.loader.project_state(before).apps
        Exam = old_apps.get_model("pbt", "Exam")
        Attempt = old_apps.get_model("pbt", "Attempt")
        start = timezone.now()
        expiry = start + timedelta(minutes=35)
        ids = {}
        try:
            for name, exam_format, section, mode, status in (
                ("active", "ibt", "listening", "timed", "in_progress"),
                ("submitted", "ibt", "listening", "timed", "submitted"),
                ("practice", "ibt", "listening", "practice", "in_progress"),
                ("reading", "ibt", "reading", "timed", "in_progress"),
                ("pbt", "pbt", "listening", "timed", "in_progress"),
            ):
                exam = Exam.objects.create(source_set_id=uuid.uuid4(), exam_format=exam_format, section=section, title=name, display_order=1)
                attempt = Attempt.objects.create(exam=exam, exam_format=exam_format, section=section, title=name,
                    guest_id=uuid.uuid4(), mode=mode, status=status, started_at=start,
                    expires_at=expiry if mode == "timed" else None, score=80 if status == "submitted" else None)
                ids[name] = attempt.pk
            executor = MigrationExecutor(connection)
            executor.migrate(after)
            Attempt = executor.loader.project_state(after).apps.get_model("pbt", "Attempt")
            self.assertIsNone(Attempt.objects.get(pk=ids["active"]).expires_at)
            self.assertIsNone(Attempt.objects.get(pk=ids["practice"]).expires_at)
            for name in ("submitted", "reading", "pbt"):
                self.assertEqual(Attempt.objects.get(pk=ids[name]).expires_at, expiry)
            self.assertEqual(Attempt.objects.get(pk=ids["submitted"]).score, 80)
            Attempt.objects.filter(pk=ids["active"]).update(status="submitted", score=90)
            executor = MigrationExecutor(connection)
            executor.migrate(before)
            Attempt = executor.loader.project_state(before).apps.get_model("pbt", "Attempt")
            self.assertEqual(Attempt.objects.get(pk=ids["active"]).expires_at, expiry)
            self.assertEqual(Attempt.objects.get(pk=ids["active"]).score, 90)
        finally:
            MigrationExecutor(connection).migrate(after)
