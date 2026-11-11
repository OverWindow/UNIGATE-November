from django.urls import path

from . import views


urlpatterns = [
    path("levels/", views.levels),
    path("sets/", views.sets),
    path("sets/<int:set_id>/", views.detail),
    path("sets/<int:set_id>/questions/", views.questions),
    path("sets/<int:set_id>/questions/<int:question_id>/check/", views.check_answer),
]
