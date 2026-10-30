"""Django settings for development and production. / 개발·운영 환경의 Django 설정."""

import os
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv

# Environment selection; process variables override file values.
# 실행 환경을 선택하며, 프로세스 환경 변수가 파일 값보다 우선합니다.
BASE_DIR = Path(__file__).resolve().parent.parent
DJANGO_ENV = os.environ.get("DJANGO_ENV", "development")
if DJANGO_ENV not in {"development", "production"}:
    raise ImproperlyConfigured("DJANGO_ENV must be development or production.")

load_dotenv(BASE_DIR / f".env.{DJANGO_ENV}", override=False)

# Reject incomplete production settings instead of using development defaults.
# 운영 필수 값이 없으면 개발 기본값으로 대체하지 않고 중단합니다.
if DJANGO_ENV == "production":
    required = (
        "DJANGO_SECRET_KEY", "DJANGO_ALLOWED_HOSTS", "POSTGRES_DB",
        "POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_HOST", "POSTGRES_PORT",
    )
    missing = [name for name in required if not os.environ.get(name, "").strip()]
    if missing:
        raise ImproperlyConfigured("Missing production settings: " + ", ".join(missing))


# Security and allowed hosts / 비밀 키·개발 모드·허용 호스트
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "")
if not SECRET_KEY or SECRET_KEY == "replace-with-a-random-secret-key":
    raise ImproperlyConfigured(
        f"Set DJANGO_SECRET_KEY in the environment or backend/.env.{DJANGO_ENV}."
    )

DEBUG = os.environ.get("DJANGO_DEBUG", "False").lower() == "true"
if DJANGO_ENV == "production" and DEBUG:
    raise ImproperlyConfigured("DJANGO_DEBUG must be False in production.")

ALLOWED_HOSTS = [
    host.strip()
    for host in os.environ.get("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1,[::1]").split(",")
    if host.strip()
]


# Django apps and request processing / Django 앱 및 요청 처리
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

# Django admin still needs templates alongside the React frontend.
# React 프론트엔드와 별개로 Django 관리자 화면에는 템플릿이 필요합니다.
TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'


# PostgreSQL connection; provision the database separately.
# PostgreSQL 연결 설정이며, 데이터베이스는 별도로 준비합니다.
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.environ.get("POSTGRES_DB", "unigate"),
        "USER": os.environ.get("POSTGRES_USER", "unigate"),
        "PASSWORD": os.environ.get("POSTGRES_PASSWORD", ""),
        "HOST": os.environ.get("POSTGRES_HOST", "localhost"),
        "PORT": os.environ.get("POSTGRES_PORT", "5432"),
    }
}


# Password validation / 비밀번호 검증
AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]


# Language and timezone / 언어 및 시간대
LANGUAGE_CODE = 'ko-kr'

TIME_ZONE = 'Asia/Seoul'

USE_I18N = True

USE_TZ = True


# Static files and model defaults / 정적 파일 및 모델 기본값
STATIC_URL = 'static/'


DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

STATIC_ROOT = BASE_DIR / "staticfiles"
