from django.contrib import admin
from django.contrib.admin.options import IncorrectLookupParameters
from django.core.exceptions import PermissionDenied
from django.http import HttpResponse, HttpResponseBadRequest
from django.urls import path
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.http import require_GET

from .csv_export import SEOUL, write_survey_csv
from .admin_export import CsvExportAdminMixin
from .learner_csv import write_signup_survey_csv
from .models import SignupSurveyResponse, SurveyResponse


@admin.register(SurveyResponse)
class SurveyResponseAdmin(admin.ModelAdmin):
    list_display = ("id", "email", "age", "education_type", "desired_university", "created_at")
    search_fields = ("email", "desired_university")
    list_filter = ("education_type", "created_at")
    readonly_fields = ("id", "created_at")
    ordering = ("-created_at", "-id")
    list_per_page = 50

    def get_urls(self):
        return [
            path("export-csv/", self.admin_site.admin_view(self.export_csv),
                 name="surveys_surveyresponse_export_csv"),
        ] + super().get_urls()

    @method_decorator(require_GET)
    def export_csv(self, request):
        if not self.has_view_permission(request):
            raise PermissionDenied

        # Ignore pagination while keeping the admin's search and filter rules.
        request.GET = request.GET.copy()
        request.GET.pop("p", None)
        request.GET.pop("all", None)
        try:
            queryset = self.get_changelist_instance(request).queryset
        except IncorrectLookupParameters:
            return HttpResponseBadRequest("Invalid search or filter parameters.")

        stamp = timezone.now().astimezone(SEOUL).strftime("%Y%m%d_%H%M%S_%f")
        response = HttpResponse(
            content_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="survey_responses_{stamp}.csv"'},
        )
        response.write("\ufeff")
        write_survey_csv(response, queryset)
        return response


@admin.register(SignupSurveyResponse)
class SignupSurveyResponseAdmin(CsvExportAdminMixin, admin.ModelAdmin):
    csv_filename_prefix = "signup_survey_responses"
    csv_writer = staticmethod(write_signup_survey_csv)
    list_display = ("user_id", "email", "nickname", "nationality_code", "target_topik_level", "language", "survey_completed_at")
    list_filter = ("language", "nationality_code", "target_topik_level", "survey_completed_at")
    search_fields = ("user__email", "user__first_name")
    list_select_related = ("user",)
    readonly_fields = tuple(field.name for field in SignupSurveyResponse._meta.fields)

    @admin.display(description="이메일", ordering="user__email")
    def email(self, obj):
        return obj.user.email

    @admin.display(description="닉네임", ordering="user__first_name")
    def nickname(self, obj):
        return obj.user.first_name

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
