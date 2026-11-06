from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from io import StringIO
from threading import Event
from time import monotonic, sleep
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
from .tests import AuthClientMixin, FAST_HASHERS, PASSWORD


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
        from surveys.models import SignupSurveyResponse
        response = self.post("/api/auth/signup/", self.payload())
        self.assertEqual(response.status_code, 503)
        self.assertFalse(get_user_model().objects.exists())
        self.assertFalse(SignupSurveyResponse.objects.exists())
        self.assertNotIn("sessionid", response.cookies)


@override_settings(PASSWORD_HASHERS=FAST_HASHERS)
class ConcurrentLoginTests(AuthClientMixin, TransactionTestCase):
    def setUp(self):
        get_user_model().objects.create_user(
            username="login-lock-fixture", email="learner@example.invalid", password=PASSWORD,
        )

    def overlapping_logins(self, first_password="wrong", second_email="LEARNER@example.invalid", timeout=False):
        from .views import authenticate as original_authenticate

        first_in_auth = Event()
        release_first = Event()
        second_in_auth = Event()
        second_ready = Event()
        application_name = "topiq-login-lock-regression"

        def authenticate(request, **credentials):
            if request.headers["X-Test-Login"] == "first":
                first_in_auth.set()
                if not release_first.wait(10):
                    raise TimeoutError("Login regression fixture was not released.")
            else:
                second_in_auth.set()
            return original_authenticate(request, **credentials)

        def attempt(marker, email, password):
            try:
                client, token = self.csrf_client()
                if marker == "second":
                    with connection.cursor() as cursor:
                        cursor.execute("SELECT set_config('application_name', %s, false)", [application_name])
                    second_ready.set()
                return client.post("/api/auth/login/", {"email": email, "password": password},
                                   content_type="application/json", HTTP_X_CSRFTOKEN=token,
                                   HTTP_X_TEST_LOGIN=marker)
            finally:
                connection.close()

        with patch("accounts.views.authenticate", side_effect=authenticate) as auth, ThreadPoolExecutor(max_workers=2) as pool:
            first = pool.submit(attempt, "first", "learner@example.invalid", first_password)
            waited = False
            try:
                self.assertTrue(first_in_auth.wait(5))
                second = pool.submit(attempt, "second", second_email, "wrong")
                self.assertTrue(second_ready.wait(5))
                deadline = monotonic() + 3
                while monotonic() < deadline:
                    if second_in_auth.is_set() or second.done():
                        break
                    with connection.cursor() as cursor:
                        cursor.execute("""
                            SELECT EXISTS (
                                SELECT 1 FROM pg_stat_activity
                                WHERE application_name = %s AND wait_event = 'advisory'
                            )
                        """, [application_name])
                        waited = cursor.fetchone()[0]
                    if waited:
                        break
                    sleep(0.01)
                before_release = auth.call_count
                if timeout:
                    second_response = second.result(timeout=5)
            finally:
                release_first.set()
            first_response = first.result(timeout=5)
            if not timeout:
                second_response = second.result(timeout=5)
        return first_response, second_response, before_release, waited

    def test_concurrent_login_cannot_check_a_sixth_password(self):
        for _ in range(4):
            record_attempt("login", "learner@example.invalid", 5, 300)
        first, second, checked, waited = self.overlapping_logins()
        self.assertEqual([first.status_code, second.status_code], [401, 429])
        self.assertEqual(checked, 1)
        self.assertTrue(waited)
        self.assertEqual(RateLimit.objects.get(scope="login").attempts, 5)

    def test_first_login_is_serialized_without_a_counter_row(self):
        self.assertFalse(RateLimit.objects.exists())
        first, second, checked, waited = self.overlapping_logins()
        self.assertEqual([first.status_code, second.status_code], [401, 401])
        self.assertEqual(checked, 1)
        self.assertTrue(waited)
        self.assertEqual(RateLimit.objects.get(scope="login").attempts, 2)

    def test_success_reset_keeps_a_later_failed_attempt(self):
        for _ in range(4):
            record_attempt("login", "learner@example.invalid", 5, 300)
        first, second, checked, waited = self.overlapping_logins(first_password=PASSWORD)
        self.assertEqual([first.status_code, second.status_code], [200, 401])
        self.assertEqual(checked, 1)
        self.assertTrue(waited)
        self.assertEqual(RateLimit.objects.get(scope="login").attempts, 1)

    def test_another_email_does_not_wait_for_the_login_lock(self):
        get_user_model().objects.create_user(
            username="other-login-fixture", email="other@example.invalid", password=PASSWORD,
        )
        first, second, checked, waited = self.overlapping_logins(second_email="other@example.invalid")
        self.assertEqual([first.status_code, second.status_code], [401, 401])
        self.assertEqual(checked, 2)
        self.assertFalse(waited)

    def test_lock_timeout_returns_503_without_creating_a_session(self):
        with self.assertLogs("accounts.rate_limits", level="ERROR") as logs:
            first, second, checked, waited = self.overlapping_logins(timeout=True)
        self.assertEqual([first.status_code, second.status_code], [401, 503])
        self.assertEqual(second["Retry-After"], "5")
        self.assertNotIn("sessionid", second.cookies)
        self.assertEqual(checked, 1)
        self.assertTrue(waited)
        self.assertNotIn("learner@example.invalid", " ".join(logs.output))


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
