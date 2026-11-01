from django import forms
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db.models import Func
from django.db.models.functions import Lower

from .email_verification import read_verification_token


def normalize_email(value):
    return value.strip().lower()


def users_for_email(email):
    return get_user_model().objects.alias(
        email_key=Lower(Func("email", function="BTRIM"))
    ).filter(email_key=email)


class LoginForm(forms.Form):
    email = forms.EmailField(max_length=254)
    password = forms.CharField(max_length=4096, strip=False)

    def clean_email(self):
        return normalize_email(self.cleaned_data["email"])


class SignupForm(LoginForm):
    nickname = forms.CharField(min_length=1, max_length=30)
    password_confirm = forms.CharField(max_length=4096, strip=False)
    verification_token = forms.CharField(max_length=4096, strip=False)

    def clean_email(self):
        email = super().clean_email()
        if users_for_email(email).exists():
            raise ValidationError("Email is unavailable.", code="email_unavailable")
        return email

    def clean(self):
        data = super().clean()
        if data.get("email") and data.get("verification_token"):
            try:
                read_verification_token(data["verification_token"], email=data["email"])
            except ValidationError as exc:
                self.add_error("verification_token", exc)
        password = data.get("password")
        confirmation = data.get("password_confirm")
        if password and confirmation and password != confirmation:
            self.add_error("password_confirm", ValidationError(
                "Passwords do not match.", code="password_mismatch"
            ))
        if password:
            user = get_user_model()(
                email=data.get("email", ""), first_name=data.get("nickname", "")
            )
            try:
                validate_password(password, user=user)
            except ValidationError as exc:
                self.add_error("password", exc)
        return data
