from django import forms
from django.contrib.auth import get_user_model, update_session_auth_hash
from django.contrib.auth.password_validation import validate_password
from django.core import signing
from django.core.exceptions import ValidationError
from django.utils.crypto import constant_time_compare, salted_hmac
from django.views.decorators.cache import never_cache
from django.views.decorators.debug import sensitive_post_parameters, sensitive_variables
from django.views.decorators.http import require_POST

from .email_delivery import EmailDeliveryError, send_password_email
from .email_verification import LANGUAGES
from .forms import normalize_email, users_for_email
from .rate_limits import clear_login_failures, login_rate_limit_lock, record_attempt, request_subject
from .views import (api_response, check_password_login, form_error, limited_response, rate_limit_errors,
                    read_payload)


TOKEN_SALT = "topiq.password-management.v1"
TOKEN_MAX_AGE = 15 * 60


class PasswordRequestForm(forms.Form):
    purpose = forms.ChoiceField(choices=(("reset", "reset"), ("change", "change")))
    language = forms.ChoiceField(choices=[(language, language) for language in sorted(LANGUAGES)])


class NewPasswordForm(forms.Form):
    new_password = forms.CharField(max_length=4096, strip=False)
    new_password_confirm = forms.CharField(max_length=4096, strip=False)

    def __init__(self, data, *, user):
        super().__init__(data)
        self.user = user

    @sensitive_variables()
    def clean(self):
        data = super().clean()
        password = data.get("new_password")
        confirmation = data.get("new_password_confirm")
        if password and confirmation and password != confirmation:
            self.add_error("new_password_confirm", ValidationError("Passwords do not match.", code="password_mismatch"))
        if password:
            try:
                validate_password(password, user=self.user)
            except ValidationError as exc:
                self.add_error("new_password", exc)
        return data


@sensitive_variables()
def password_state(user):
    # Keep the stored password hash and email out of readable signed tokens.
    return salted_hmac(TOKEN_SALT, f"{user.password}\0{normalize_email(user.email)}", algorithm="sha256").hexdigest()


@sensitive_variables()
def session_proof(request):
    return salted_hmac("topiq.password-change-session.v1", request.session.session_key, algorithm="sha256").hexdigest()


def accepted_response():
    return api_response({"status": "request_accepted", "retryAfter": 60}, status=202)


@never_cache
@require_POST
@rate_limit_errors
@sensitive_post_parameters("current_password")
@sensitive_variables()
def request_password(request):
    data, error = read_payload(request, {"purpose", "language", "current_password", "email"})
    if error is not None:
        return error
    data.setdefault("language", "ko")
    form = PasswordRequestForm(data)
    if not form.is_valid():
        return form_error(form)
    purpose, language = form.cleaned_data["purpose"], form.cleaned_data["language"]
    if purpose == "change":
        if not request.user.is_authenticated:
            return api_response({"error": "authentication_required"}, status=401)
        if "email" in data:
            return api_response({"error": "invalid_json"}, status=400)
        if not request.user.has_usable_password():
            return api_response({"error": "password_unavailable"}, status=400)
        try:
            email = normalize_email(forms.EmailField(max_length=254).clean(request.user.email))
        except ValidationError:
            return api_response({"error": "password_unavailable"}, status=400)
        current_password = data.get("current_password", "")
        if not 1 <= len(current_password) <= 4096:
            return api_response({"error": "invalid_credentials"}, status=401)
        user, error = check_password_login(request, email, current_password, target_id=request.user.pk)
        if error is not None:
            return error
        if user.password != request.user.password:
            # Successful reauthentication may have upgraded the stored password hash.
            update_session_auth_hash(request, user)
    else:
        if "current_password" in data:
            return api_response({"error": "invalid_json"}, status=400)
        try:
            email = normalize_email(forms.EmailField(max_length=254).clean(data.get("email")))
        except ValidationError as exc:
            codes = [item.code for item in exc.error_list]
            return api_response({"error": "validation_error", "fields": {"email": codes}}, status=400)

    wait = record_attempt(f"password-{purpose}-subject", request_subject(request), limit=100, window=3600)
    if wait:
        return limited_response(wait)
    for scope, limit, window in (("resend", 1, 60), ("send", 5, 600)):
        wait = record_attempt(f"password-{purpose}-{scope}", email, limit=limit, window=window)
        if wait:
            return accepted_response() if purpose == "reset" else limited_response(wait)

    if purpose == "reset":
        user = users_for_email(email).filter(is_active=True).first()
        if user is None or not user.has_usable_password():
            return accepted_response()
    proof = {"uid": user.pk, "purpose": purpose, "state": password_state(user)}
    if purpose == "change":
        proof["session"] = session_proof(request)
    token = signing.dumps(proof, salt=TOKEN_SALT)
    try:
        send_password_email(email, token, purpose, language)
    except EmailDeliveryError:
        if purpose == "change":
            return api_response({"error": "email_delivery_unavailable"}, status=503)
    return accepted_response()


def invalid_link():
    return api_response({"error": "password_link_invalid"}, status=400)


@never_cache
@require_POST
@rate_limit_errors
@sensitive_post_parameters("token", "new_password", "new_password_confirm")
@sensitive_variables()
def confirm_password(request):
    data, error = read_payload(request, {"token", "new_password", "new_password_confirm"})
    if error is not None:
        return error
    token = data.get("token", "")
    if not token or len(token) > 4096:
        return invalid_link()
    try:
        proof = signing.loads(token, salt=TOKEN_SALT, max_age=TOKEN_MAX_AGE)
    except signing.SignatureExpired:
        return api_response({"error": "password_link_expired"}, status=400)
    except (signing.BadSignature, ValueError, TypeError):
        return invalid_link()
    if (not isinstance(proof, dict) or type(proof.get("uid")) is not int or not isinstance(proof.get("state"), str)
            or proof.get("purpose") not in ("reset", "change")):
        return invalid_link()
    purpose = proof["purpose"]
    if purpose == "change":
        if not request.user.is_authenticated:
            return api_response({"error": "authentication_required"}, status=401)
        if (request.user.pk != proof["uid"] or not isinstance(proof.get("session"), str)
                or not constant_time_compare(proof["session"], session_proof(request))):
            return api_response({"error": "password_session_mismatch"}, status=403)

    users = get_user_model().objects.filter(pk=proof["uid"], is_active=True)
    address = users.values_list("email", flat=True).first()
    if not address or not address.strip():
        return invalid_link()
    email = normalize_email(address)
    # Acquire locks in login order so concurrent login failures and confirmations stay consistent.
    with login_rate_limit_lock(email):
        user = users.select_for_update().first()
        if (user is None or normalize_email(user.email) != email or not user.has_usable_password()
                or not constant_time_compare(proof["state"], password_state(user))):
            return invalid_link()
        form = NewPasswordForm(data, user=user)
        if not form.is_valid():
            return form_error(form)
        # Lock contention may have taken a link past its deadline.
        try:
            signing.TimestampSigner(salt=TOKEN_SALT).unsign(token, max_age=TOKEN_MAX_AGE)
        except signing.SignatureExpired:
            return api_response({"error": "password_link_expired"}, status=400)
        user.set_password(form.cleaned_data["new_password"])
        user.save(update_fields=["password"])
        clear_login_failures(email)
    if purpose == "change":
        update_session_auth_hash(request, user)
    return api_response({"purpose": purpose})
