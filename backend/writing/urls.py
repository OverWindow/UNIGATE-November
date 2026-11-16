from django.urls import path

from . import views


urlpatterns = [
    path("evaluation-config/", views.configuration),
    path("evaluations/", views.evaluations),
    path("evaluations/<uuid:evaluation_id>/", views.evaluation_detail),
]
