from django import forms
from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db.models import Func
from django.db.models.functions import Lower
from django.views.decorators.debug import sensitive_variables
from unfold.forms import AuthenticationForm

from .email_verification import read_verification_token


def normalize_email(value):
    return value.strip().lower()


def users_for_email(email):
    return get_user_model().objects.alias(
        email_key=Lower(Func("email", function="BTRIM"))
    ).filter(email_key=email)


class AdminEmailLoginForm(AuthenticationForm):
    # Unfold's login template renders the identifier as form.username.
    username = forms.EmailField(
        label="이메일", max_length=254, widget=forms.EmailInput(attrs={"autocomplete": "username"}),
    )
    error_messages = {
        **AuthenticationForm.error_messages,
        "invalid_login": "관리자 이메일과 비밀번호를 확인해 주세요.",
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Django initializes this field with the shorter username limit.
        field = self.fields["username"]
        field.max_length = self.base_fields["username"].max_length
        field.widget.attrs["maxlength"] = field.max_length

    @sensitive_variables()
    def clean(self):
        address = self.cleaned_data.get("username")
        password = self.cleaned_data.get("password")
        if not address or not password:
            return self.cleaned_data

        email = normalize_email(address)
        usernames = list(users_for_email(email).values_list("username", flat=True)[:2])
        if len(usernames) != 1:
            # Match Django's password hashing cost for unknown accounts.
            get_user_model()().set_password(password)
            raise self.get_invalid_login_error()

        self.user_cache = authenticate(self.request, username=usernames[0], password=password)
        if self.user_cache is None or normalize_email(self.user_cache.email) != email:
            raise self.get_invalid_login_error()
        self.confirm_login_allowed(self.user_cache)
        return self.cleaned_data


class LoginForm(forms.Form):
    email = forms.EmailField(max_length=254)
    password = forms.CharField(max_length=4096, strip=False)

    def clean_email(self):
        return normalize_email(self.cleaned_data["email"])


class NicknameForm(forms.Form):
    nickname = forms.CharField(min_length=1, max_length=30)


class SignupForm(LoginForm, NicknameForm):
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
