from django.urls import path

from surveys import views
from config.health import health

urlpatterns = [
    path("api/health/", health, name="health"),
    path("api/csrf/", views.csrf_token, name="survey-csrf"),
    path("api/survey-responses/", views.create_response, name="survey-create"),
]
