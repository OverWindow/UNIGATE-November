from django.contrib import admin

from .models import Exam, ExamAttemptFeedback


@admin.register(Exam)
class ExamAdmin(admin.ModelAdmin):
    list_display = ["title", "exam_format", "section", "display_order", "guest_slot", "is_published"]
    list_filter = ["exam_format", "section", "is_published"]
    search_fields = ["title"]

    def get_readonly_fields(self, request, obj=None):
        return ["source_set_id", "exam_format", "section"] if obj else []


@admin.register(ExamAttemptFeedback)
class ExamAttemptFeedbackAdmin(admin.ModelAdmin):
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
