import secrets
import time

from django import forms
from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.views.decorators.debug import sensitive_variables
from django.views.decorators.http import require_POST
from google.auth.exceptions import GoogleAuthError, TransportError

from .email_verification import read_verification_token
from .forms import NicknameForm, normalize_email, users_for_email
from .google_identity import CHALLENGE_TTL, PENDING_TTL, pending_flow, verify_credential
from .models import GoogleIdentity
from .rate_limits import record_attempt, request_subject
from .views import (api_response, check_password_login, complete_signup, form_error, limited_response,
                    login_response, rate_limit_errors, read_payload)


def restart_response():
    return api_response({"error": "google_restart"}, status=409)


@require_POST
@rate_limit_errors
def start(request):
    if not settings.GOOGLE_CLIENT_ID:
        return api_response({"enabled": False})
    if request.user.is_authenticated:
        return api_response({"error": "already_authenticated"}, status=409)
    _, error = read_payload(request, set())
    if error is not None:
        return error
    wait = record_attempt("google-start", request_subject(request), limit=30, window=600)
    if wait:
        return limited_response(wait)
    nonce = secrets.token_urlsafe(32)
    request.session["google_challenge"] = {"nonce": nonce, "expires_at": time.time() + CHALLENGE_TTL}
    return api_response({"enabled": True, "clientId": settings.GOOGLE_CLIENT_ID, "nonce": nonce})


@require_POST
@rate_limit_errors
@sensitive_variables()
def verify(request):
    if request.user.is_authenticated:
        return api_response({"error": "already_authenticated"}, status=409)
    challenge = request.session.pop("google_challenge", None)
    if not settings.GOOGLE_CLIENT_ID or not challenge or challenge["expires_at"] <= time.time():
        return restart_response()
    data, error = read_payload(request, {"credential"})
    if error is not None:
        return error
    credential = data.get("credential", "")
    if not credential or not credential.isascii():
        return api_response({"error": "google_invalid"}, status=401)
    # Session writes alone cannot consume a nonce concurrently across Django workers.
    if record_attempt("google-nonce", challenge["nonce"], limit=1, window=CHALLENGE_TTL):
        return restart_response()
    try:
        claims = verify_credential(credential)
    except TransportError:
        return api_response({"error": "google_unavailable"}, status=503)
    except (GoogleAuthError, ValueError, TypeError, KeyError):
        return api_response({"error": "google_invalid"}, status=401)
    sub = claims.get("sub")
    if (claims.get("nonce") != challenge["nonce"] or not isinstance(sub, str)
            or not sub.isascii() or not 1 <= len(sub) <= 255):
        return api_response({"error": "google_invalid"}, status=401)
    identity = GoogleIdentity.objects.select_related("user").filter(google_sub=sub).first()
    if identity:
        if not identity.user.is_active:
            return api_response({"error": "invalid_credentials"}, status=401)
        return login_response(request, identity.user)

    try:
        email = normalize_email(forms.EmailField(max_length=254).clean(claims.get("email")))
    except ValidationError:
        return api_response({"error": "google_invalid"}, status=401)
    candidate = users_for_email(email).first()
    if candidate and (not candidate.is_active or not candidate.has_usable_password()
                      or GoogleIdentity.objects.filter(user=candidate).exists()):
        return api_response({"error": "google_conflict"}, status=409)
    trusted_email = claims.get("email_verified") is True and (email.endswith("@gmail.com") or bool(claims.get("hd")))
    step = "link" if candidate else "signup"
    flow = secrets.token_urlsafe(32)
    expires = int(time.time()) + PENDING_TTL
    request.session["google_pending"] = {
        "id": flow, "step": step, "sub": sub, "email": email, "user_id": candidate.pk if candidate else None,
        "email_required": not trusted_email, "expires_at": expires,
    }
    return api_response({"step": step, "email": email, "flow": flow, "expiresAt": expires,
                         "needsEmail": step == "signup" and not trusted_email})


@require_POST
@rate_limit_errors
@sensitive_variables()
def signup(request):
    data, error = read_payload(request, {"flow", "nickname", "survey", "language", "verification_token"},
                               object_fields={"survey"})
    if error is not None:
        return error
    pending = pending_flow(request, data.get("flow", ""), "signup")
    if not pending:
        return restart_response()
    wait = record_attempt("signup", pending["email"], limit=5, window=600)
    if wait:
        return limited_response(wait)
    if pending["email_required"]:
        try:
            read_verification_token(data.get("verification_token", ""), email=pending["email"], google_flow=pending["id"])
        except ValidationError as exc:
            return api_response({"error": exc.code}, status=400)
    form = NicknameForm(data)
    if not form.is_valid():
        return form_error(form)
    return complete_signup(request, data, nickname=form.cleaned_data["nickname"], email=pending["email"],
                           google_sub=pending["sub"])


@require_POST
@rate_limit_errors
@sensitive_variables()
def link(request):
    data, error = read_payload(request, {"flow", "password"})
    if error is not None:
        return error
    pending = pending_flow(request, data.get("flow", ""), "link")
    if not pending:
        return restart_response()
    password = data.get("password", "")
    if not 1 <= len(password) <= 4096:
        return api_response({"error": "invalid_credentials"}, status=401)
    try:
        with transaction.atomic():
            user, error = check_password_login(request, pending["email"], password, target_id=pending["user_id"])
            if error is not None:
                return error
            GoogleIdentity.objects.create(user=user, google_sub=pending["sub"])
    except IntegrityError:
        return api_response({"error": "google_conflict"}, status=409)
    return login_response(request, user)
