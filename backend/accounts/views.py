import json
import logging
from functools import wraps
from uuid import uuid4

from django.contrib.auth import authenticate, get_user_model, login, logout
from django import forms
from django.core.exceptions import RequestDataTooBig, ValidationError
from django.db import IntegrityError, transaction
from django.http import HttpResponse, JsonResponse
from django.middleware.csrf import get_token
from django.utils.cache import patch_vary_headers
from django.views.csrf import csrf_failure as default_csrf_failure
from django.views.decorators.cache import never_cache
from django.views.decorators.debug import sensitive_post_parameters, sensitive_variables
from django.views.decorators.http import require_GET, require_POST

from surveys.learner import CATALOG, validate_survey
from surveys.models import SignupSurveyResponse

from .forms import LoginForm, SignupForm, normalize_email, users_for_email
from .rate_limits import RateLimitUnavailable, check_limit, clear_login_failures, login_rate_limit_lock, record_attempt
from .email_delivery import EmailDeliveryError, send_verification_email
from .email_verification import LANGUAGES, make_verification_token, read_verification_token


logger = logging.getLogger(__name__)
EMAIL_INDEX = "auth_user_email_ci_unique"


def api_response(data=None, status=200):
    response = HttpResponse(status=204) if status == 204 else JsonResponse(data, status=status)
    response["Cache-Control"] = "private, no-store"
    patch_vary_headers(response, ("Cookie",))
    return response


def csrf_failure(request, reason=""):
    if request.path.startswith(("/api/auth/", "/api/pbt/", "/api/ibt/")):
        return api_response({"error": "csrf_failed"}, status=403)
    return default_csrf_failure(request, reason=reason)


def read_payload(request, allowed_fields, *, object_fields=()):
    if request.content_type != "application/json":
        return None, api_response({"error": "unsupported_media_type"}, status=415)
    try:
        if len(request.body) > 16_384:
            return None, api_response({"error": "payload_too_large"}, status=413)
        data = json.loads(request.body)
    except RequestDataTooBig:
        return None, api_response({"error": "payload_too_large"}, status=413)
    except (ValueError, UnicodeDecodeError):
        return None, api_response({"error": "invalid_json"}, status=400)
    if not isinstance(data, dict) or set(data) - allowed_fields:
        return None, api_response({"error": "invalid_json"}, status=400)
    if any(not isinstance(value, dict if key in object_fields else str) for key, value in data.items()):
        return None, api_response({"error": "invalid_json"}, status=400)
    return data, None


def form_error(form):
    fields = {field: [error.code for error in errors]
              for field, errors in form.errors.as_data().items()}
    return api_response({"error": "validation_error", "fields": fields}, status=400)


def limited_response(seconds):
    response = api_response({"error": "rate_limited"}, status=429)
    response["Retry-After"] = str(seconds)
    return response


def rate_limit_errors(view):
    @wraps(view)
    def wrapped(request, *args, **kwargs):
        try:
            return view(request, *args, **kwargs)
        except RateLimitUnavailable:
            response = api_response({"error": "server_error"}, status=503)
            response["Retry-After"] = "5"
            return response
    return wrapped


def user_data(user):
    return {"id": user.pk, "email": user.email,
            "nickname": user.first_name or user.get_username()}


@never_cache
@require_POST
@rate_limit_errors
@sensitive_post_parameters("password", "password_confirm", "verification_token")
@sensitive_variables()
def signup(request):
    if request.user.is_authenticated:
        return api_response({"error": "already_authenticated"}, status=409)
    data, error = read_payload(request, {"email", "nickname", "password", "password_confirm", "verification_token", "language", "survey"}, object_fields={"survey"})
    if error is not None:
        return error
    email = normalize_email(data.get("email", ""))
    wait = record_attempt("signup", email, limit=5, window=600)
    if wait:
        return limited_response(wait)
    form = SignupForm(data)
    if not form.is_valid():
        return form_error(form)
    if data.get("language") not in LANGUAGES:
        return api_response({"error": "validation_error", "fields": {"language": ["invalid"]}}, status=400)
    try:
        survey = validate_survey(data.get("survey"), consent_version=CATALOG["signupConsentVersion"],
                                 survey_version=CATALOG["signupVersion"])
    except ValidationError as exc:
        return api_response({"error": "validation_error", "fields": exc.message_dict}, status=400)
    try:
        with transaction.atomic():
            user = get_user_model().objects.create_user(
                username=f"u_{uuid4().hex}", email=form.cleaned_data["email"],
                first_name=form.cleaned_data["nickname"], password=form.cleaned_data["password"],
                is_staff=False, is_superuser=False, is_active=True,
            )
            SignupSurveyResponse.objects.create(user=user, language=data["language"], **survey)
            clear_login_failures(user.email)
    except IntegrityError as exc:
        if getattr(getattr(exc.__cause__, "diag", None), "constraint_name", None) == EMAIL_INDEX:
            return api_response({"error": "validation_error", "fields": {"email": ["email_unavailable"]}}, status=400)
        # Avoid database exception details, which can contain submitted email addresses.
        logger.error("Account creation failed (%s).", type(exc).__name__)
        return api_response({"error": "server_error"}, status=500)
    login(request, user, backend="django.contrib.auth.backends.ModelBackend")
    return api_response({"user": user_data(user), "csrfToken": get_token(request)}, status=201)


