import os
from pathlib import Path
from urllib.parse import urlsplit

from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

DJANGO_ENV = os.environ.setdefault("DJANGO_ENV", "development")
if DJANGO_ENV not in {"development", "production"}:
    raise ImproperlyConfigured("DJANGO_ENV must be development or production.")

# Select one file; process variables win. / 환경 파일 하나만 읽고 프로세스 설정을 우선합니다.
load_dotenv(
    BASE_DIR / f".env.{DJANGO_ENV}",
    override=False,
    interpolate=False,
    encoding="utf-8-sig",
)

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "").strip()
if not SECRET_KEY:
    raise ImproperlyConfigured("Set DJANGO_SECRET_KEY before starting Django.")

DEBUG = DJANGO_ENV == "development"
BREVO_API_KEY = os.environ.get("BREVO_API_KEY", "").strip()
BREVO_SENDER_EMAIL = os.environ.get("BREVO_SENDER_EMAIL", "").strip()
BREVO_SENDER_NAME = os.environ.get("BREVO_SENDER_NAME", "TOPIQ").strip() or "TOPIQ"
TOPIQ_PUBLIC_URL = os.environ.get(
    "TOPIQ_PUBLIC_URL", "http://localhost:3001" if DEBUG else "https://topiq.unigate.kr"
).rstrip("/")
topiq_url = urlsplit(TOPIQ_PUBLIC_URL)
if (topiq_url.scheme not in ({"http", "https"} if DEBUG else {"https"}) or not topiq_url.netloc
        or topiq_url.username or topiq_url.password or topiq_url.path or topiq_url.query or topiq_url.fragment):
    raise ImproperlyConfigured("TOPIQ_PUBLIC_URL must be a trusted origin (HTTPS in production).")
ALLOWED_HOSTS = [
    host.strip()
    for host in os.environ.get(
        "DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1,[::1]" if DEBUG else ""
    ).split(",")
    if host.strip()
]
if not DEBUG and (not ALLOWED_HOSTS or "*" in ALLOWED_HOSTS):
    raise ImproperlyConfigured("Set explicit DJANGO_ALLOWED_HOSTS in production.")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "accounts.apps.AccountsConfig",
    "surveys.apps.SurveysConfig",
    "question_bank.apps.QuestionBankConfig",
]
MIGRATION_MODULES = {"surveys": "migration.surveys", "accounts": "migration.accounts", "question_bank": "migration.question_bank"}
CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}
CSRF_FAILURE_VIEW = "accounts.views.csrf_failure"
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "config.cors.SurveyCorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]
ROOT_URLCONF = "config.urls"
CSRF_TRUSTED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get(
        "DJANGO_CSRF_TRUSTED_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001" if DEBUG else "",
    ).split(",") if origin.strip()
]
# Both official landing hostnames use the same form; keep CORS and CSRF aligned.
landing_origins = ("https://unigate.kr", "https://www.unigate.kr")
if any(origin in CSRF_TRUSTED_ORIGINS for origin in landing_origins):
    CSRF_TRUSTED_ORIGINS += [origin for origin in landing_origins if origin not in CSRF_TRUSTED_ORIGINS]

TEMPLATES = [{
    "BACKEND": "django.template.backends.django.DjangoTemplates",
    "DIRS": [],
    "APP_DIRS": True,
    "OPTIONS": {"context_processors": [
        "django.template.context_processors.request",
        "django.contrib.auth.context_processors.auth",
        "django.contrib.messages.context_processors.messages",
    ]},
}]
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

# Explicit connection values prevent accidental connections to another database.
DB_CONFIG = {}
for variable in ("DB_NAME", "DB_USER", "DB_PASSWORD", "DB_HOST", "DB_PORT"):
    value = os.environ.get(variable, "")
    if not value:
        raise ImproperlyConfigured(f"Set {variable} before starting Django.")
    DB_CONFIG[variable] = value

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": DB_CONFIG["DB_NAME"],
        "USER": DB_CONFIG["DB_USER"],
        "PASSWORD": DB_CONFIG["DB_PASSWORD"],
        "HOST": DB_CONFIG["DB_HOST"],
        "PORT": DB_CONFIG["DB_PORT"],
        "OPTIONS": {"sslmode": os.environ.get("DB_SSLMODE", "prefer"), "connect_timeout": 10},
    }
}

LANGUAGE_CODE = "ko-kr"
TIME_ZONE = "Asia/Seoul"
USE_I18N = True
USE_TZ = True
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Enable only behind a proxy that replaces untrusted forwarded headers.
if os.environ.get("DJANGO_TRUST_PROXY", "0") == "1":
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
CSRF_COOKIE_SECURE = not DEBUG
# Cross-site requests require HTTPS and SameSite=None. / 교차 사이트 쿠키는 HTTPS가 필요합니다.
CSRF_COOKIE_SAMESITE = "Lax" if DEBUG else "None"
SESSION_COOKIE_SECURE = not DEBUG
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
SECURE_SSL_REDIRECT = os.environ.get("DJANGO_SSL_REDIRECT", "0") == "1"
SECURE_SSL_HOST = os.environ.get("DJANGO_SSL_HOST") or None
SECURE_REDIRECT_EXEMPT = [r"^api/health/$"]
