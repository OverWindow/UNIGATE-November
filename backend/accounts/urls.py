from django.urls import path

from . import google_views, views


urlpatterns = [
    path("google/start/", google_views.start, name="google-start"),
    path("google/", google_views.verify, name="google-verify"),
    path("google/signup/", google_views.signup, name="google-signup"),
    path("google/link/", google_views.link, name="google-link"),
    path("email/send/", views.send_email_verification, name="email-send"),
    path("email/verify/", views.verify_email, name="email-verify"),
    path("signup/", views.signup, name="account-signup"),
    path("login/", views.login_view, name="account-login"),
    path("logout/", views.logout_view, name="account-logout"),
    path("me/", views.me, name="account-me"),
]
