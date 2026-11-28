from django.contrib import admin
from django.db.models import F
from unfold.admin import ModelAdmin

from surveys.admin_export import CsvExportAdminMixin
from surveys.learner_csv import write_exam_survey_csv

from .models import AttemptItem, Exam, ExamAttemptFeedback


@admin.register(Exam)
class ExamAdmin(ModelAdmin):
    list_display = ["title", "exam_format", "section", "display_order", "guest_slot", "is_published"]
    list_filter = ["exam_format", "section", "is_published"]
    search_fields = ["title"]

    def get_readonly_fields(self, request, obj=None):
        return ["source_set_id", "exam_format", "section"] if obj else []


@admin.register(AttemptItem)
class AttemptItemAdmin(ModelAdmin):
    list_display = ["exam_title", "respondent_email", "question_number", "response_content", "last_answered_at"]
    fields = readonly_fields = list_display
    list_filter = ["attempt__exam_format"]
    search_fields = ["attempt__title"]
    search_help_text = "시험명으로 검색합니다."
    ordering = [F("answered_at").desc(nulls_last=True), "-pk"]

    def get_queryset(self, request):
        return super().get_queryset(request).select_related("attempt__user").only(
            "attempt__title", "attempt__user__email", "position", "selected_option", "selected_order", "answered_at",
        )

    def changelist_view(self, request, extra_context=None):
        return super().changelist_view(request, {"title": "문항별 응답 기록", **(extra_context or {})})

    @admin.display(description="시험명", ordering="attempt__title")
    def exam_title(self, obj):
        return obj.attempt.title

    @admin.display(description="응답자 이메일")
    def respondent_email(self, obj):
        user = obj.attempt.user
        if user is None:
            return "비회원"
        return user.email.strip() or "이메일 미등록"

    @admin.display(description="문항 번호", ordering="position")
    def question_number(self, obj):
        return obj.position

    @admin.display(description="응답 내용")
    def response_content(self, obj):
        if obj.selected_order and any(obj.selected_order):
            return " → ".join(label or "—" for label in obj.selected_order)
        if obj.selected_option is not None:
            return f"{obj.selected_option}번"
        return "미응답"

    @admin.display(description="마지막 응답 시각", ordering="answered_at")
    def last_answered_at(self, obj):
        return obj.answered_at

    def has_view_permission(self, request, obj=None):
        return request.user.has_perm("pbt.view_attemptitem")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(ExamAttemptFeedback)
class ExamAttemptFeedbackAdmin(CsvExportAdminMixin, ModelAdmin):
    csv_filename_prefix = "exam_attempt_feedback"
    csv_writer = staticmethod(write_exam_survey_csv)
    list_display = ["attempt_id", "email", "rating", "language", "email_status", "survey_completed_at"]
    list_filter = ["attempt__exam_format", "attempt__section", "rating", "language", "email_status"]
    search_fields = ["email", "attempt__title"]
    exclude = ["result_token_hash"]

    def get_readonly_fields(self, request, obj=None):
        return [f.name for f in self.model._meta.fields if f.name != "result_token_hash"]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
