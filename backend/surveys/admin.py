from django.contrib import admin
from django.contrib.admin.options import IncorrectLookupParameters
from django.core.exceptions import PermissionDenied
from django.http import HttpResponse, HttpResponseBadRequest
from django.urls import path
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.http import require_GET

from .csv_export import SEOUL, write_survey_csv
from .models import SurveyResponse


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
