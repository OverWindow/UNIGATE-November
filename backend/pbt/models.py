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


class ExamAttemptFeedback(models.Model):
    attempt = models.OneToOneField(Attempt, models.CASCADE, primary_key=True, related_name="feedback")
    email = models.EmailField(max_length=254)
    rating = models.PositiveSmallIntegerField()
    language = models.CharField(max_length=2, choices=[("ko", "한국어"), ("en", "English"), ("id", "Indonesia")])
    nationality_code = models.CharField(max_length=5)
    birth_year = models.PositiveSmallIntegerField()
    topik_reasons = models.JSONField()
    topik_reason_other = models.CharField(max_length=500, blank=True)
    korean_study_duration = models.CharField(max_length=32)
    topik_experience = models.CharField(max_length=16)
    current_topik_level = models.PositiveSmallIntegerField(null=True, blank=True)
    target_topik_level = models.PositiveSmallIntegerField()
    survey_version = models.CharField(max_length=40)
    survey_completed_at = models.DateTimeField()
    privacy_consent_version = models.CharField(max_length=40)
    privacy_consented_at = models.DateTimeField()
    result_token_hash = models.CharField(max_length=64, blank=True, editable=False)
    result_token_expires_at = models.DateTimeField(null=True, editable=False)
    result_accessed_at = models.DateTimeField(null=True, editable=False)
    email_status = models.CharField(max_length=12, default="pending", choices=[
        ("pending", "대기"), ("sending", "발송 중"), ("accepted", "발송업체 접수"),
        ("failed", "실패"), ("uncertain", "접수 확인 불가"),
    ])
    email_requested_at = models.DateTimeField(null=True, editable=False)
    email_sent_at = models.DateTimeField(null=True, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "exam_attempt_feedback"
        ordering = ["-created_at"]
        constraints = [
            models.CheckConstraint(condition=models.Q(rating__range=(1, 5)), name="exam_feedback_rating_range"),
            models.CheckConstraint(condition=models.Q(target_topik_level__range=(3, 6)), name="exam_feedback_target_range"),
            models.CheckConstraint(condition=models.Q(current_topik_level__isnull=True) | models.Q(current_topik_level__range=(0, 6)), name="exam_feedback_current_range"),
        ]