@never_cache
@require_POST
@rate_limit_errors
@sensitive_post_parameters("password")
@sensitive_variables()
def login_view(request):
    data, error = read_payload(request, {"email", "password"})
    if error is not None:
        return error
    form = LoginForm(data)
    if not form.is_valid():
        return form_error(form)
    email = form.cleaned_data["email"]
    with login_rate_limit_lock(email):
        wait = check_limit("login", email, limit=5)
        if wait:
            return limited_response(wait)
        candidate = users_for_email(email).first()
        if candidate is None:
            # Match Django's nonexistent-user password hashing cost.
            get_user_model()().set_password(form.cleaned_data["password"])
            user = None
        else:
            user = authenticate(request, username=candidate.get_username(), password=form.cleaned_data["password"])
        if user is None:
            wait = record_attempt("login", email, limit=5, window=300)
            return limited_response(wait) if wait else api_response({"error": "invalid_credentials"}, status=401)
        clear_login_failures(email)
    login(request, user)
    return api_response({"user": user_data(user), "csrfToken": get_token(request)})


@never_cache
@require_POST
def logout_view(request):
    logout(request)
    return api_response(status=204)


@never_cache
@require_GET
def me(request):
    if not request.user.is_authenticated:
        return api_response({"error": "authentication_required"}, status=401)
    return api_response({"user": user_data(request.user)})


@never_cache
@require_POST
@rate_limit_errors
@sensitive_variables()
def send_email_verification(request):
    if request.user.is_authenticated:
        return api_response({"error": "already_authenticated"}, status=409)
    data, error = read_payload(request, {"email", "language", "next"})
    if error is not None:
        return error
    try:
        email = normalize_email(forms.EmailField(max_length=254).clean(data.get("email", "")))
    except ValidationError as exc:
        return api_response({"error": "validation_error", "fields": {"email": [item.code for item in exc.error_list]}}, status=400)
    language = data.get("language", "ko")
    if language not in LANGUAGES:
        return api_response({"error": "validation_error", "fields": {"language": ["invalid"]}}, status=400)
    # Use the socket peer rather than trusting a caller-supplied forwarded IP.
    for action, key, limit, window in (
        ("email-resend", email, 1, 60),
        ("email-send", email, 5, 600),
        ("email-send-peer", request.META.get("REMOTE_ADDR", "unknown"), 100, 3600),
    ):
        wait = record_attempt(action, key, limit, window)
        if wait:
            return limited_response(wait)
    if users_for_email(email).exists():
        return api_response({"error": "validation_error", "fields": {"email": ["email_unavailable"]}}, status=400)
    token = make_verification_token(email, language, data.get("next", "/"))
    try:
        send_verification_email(email, token, language)
    except EmailDeliveryError:
        return api_response({"error": "email_delivery_unavailable"}, status=503)
    return api_response({"status": "verification_sent", "retryAfter": 60}, status=202)


@never_cache
@require_POST
@sensitive_post_parameters("token")
@sensitive_variables()
def verify_email(request):
    data, error = read_payload(request, {"token"})
    if error is not None:
        return error
    token = data.get("token", "")
    if not token or len(token) > 4096:
        return api_response({"error": "email_verification_invalid"}, status=400)
    try:
        verified = read_verification_token(token)
    except ValidationError as exc:
        return api_response({"error": exc.code}, status=400)
    return api_response({"email": verified["email"], "language": verified["language"],
                         "next": verified["next"], "expiresAt": verified["expires_at"]})
