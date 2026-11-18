import uuid

from django.conf import settings
from django.db import models


class Evaluation(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, models.PROTECT)
    set_id = models.UUIDField()
    type_slot = models.PositiveSmallIntegerField()
    feedback_language = models.CharField(max_length=2, default="ko",
        choices=[("ko", "한국어"), ("en", "English"), ("id", "Bahasa Indonesia")])
    submission_hash = models.CharField(max_length=64)
    question_snapshot = models.JSONField()
    answer = models.JSONField()
    request_hash = models.CharField(max_length=64)
    package_version = models.CharField(max_length=40, default="writing-evaluation-v2")
    prompt_version = models.CharField(max_length=64)
    requested_model = models.CharField(max_length=200)
    resolved_model = models.CharField(max_length=200, blank=True)
    model_options = models.JSONField(default=dict)
    price_version = models.CharField(max_length=64)
    credit_cost = models.PositiveIntegerField()
    status = models.CharField(max_length=12, choices=[("processing", "처리 중"), ("succeeded", "완료"), ("failed", "실패")])
    result = models.JSONField(null=True)
    total_score = models.PositiveSmallIntegerField(null=True)
    usage = models.JSONField(default=dict)
    error_code = models.CharField(max_length=40, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    completed_at = models.DateTimeField(null=True)

    class Meta:
        db_table = "writing_evaluations"
        indexes = [models.Index(fields=["user", "-created_at"]), models.Index(fields=["status", "expires_at"])]
        constraints = [
            models.CheckConstraint(condition=models.Q(type_slot__in=[51, 52, 53, 54]), name="writing_evaluation_slot"),
            models.CheckConstraint(condition=models.Q(status__in=["processing", "succeeded", "failed"]), name="writing_evaluation_status"),
            models.CheckConstraint(condition=(
                models.Q(status="processing", completed_at__isnull=True, result__isnull=True, total_score__isnull=True)
                | models.Q(status="failed", completed_at__isnull=False, result__isnull=True, total_score__isnull=True)
                | models.Q(status="succeeded", completed_at__isnull=False, result__isnull=False, total_score__isnull=False)
            ), name="writing_evaluation_result_state"),
        ]
