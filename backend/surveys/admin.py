from django.contrib import admin

from .models import SurveyResponse


@admin.register(SurveyResponse)
class SurveyResponseAdmin(admin.ModelAdmin):
    list_display = ("id", "email", "age", "education_type", "desired_university", "created_at")
    search_fields = ("email", "desired_university")
    list_filter = ("education_type", "created_at")
    readonly_fields = ("id", "created_at")
    ordering = ("-created_at", "-id")
    list_per_page = 50
