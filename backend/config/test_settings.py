import io
import os
from pathlib import Path
import runpy
import unittest
from unittest.mock import patch

from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv


BASE_DIR = Path(__file__).resolve().parent.parent


class EnvironmentSettingsTests(unittest.TestCase):
    def read_settings(self, environment=None, files=None):
        files = files or {}
        selected = []

        def load_file(path, **kwargs):
            # Exercise the real parser with synthetic values only. / 실제 비밀 값은 읽지 않습니다.
            self.assertEqual(path.parent, BASE_DIR)
            selected.append(path.name)
            return load_dotenv(stream=io.StringIO(files.get(path.name, "")), **kwargs)

        with patch.dict(os.environ, environment or {}, clear=True):
            with patch("dotenv.load_dotenv", side_effect=load_file):
                settings = runpy.run_path(str(BASE_DIR / "config" / "settings.py"))
        return settings, selected

    def test_defaults_to_development_and_preserves_literal_secret(self):
        settings, selected = self.read_settings(files={
            ".env.development": "DJANGO_SECRET_KEY='test-${LITERAL}-#value'\nDJANGO_ENV=production",
            ".env.production": "DJANGO_SECRET_KEY=wrong-file",
        })
        self.assertEqual(selected, [".env.development"])
        self.assertEqual(settings["SECRET_KEY"], "test-${LITERAL}-#value")
        self.assertEqual(settings["DJANGO_ENV"], "development")
        self.assertTrue(settings["DEBUG"])
        self.assertEqual(settings["DATABASES"]["default"]["NAME"], BASE_DIR / "data/db.sqlite3")

    def test_production_file_and_hosts(self):
        settings, selected = self.read_settings({"DJANGO_ENV": "production"}, {
            ".env.production": "DJANGO_SECRET_KEY=test-only\nDJANGO_ALLOWED_HOSTS=example.com, www.example.com",
        })
        self.assertEqual(selected, [".env.production"])
        self.assertFalse(settings["DEBUG"])
        self.assertEqual(settings["ALLOWED_HOSTS"], ["example.com", "www.example.com"])
        self.assertEqual(settings["DATABASES"]["default"]["NAME"], BASE_DIR / "data/db.sqlite3")

    def test_process_values_override_file(self):
        settings, _ = self.read_settings({
            "DJANGO_SECRET_KEY": "process-test-key", "DJANGO_ALLOWED_HOSTS": "process.example.com",
        }, {".env.development": "DJANGO_SECRET_KEY=file-test-key\nDJANGO_ALLOWED_HOSTS=file.example.com"})
        self.assertEqual(settings["SECRET_KEY"], "process-test-key")
        self.assertEqual(settings["ALLOWED_HOSTS"], ["process.example.com"])

    def test_process_only_configuration(self):
        settings, _ = self.read_settings({
            "DJANGO_ENV": "production", "DJANGO_SECRET_KEY": "test-only",
            "DJANGO_ALLOWED_HOSTS": "example.com",
        })
        self.assertFalse(settings["DEBUG"])

    def test_invalid_environment(self):
        with self.assertRaises(ImproperlyConfigured):
            self.read_settings({"DJANGO_ENV": "staging"})

    def test_missing_or_empty_secret_fails_without_fallback(self):
        for environment in ({"DJANGO_ENV": "production"}, {"DJANGO_SECRET_KEY": ""}):
            with self.subTest(environment=environment), self.assertRaises(ImproperlyConfigured):
                self.read_settings(environment, {".env.development": "DJANGO_SECRET_KEY=test-only"})

    def test_production_requires_explicit_hosts(self):
        for hosts in ("", "*", "example.com,*"):
            with self.subTest(hosts=hosts), self.assertRaises(ImproperlyConfigured):
                self.read_settings({"DJANGO_ENV": "production"}, {
                    ".env.production": f"DJANGO_SECRET_KEY=test-only\nDJANGO_ALLOWED_HOSTS={hosts}",
                })

    def test_production_proxy_and_cookies(self):
        settings, _ = self.read_settings({
            "DJANGO_ENV": "production", "DJANGO_SECRET_KEY": "test-only",
            "DJANGO_ALLOWED_HOSTS": "example.com", "DJANGO_TRUST_PROXY": "1",
            "DJANGO_SSL_REDIRECT": "1", "DJANGO_SSL_HOST": "example.com",
        })
        self.assertEqual(settings["SECURE_PROXY_SSL_HEADER"], ("HTTP_X_FORWARDED_PROTO", "https"))
        self.assertTrue(settings["CSRF_COOKIE_SECURE"])
        self.assertTrue(settings["SECURE_SSL_REDIRECT"])
        self.assertEqual(settings["SECURE_SSL_HOST"], "example.com")
