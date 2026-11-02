from django.urls import path

from . import views

urlpatterns = [
    path("exams/", views.exams),
    path("attempts/", views.attempts),
    path("attempts/<uuid:attempt_id>/", views.detail),
    path("attempts/<uuid:attempt_id>/answers/<int:position>/", views.answer),
    path("attempts/<uuid:attempt_id>/submit/", views.submit),
    path("attempts/<uuid:attempt_id>/result/", views.result),
]
