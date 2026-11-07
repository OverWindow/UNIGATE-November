import uuid

from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase
from django.utils import timezone


class ExamFormatMigrationTests(TransactionTestCase):
    def test_existing_pbt_records_and_snapshots_survive(self):
        old_target = [("pbt", "0001_initial")]
        executor = MigrationExecutor(connection)
        new_target = executor.loader.graph.leaf_nodes("pbt")
        executor.migrate(old_target)
        try:
            apps = executor.loader.project_state(old_target).apps
            exam = apps.get_model("pbt", "Exam").objects.create(
                source_set_id=uuid.uuid4(), title="Existing PBT", section="reading",
                display_order=1, guest_slot=1, is_published=True)
            attempt = apps.get_model("pbt", "Attempt").objects.create(
                exam=exam, guest_id=uuid.uuid4(), title=exam.title, section="reading",
                mode="practice", status="submitted", started_at=timezone.now(),
                submitted_at=timezone.now(), score=2)
            snapshot = {"itemType": "paired_reading", "passage": "Original passage"}
            item = apps.get_model("pbt", "AttemptItem").objects.create(
                attempt=attempt, position=1, source_item_id=uuid.uuid4(), snapshot=snapshot,
                correct_answer=2, selected_option=2, is_correct=True)
        finally:
            executor = MigrationExecutor(connection)
            executor.migrate(new_target)
        apps = executor.loader.project_state(new_target).apps
        current_exam = apps.get_model("pbt", "Exam").objects.get(pk=exam.pk)
        current_attempt = apps.get_model("pbt", "Attempt").objects.get(pk=attempt.pk)
        current_item = apps.get_model("pbt", "AttemptItem").objects.get(pk=item.pk)
        self.assertEqual(current_exam.exam_format, "pbt")
        self.assertEqual(current_exam.guest_slot, 1)
        self.assertEqual(current_attempt.exam_format, "pbt")
        self.assertEqual(current_attempt.score, 2)
        self.assertEqual(current_item.snapshot, snapshot)
        self.assertEqual(current_item.selected_option, 2)
        self.assertIsNone(current_item.selected_order)
        apps.get_model("pbt", "Exam").objects.create(
            source_set_id=uuid.uuid4(), exam_format="ibt", title="IBT", section="reading",
            display_order=1, guest_slot=1)
