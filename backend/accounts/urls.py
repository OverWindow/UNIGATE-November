from django.urls import path

from . import views


urlpatterns = [
    path("email/send/", views.send_email_verification, name="email-send"),
    path("email/verify/", views.verify_email, name="email-verify"),
    path("signup/", views.signup, name="account-signup"),
    path("login/", views.login_view, name="account-login"),
    path("logout/", views.logout_view, name="account-logout"),
    path("me/", views.me, name="account-me"),
]
