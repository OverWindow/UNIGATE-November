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
    def test_dictionary_needs_no_api_key_or_cache_alias(self):
        settings, _ = self.read_settings({"DJANGO_SECRET_KEY": "test"})
        self.assertNotIn("KRDICT_API_KEY", settings)
        self.assertNotIn("vocabulary_dictionary", settings["CACHES"])
        settings, _ = self.read_settings({"DJANGO_SECRET_KEY": "test", "KRDICT_API_KEY": " synthetic "})
        self.assertNotIn("KRDICT_API_KEY", settings)

    def read_settings(self, environment=None, files=None):
        files = files or {}
        selected = []

        def load_file(path, **kwargs):
            # Exercise the real parser with synthetic values only. / 실제 비밀 값은 읽지 않습니다.
            self.assertEqual(path.parent, BASE_DIR)
            selected.append(path.name)
            return load_dotenv(stream=io.StringIO(files.get(path.name, "")), **kwargs)

        defaults = {"DB_NAME": "synthetic", "DB_USER": "test", "DB_PASSWORD": "test",
                    "DB_HOST": "127.0.0.1", "DB_PORT": "5433"}
        with patch.dict(os.environ, defaults | (environment or {}), clear=True):
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
        self.assertEqual(settings["DATABASES"]["default"]["NAME"], "synthetic")

    def test_production_file_and_hosts(self):
        settings, selected = self.read_settings({"DJANGO_ENV": "production"}, {
            ".env.production": "DJANGO_SECRET_KEY=test-only\nDJANGO_ALLOWED_HOSTS=example.com, www.example.com",
        })
        self.assertEqual(selected, [".env.production"])
        self.assertFalse(settings["DEBUG"])
        self.assertEqual(settings["ALLOWED_HOSTS"], ["example.com", "www.example.com"])
        self.assertEqual(settings["DATABASES"]["default"]["NAME"], "synthetic")

    def test_process_values_override_file(self):
        settings, _ = self.read_settings({
            "DJANGO_SECRET_KEY": "process-test-key", "DJANGO_ALLOWED_HOSTS": "process.example.com",
        }, {".env.development": "DJANGO_SECRET_KEY=file-test-key\nDJANGO_ALLOWED_HOSTS=file.example.com"})
        self.assertEqual(settings["SECRET_KEY"], "process-test-key")
        self.assertEqual(settings["ALLOWED_HOSTS"], ["process.example.com"])

    def test_vocabulary_media_origin_is_optional_and_normalized(self):
        settings, _ = self.read_settings({"DJANGO_SECRET_KEY": "test"})
        self.assertEqual(settings["CLOUDFRONT_BASE_URL"], "")
        settings, _ = self.read_settings({"DJANGO_SECRET_KEY": "test", "CLOUDFRONT_BASE_URL": " https://media.example.com/ "})
        self.assertEqual(settings["CLOUDFRONT_BASE_URL"], "https://media.example.com")

    def test_vocabulary_media_origin_rejects_invalid_configuration_without_exposing_it(self):
        for value in ("http://media.example.com", "//media.example.com", "https://user:secret@media.example.com",
                      "https://media.example.com/media", "https://media.example.com/?key=secret",
                      "https://media.example.com/#fragment", "https://media.example.com:8443",
                      "https://media.example.com:invalid", "https://[invalid", "https://bad host.example.com"):
            with self.subTest(value=value), self.assertRaises(ImproperlyConfigured) as error:
                self.read_settings({"DJANGO_SECRET_KEY": "test", "CLOUDFRONT_BASE_URL": value})
            self.assertEqual(str(error.exception), "CLOUDFRONT_BASE_URL must be an HTTPS origin without credentials or a path.")

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
        self.assertEqual(settings["CSRF_COOKIE_SAMESITE"], "None")
        self.assertTrue(settings["SECURE_SSL_REDIRECT"])
        self.assertEqual(settings["SECURE_SSL_HOST"], "example.com")

    def test_postgresql_connection_values(self):
        settings, _ = self.read_settings({"DJANGO_SECRET_KEY": "test", "DB_NAME": "explicit",
                                          "DB_SSLMODE": "require"})
        database = settings["DATABASES"]["default"]
        self.assertEqual(database["ENGINE"], "django.db.backends.postgresql")
        self.assertEqual(database["NAME"], "explicit")
        self.assertEqual(database["OPTIONS"]["sslmode"], "require")

    def test_missing_connection_values_fail(self):
        for variable in ("DB_NAME", "DB_USER", "DB_PASSWORD", "DB_HOST", "DB_PORT"):
            with self.subTest(variable=variable), self.assertRaises(ImproperlyConfigured):
                self.read_settings({"DJANGO_SECRET_KEY": "test", variable: ""})

    def test_official_landing_origins_are_kept_in_sync(self):
        for origins in ("https://unigate.kr", "https://www.unigate.kr",
                        "https://unigate.kr,https://www.unigate.kr"):
            with self.subTest(origins=origins):
                settings, _ = self.read_settings({
                    "DJANGO_SECRET_KEY": "test",
                    "DJANGO_CSRF_TRUSTED_ORIGINS": origins + ",https://topiq.unigate.kr",
                    "DJANGO_ENV": "production", "DJANGO_ALLOWED_HOSTS": "api.unigate.kr",
                })
                trusted = settings["CSRF_TRUSTED_ORIGINS"]
                self.assertEqual(trusted.count("https://unigate.kr"), 1)
                self.assertEqual(trusted.count("https://www.unigate.kr"), 1)
                self.assertIn("https://topiq.unigate.kr", trusted)

    def test_landing_aliases_require_an_explicit_official_origin(self):
        for origin in ("", "https://example.com", "https://unigate.kr.evil.example",
                       "https://www.unigate.kr.evil.example", "https://topiq.unigate.kr"):
            with self.subTest(origin=origin):
                settings, _ = self.read_settings({
                    "DJANGO_SECRET_KEY": "test", "DJANGO_CSRF_TRUSTED_ORIGINS": origin,
                })
                self.assertNotIn("https://unigate.kr", settings["CSRF_TRUSTED_ORIGINS"])
                self.assertNotIn("https://www.unigate.kr", settings["CSRF_TRUSTED_ORIGINS"])
