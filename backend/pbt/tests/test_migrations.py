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
        self.assertEqual(current_attempt.answered_count, 1)
        self.assertEqual(current_item.snapshot, snapshot)
        self.assertEqual(current_item.selected_option, 2)
        self.assertIsNone(current_item.selected_order)
        apps.get_model("pbt", "Exam").objects.create(
            source_set_id=uuid.uuid4(), exam_format="ibt", title="IBT", section="reading",
            display_order=1, guest_slot=1)


class TimedSessionMigrationTests(TransactionTestCase):
    def test_adds_empty_session_hash_without_closing_or_changing_existing_attempts(self):
        before = [("pbt", "0007_attempt_answered_count")]
        executor = MigrationExecutor(connection)
        after = executor.loader.graph.leaf_nodes("pbt")
        executor.migrate(before)
        try:
            apps = executor.loader.project_state(before).apps
            Attempt = apps.get_model("pbt", "Attempt")
            AttemptItem = apps.get_model("pbt", "AttemptItem")
            for status in ("in_progress", "submitted"):
                exam = apps.get_model("pbt", "Exam").objects.create(source_set_id=uuid.uuid4(),
                    title="Existing timed exam", section="listening", display_order=1)
                attempt = Attempt.objects.create(exam=exam, guest_id=uuid.uuid4(), title=exam.title,
                    section="listening", mode="timed", status=status, started_at=timezone.now(),
                    submitted_at=timezone.now() if status == "submitted" else None,
                    score=2 if status == "submitted" else None, answered_count=1)
                AttemptItem.objects.create(attempt=attempt, position=1, source_item_id=uuid.uuid4(),
                    snapshot={"prompt": "Original"}, correct_answer=2, selected_option=2)
            rows = list(Attempt.objects.order_by("pk").values())
            items = list(AttemptItem.objects.order_by("pk").values())
        finally:
            executor = MigrationExecutor(connection)
            executor.migrate(after)
        apps = executor.loader.project_state(after).apps
        current = list(apps.get_model("pbt", "Attempt").objects.order_by("pk").values())
        for row in current:
            self.assertEqual(row.pop("timed_session_token_hash"), "")
        self.assertEqual(current, rows)
        self.assertEqual(list(apps.get_model("pbt", "AttemptItem").objects.order_by("pk").values()), items)


class AnsweredCountMigrationTests(TransactionTestCase):
    def test_backfill_batches_preserve_attempts_and_answers(self):
        old_target = [("pbt", "0006_attemptitem_selected_order")]
        executor = MigrationExecutor(connection)
        new_target = executor.loader.graph.leaf_nodes("pbt")
        executor.migrate(old_target)
        try:
            apps = executor.loader.project_state(old_target).apps
            Attempt = apps.get_model("pbt", "Attempt")
            AttemptItem = apps.get_model("pbt", "AttemptItem")
            exams = [apps.get_model("pbt", "Exam").objects.create(
                source_set_id=uuid.uuid4(), exam_format=exam_format, title=exam_format,
                section="reading", display_order=1) for exam_format in ("pbt", "ibt")]
            now = timezone.now()
            attempts = Attempt.objects.bulk_create([Attempt(
                exam=exams[index % 2], exam_format=exams[index % 2].exam_format,
                guest_id=uuid.uuid4(), title=exams[index % 2].title, section="reading",
                mode="practice", started_at=now,
                status="submitted" if index % 3 else "in_progress",
                submitted_at=now if index % 3 else None, score=2 if index % 3 else None,
            ) for index in range(503)])
            expected = {attempt.pk: 1 for attempt in attempts}
            rows = []
            for attempt in attempts[2:-1]:
                rows.append(AttemptItem(attempt=attempt, position=1, source_item_id=uuid.uuid4(),
                    snapshot={}, correct_answer=2, selected_option=1))
            for position, option in enumerate((2, 1, None), 1):
                rows.append(AttemptItem(attempt=attempts[0], position=position, source_item_id=uuid.uuid4(),
                    snapshot={"itemType": "sentence_order"}, correct_answer=2, selected_option=option,
                    answered_at=now, is_correct=option == 2))
            orders = (["나", "라", "가", "다"], ["다", "가", "나", "라"],
                ["가", None, "다", None], [None] * 4, None, ["가"] * 4,
                ["가", "나", "다", "마"], [{}, None, None, None], "가나다라", [])
            for position, order in enumerate(orders, 1):
                rows.append(AttemptItem(attempt=attempts[1], position=position, source_item_id=uuid.uuid4(),
                    snapshot={"answerMode": "sentence_order"}, correct_answer=2, selected_order=order,
                    selected_option=2, answered_at=now))
            rows.append(AttemptItem(attempt=attempts[1], position=11, source_item_id=uuid.uuid4(),
                snapshot={"itemType": "ibt_sentence_order"}, correct_answer=2, selected_option=1))
            AttemptItem.objects.bulk_create(rows)
            expected.update({attempts[0].pk: 2, attempts[1].pk: 3, attempts[-1].pk: 0})
            attempt_fields = [field.name for field in Attempt._meta.fields]
            before_attempts = list(Attempt.objects.order_by("pk").values(*attempt_fields))
            before_items = list(AttemptItem.objects.order_by("pk").values())
        finally:
            executor = MigrationExecutor(connection)
            executor.migrate(new_target)
        apps = executor.loader.project_state(new_target).apps
        Attempt = apps.get_model("pbt", "Attempt")
        self.assertEqual(dict(Attempt.objects.values_list("pk", "answered_count")), expected)
        self.assertEqual(list(Attempt.objects.order_by("pk").values(*attempt_fields)), before_attempts)
        self.assertEqual(list(apps.get_model("pbt", "AttemptItem").objects.order_by("pk").values()), before_items)
