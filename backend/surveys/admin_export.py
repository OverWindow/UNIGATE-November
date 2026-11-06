from django.contrib.admin.options import IncorrectLookupParameters
from django.core.exceptions import PermissionDenied
from django.http import HttpResponse, HttpResponseBadRequest
from django.urls import path
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.http import require_GET

from .csv_export import SEOUL


class CsvExportAdminMixin:
    change_list_template = "admin/surveys/csv_change_list.html"

    def get_urls(self):
        opts = self.model._meta
        return [
            path("export-csv/", self.admin_site.admin_view(self.export_csv),
                 name=f"{opts.app_label}_{opts.model_name}_export_csv"),
        ] + super().get_urls()

    @method_decorator(require_GET)
    def export_csv(self, request):
        if not self.has_view_permission(request):
            raise PermissionDenied
        # Export all matching rows, using the same permissions and filters as the list.
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
            headers={"Content-Disposition": f'attachment; filename="{self.csv_filename_prefix}_{stamp}.csv"'},
        )
        response.write("\ufeff")
        self.csv_writer(response, queryset)
        return response
