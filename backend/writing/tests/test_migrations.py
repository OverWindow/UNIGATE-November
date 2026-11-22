import uuid

from django.contrib.auth import get_user_model
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase
from django.utils import timezone

from writing.contract import digest
from writing.models import Evaluation
from writing.tests.test_evaluation import fixture


class FeedbackLanguageMigrationTests(TransactionTestCase):
    def test_existing_result_and_submission_identity_survive_korean_default(self):
        before = [("writing", "0001_initial")]
        after = [("writing", "0002_evaluation_feedback_language")]
        executor = MigrationExecutor(connection)
        latest = executor.loader.graph.leaf_nodes()
        self.addCleanup(lambda: MigrationExecutor(connection).migrate(latest))
        executor.migrate(before)
        try:
            LegacyEvaluation = executor.loader.project_state(before).apps.get_model("writing", "Evaluation")
            user = get_user_model().objects.create_user(username="legacy-language-fixture")
            inputs = fixture(51, "input")
            result = fixture(51, "response")
            set_id = uuid.uuid4()
            submission_hash = digest({"set": str(set_id), "slot": 51, "answer": inputs["answer"]})
            entry = LegacyEvaluation.objects.create(user_id=user.pk, set_id=set_id, type_slot=51,
                submission_hash=submission_hash, question_snapshot=inputs["question"], answer=inputs["answer"],
                request_hash=result["request_id"], prompt_version="0" * 64, requested_model="fixture/model",
                price_version="0" * 64, credit_cost=3, status="succeeded", result=result, total_score=9,
                expires_at=timezone.now(), completed_at=timezone.now())
        finally:
            MigrationExecutor(connection).migrate(after)
        migrated = Evaluation.objects.get(pk=entry.pk)
        self.assertEqual(migrated.feedback_language, "ko")
        self.assertEqual(migrated.result, result)
        self.assertEqual(migrated.submission_hash, submission_hash)
        self.assertEqual(migrated.answer, inputs["answer"])
