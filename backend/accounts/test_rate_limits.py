from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from io import StringIO
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.sessions.backends.db import SessionStore
from django.contrib.sessions.models import Session
from django.core.cache import cache
from django.core.management import call_command, CommandError
from django.db import DatabaseError, connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TestCase, TransactionTestCase, override_settings
from django.utils import timezone

from .models import RateLimit
from .rate_limits import RateLimitUnavailable, check_limit, clear_login_failures, record_attempt, cleanup_expired
from .tests import AuthClientMixin, FAST_HASHERS


class RateLimitStorageTests(TestCase):
    def test_active_block_survives_more_than_300_other_keys_and_cache_clear(self):
        for _ in range(5):
            record_attempt("login", "blocked@example.invalid", 5, 300)
        for index in range(400):
            record_attempt("signup", f"synthetic-{index}@example.invalid", 5, 600)
        cache.clear()
        self.assertGreater(check_limit("login", "blocked@example.invalid", 5), 0)
        self.assertEqual(RateLimit.objects.count(), 401)

    def test_fixed_window_saturated_count_expiration_and_hashed_identifiers(self):
        for _ in range(5):
            self.assertEqual(record_attempt("login", "private@example.invalid", 5, 300), 0)
        record = RateLimit.objects.get()
        expires = record.expires_at
        self.assertEqual(len(record.key_hash), 64)
        self.assertNotIn("private", record.key_hash)
        for _ in range(10):
            self.assertGreater(record_attempt("login", "private@example.invalid", 5, 300), 0)
        record.refresh_from_db()
        self.assertEqual(record.attempts, 6)
        self.assertEqual(record.expires_at, expires)
        record.expires_at = timezone.now() - timedelta(seconds=1)
        record.save(update_fields=["expires_at"])
        self.assertEqual(check_limit("login", "private@example.invalid", 5), 0)
        self.assertEqual(record_attempt("login", "private@example.invalid", 5, 300), 0)
        record.refresh_from_db()
        self.assertEqual(record.attempts, 1)
        self.assertGreater(record.expires_at, expires - timedelta(seconds=1))

    def test_success_clears_only_the_matching_login_key(self):
        record_attempt("login", "one@example.invalid", 1, 300)
        record_attempt("login", "two@example.invalid", 1, 300)
        record_attempt("signup", "one@example.invalid", 1, 600)
        clear_login_failures("one@example.invalid")
        self.assertEqual(check_limit("login", "one@example.invalid", 1), 0)
        self.assertGreater(check_limit("login", "two@example.invalid", 1), 0)
        self.assertGreater(check_limit("signup", "one@example.invalid", 1), 0)

    def test_cleanup_command_deletes_only_expired_rows_in_batches(self):
        for index in range(4):
            record_attempt("signup", f"expired-{index}@example.invalid", 5, 600)
        RateLimit.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
        record_attempt("signup", "still-active@example.invalid", 1, 600)
        output = StringIO()
        call_command("cleanup_auth_rate_limits", batch_size=2, stdout=output)
        self.assertIn("Deleted 4", output.getvalue())
        self.assertEqual(RateLimit.objects.count(), 1)
        self.assertGreater(check_limit("signup", "still-active@example.invalid", 1), 0)
        self.assertEqual(cleanup_expired(), 0)
        for size in (0, -1, 10001):
            with self.assertRaises(CommandError):
                call_command("cleanup_auth_rate_limits", batch_size=size, stdout=StringIO())

    def test_storage_errors_are_sanitized_and_leave_connection_usable(self):
        for operation in (
            lambda: check_limit("login", "private@example.invalid", 5),
            lambda: record_attempt("login", "private@example.invalid", 5, 300),
            lambda: clear_login_failures("private@example.invalid"),
        ):
            with patch("accounts.rate_limits.connection.cursor", side_effect=DatabaseError("synthetic-sensitive-detail")):
                with self.assertLogs("accounts.rate_limits", level="ERROR") as logs:
                    with self.assertRaises(RateLimitUnavailable):
                        operation()
            self.assertNotIn("synthetic-sensitive-detail", "".join(logs.output))
            self.assertEqual(RateLimit.objects.count(), 0)


