from django.contrib import admin
from django.urls import include, path

from surveys import views
from config.health import health

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/health/", health, name="health"),
    path("api/csrf/", views.csrf_token, name="survey-csrf"),
    path("api/auth/", include("accounts.urls")),
    path("api/pbt/", include("pbt.urls")),
    path("api/vocabulary/", include("vocabulary.urls")),
    path("api/ibt/", include("pbt.urls"), {"exam_format": "ibt"}),
    path("api/survey-responses/", views.create_response, name="survey-create"),
]
