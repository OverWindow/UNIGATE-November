import re
import time
from urllib.parse import urlsplit

from django.core import signing
from django.core.exceptions import ValidationError
from django.views.decorators.debug import sensitive_variables


TOKEN_SALT = "topiq.signup-email.v1"
TOKEN_MAX_AGE = 15 * 60
LANGUAGES = {"ko", "en", "id"}


def safe_return_path(value):
    if not isinstance(value, str) or len(value) > 2000 or not value.startswith("/"):
        return "/"
    if value.startswith("//") or "\\" in value or any(ord(char) < 32 for char in value):
        return "/"
    parsed = urlsplit(value)
    if parsed.netloc or re.match(r"^/(login|signup|verify-email)(/|$)", parsed.path):
        return "/"
    return value


@sensitive_variables()
def make_verification_token(email, language="ko", next_path="/"):
    return signing.dumps({
        "email": email.strip().lower(),
        "language": language if language in LANGUAGES else "ko",
        "next": safe_return_path(next_path),
        "expires_at": int(time.time()) + TOKEN_MAX_AGE,
    }, salt=TOKEN_SALT)


@sensitive_variables()
def read_verification_token(token, email=None):
    try:
        data = signing.loads(token, salt=TOKEN_SALT, max_age=TOKEN_MAX_AGE)
    except signing.SignatureExpired:
        raise ValidationError("Verification link expired.", code="email_verification_expired") from None
    except (signing.BadSignature, ValueError, TypeError):
        raise ValidationError("Invalid verification link.", code="email_verification_invalid") from None
    if (not isinstance(data, dict) or not isinstance(data.get("email"), str)
            or not isinstance(data.get("language"), str) or data["language"] not in LANGUAGES
            or not isinstance(data.get("expires_at"), int)
            or not isinstance(data.get("next"), str)):
        raise ValidationError("Invalid verification link.", code="email_verification_invalid")
    if data["expires_at"] <= time.time():
        raise ValidationError("Verification link expired.", code="email_verification_expired")
    if email is not None and data["email"] != email:
        raise ValidationError("Verify this email address first.", code="email_verification_mismatch")
    data["next"] = safe_return_path(data["next"])
    return data
