from django.contrib import admin

from .models import Exam


@admin.register(Exam)
class ExamAdmin(admin.ModelAdmin):
    list_display = ["title", "exam_format", "section", "display_order", "guest_slot", "is_published"]
    list_filter = ["exam_format", "section", "is_published"]
    search_fields = ["title"]

    def get_readonly_fields(self, request, obj=None):
        return ["source_set_id", "exam_format", "section"] if obj else []
