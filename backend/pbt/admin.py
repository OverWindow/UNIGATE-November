from django.contrib import admin

from .models import Exam


@admin.register(Exam)
class ExamAdmin(admin.ModelAdmin):
    list_display = ["title", "section", "display_order", "guest_slot", "is_published"]
    list_filter = ["section", "is_published"]
    search_fields = ["title"]
