"""Project URL routing. / 프로젝트 URL 연결."""
from django.contrib import admin
from django.urls import path

urlpatterns = [
    path('admin/', admin.site.urls),
]
