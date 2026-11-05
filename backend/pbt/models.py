import uuid

from django.conf import settings
from django.db import models


class Exam(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    source_set_id = models.UUIDField(unique=True)
    exam_format = models.CharField(max_length=3, default="pbt", choices=[("pbt", "PBT"), ("ibt", "IBT")])
    title = models.CharField(max_length=160)
    section = models.CharField(max_length=10, choices=[("reading", "읽기"), ("listening", "듣기")])
    display_order = models.PositiveIntegerField()
    is_published = models.BooleanField(default=False)
    guest_slot = models.PositiveSmallIntegerField(null=True, blank=True, help_text="비회원 공개 슬롯: 영역별 1~3")

    class Meta:
        db_table = "pbt_exams"
        ordering = ["section", "display_order", "id"]
        constraints = [
            models.UniqueConstraint(fields=["exam_format", "section", "guest_slot"], name="exam_format_guest_slot_unique"),
            models.CheckConstraint(condition=models.Q(exam_format__in=["pbt", "ibt"]), name="exam_format_valid"),
            models.CheckConstraint(condition=models.Q(guest_slot__isnull=True) | models.Q(guest_slot__range=(1, 3)), name="pbt_guest_slot_range"),
            models.CheckConstraint(condition=models.Q(section__in=["reading", "listening"]), name="pbt_exam_section_valid"),
        ]

    def __str__(self):
        return self.title


class Attempt(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    exam = models.ForeignKey(Exam, models.PROTECT, related_name="attempts")
    exam_format = models.CharField(max_length=3, default="pbt", choices=[("pbt", "PBT"), ("ibt", "IBT")])
    user = models.ForeignKey(settings.AUTH_USER_MODEL, models.CASCADE, null=True, blank=True)
    guest_id = models.UUIDField(null=True, editable=False)
    title = models.CharField(max_length=160)
    section = models.CharField(max_length=10)
    mode = models.CharField(max_length=10, choices=[("practice", "연습"), ("timed", "실전")])
    status = models.CharField(max_length=12, default="in_progress", choices=[("in_progress", "진행 중"), ("submitted", "제출 완료")])
    started_at = models.DateTimeField()
    expires_at = models.DateTimeField(null=True)
    submitted_at = models.DateTimeField(null=True)
    timed_out = models.BooleanField(default=False)
    score = models.PositiveSmallIntegerField(null=True)

    class Meta:
        db_table = "pbt_attempts"
        ordering = ["-started_at"]
        indexes = [models.Index(fields=["user", "-started_at"]), models.Index(fields=["guest_id", "-started_at"])]
        constraints = [
            models.CheckConstraint(condition=models.Q(exam_format__in=["pbt", "ibt"]), name="attempt_exam_format_valid"),
            models.CheckConstraint(condition=(models.Q(user__isnull=False, guest_id__isnull=True) | models.Q(user__isnull=True, guest_id__isnull=False)), name="pbt_attempt_owner"),
            models.CheckConstraint(condition=(models.Q(mode="practice", expires_at__isnull=True) | models.Q(mode="timed", expires_at__isnull=False)), name="pbt_attempt_deadline"),
            models.UniqueConstraint(fields=["user", "exam", "mode"], condition=models.Q(status="in_progress", user__isnull=False), name="pbt_active_user_attempt"),
            models.UniqueConstraint(fields=["guest_id", "exam", "mode"], condition=models.Q(status="in_progress", guest_id__isnull=False), name="pbt_active_guest_attempt"),
        ]


class AttemptItem(models.Model):
    attempt = models.ForeignKey(Attempt, models.CASCADE, related_name="items")
    position = models.PositiveSmallIntegerField()
    source_item_id = models.UUIDField()
    snapshot = models.JSONField()
    correct_answer = models.PositiveSmallIntegerField()
    explanation = models.TextField(blank=True)
    transcript = models.TextField(blank=True)
    selected_option = models.PositiveSmallIntegerField(null=True)
    points = models.PositiveSmallIntegerField(default=2)
    is_correct = models.BooleanField(null=True)
    answered_at = models.DateTimeField(null=True)

    class Meta:
        db_table = "pbt_attempt_items"
        ordering = ["position"]
        constraints = [
            models.UniqueConstraint(fields=["attempt", "position"], name="pbt_attempt_position_unique"),
            models.CheckConstraint(condition=models.Q(position__range=(1, 50)), name="pbt_position_range"),
            models.CheckConstraint(condition=models.Q(correct_answer__range=(1, 4)), name="pbt_correct_answer_range"),
            models.CheckConstraint(condition=models.Q(selected_option__isnull=True) | models.Q(selected_option__range=(1, 4)), name="pbt_selected_option_range"),
        ]