@override_settings(PASSWORD_HASHERS=FAST_HASHERS)
class RateLimitFailureApiTests(AuthClientMixin, TestCase):
    def setUp(self):
        self.client, self.token = self.csrf_client()

    @patch("accounts.views.send_verification_email")
    def test_database_failure_returns_503_without_creating_user_session_or_email(self, send):
        payloads = {
            "signup": self.payload(),
            "login": {"email": "learner@example.invalid", "password": "synthetic-password"},
            "email/send": {"email": "learner@example.invalid"},
        }
        for path, payload in payloads.items():
            with patch("accounts.rate_limits.connection.cursor", side_effect=DatabaseError("synthetic-sensitive-detail")):
                with self.assertLogs("accounts.rate_limits", level="ERROR"):
                    response = self.post(f"/api/auth/{path}/", payload)
            self.assertEqual(response.status_code, 503)
            self.assertEqual(response.json(), {"error": "server_error"})
            self.assertEqual(response["Retry-After"], "5")
            self.assertIn("no-store", response["Cache-Control"])
            self.assertNotIn("sessionid", response.cookies)
        self.assertFalse(get_user_model().objects.exists())
        send.assert_not_called()

    @patch("accounts.views.clear_login_failures", side_effect=RateLimitUnavailable)
    def test_signup_rolls_back_if_clearing_failures_fails(self, clear):
        response = self.post("/api/auth/signup/", self.payload())
        self.assertEqual(response.status_code, 503)
        self.assertFalse(get_user_model().objects.exists())
        self.assertNotIn("sessionid", response.cookies)


class RateLimitPersistenceTests(TransactionTestCase):
    def test_new_database_connection_reads_existing_block(self):
        for _ in range(5):
            record_attempt("login", "persistent@example.invalid", 5, 300)

        def read_from_other_connection():
            try:
                return check_limit("login", "persistent@example.invalid", 5)
            finally:
                connection.close()

        with ThreadPoolExecutor(max_workers=1) as pool:
            self.assertGreater(pool.submit(read_from_other_connection).result(), 0)

    def test_migration_adds_only_rate_limit_table_and_keeps_user_and_session_data(self):
        user = get_user_model().objects.create_user(username="preserved", email="preserved@example.invalid")
        session = SessionStore()
        session["synthetic"] = True
        session.save()
        saved_user = get_user_model().objects.values().get(pk=user.pk)
        saved_session = Session.objects.values().get(session_key=session.session_key)
        before_tables = set(connection.introspection.table_names())
        with connection.cursor() as cursor:
            columns = {table: [column.name for column in connection.introspection.get_table_description(cursor, table)]
                       for table in ("auth_user", "django_session")}
        record_attempt("signup", "transient@example.invalid", 5, 600)
        try:
            MigrationExecutor(connection).migrate([("accounts", "0001_initial")])
            self.assertEqual(set(connection.introspection.table_names()), before_tables - {"accounts_rate_limit"})
            self.assertEqual(get_user_model().objects.values().get(pk=user.pk), saved_user)
            self.assertEqual(Session.objects.values().get(session_key=session.session_key), saved_session)
        finally:
            MigrationExecutor(connection).migrate([("accounts", "0002_rate_limit")])
        self.assertEqual(set(connection.introspection.table_names()), before_tables)
        self.assertEqual(RateLimit.objects.count(), 0)
        with connection.cursor() as cursor:
            for table in columns:
                self.assertEqual([column.name for column in connection.introspection.get_table_description(cursor, table)], columns[table])
        self.assertEqual(get_user_model().objects.values().get(pk=user.pk), saved_user)
        self.assertEqual(Session.objects.values().get(session_key=session.session_key), saved_session)
