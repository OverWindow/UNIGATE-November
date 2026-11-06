from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from importlib import import_module
from threading import Barrier
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db import IntegrityError, close_old_connections, connection, transaction
from django.db.migrations.executor import MigrationExecutor
from django.test import Client, TestCase, TransactionTestCase, override_settings
from django.utils import timezone

from surveys.learner import CATALOG
from surveys.models import SignupSurveyResponse

from .forms import SignupForm
from .models import RateLimit
from .rate_limits import check_limit, record_attempt
from .email_verification import make_verification_token


PASSWORD = "Korean!Study-6048"
FAST_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]


def signup_survey_input(**changes):
    return {"nationalityCode": "ID", "birthYear": 2000, "topikReasons": ["employment"],
            "topikReasonOther": "", "koreanStudyDuration": "1_to_2_years", "topikExperience": "none",
            "currentTopikLevel": None, "targetTopikLevel": 4, "privacyConsent": True,
            "privacyConsentVersion": CATALOG["signupConsentVersion"], **changes}


class AuthClientMixin:
    def csrf_client(self):
        client = Client(enforce_csrf_checks=True)
        token = client.get("/api/csrf/").json()["csrfToken"]
        return client, token

    def post(self, path, data, client=None, token=None):
        return (client or self.client).post(
            path, data, content_type="application/json",
            HTTP_X_CSRFTOKEN=token or self.token,
        )

    def payload(self, email="learner@example.invalid", **changes):
        return {"email": email, "nickname": "학습자", "password": PASSWORD,
                "password_confirm": PASSWORD,
                "language": "ko", "survey": signup_survey_input(),
                "verification_token": make_verification_token(email if isinstance(email, str) else ""), **changes}


@override_settings(PASSWORD_HASHERS=FAST_HASHERS)
class AccountApiTests(AuthClientMixin, TestCase):
    def setUp(self):
        self.client, self.token = self.csrf_client()

    def create_user(self, email="learner@example.invalid", **changes):
        user = get_user_model().objects.create_user(
            username="internal-username", email=email, password=PASSWORD, **changes
        )
        # Exercise legacy database values without the manager's normalization.
        get_user_model().objects.filter(pk=user.pk).update(email=email)
        user.email = email
        return user

    def test_signup_hashes_password_normalizes_fields_and_logs_in(self):
        response = self.post("/api/auth/signup/", self.payload("  Learner@Example.INVALID ", nickname=" 학습자 "))
        self.assertEqual(response.status_code, 201)
        user = get_user_model().objects.get()
        self.assertEqual(user.email, "learner@example.invalid")
        self.assertEqual(user.first_name, "학습자")
        self.assertTrue(user.username.startswith("u_"))
        self.assertTrue(user.check_password(PASSWORD))
        self.assertNotEqual(user.password, PASSWORD)
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)
        self.assertEqual(set(response.json()["user"]), {"id", "email", "nickname"})
        self.assertEqual(self.client.get("/api/auth/me/").json()["user"]["id"], user.pk)
        self.assertIn("private", response["Cache-Control"])
        self.assertIn("no-store", response["Cache-Control"])
        self.assertNotIn(PASSWORD, response.content.decode())

    def test_nickname_can_be_shared(self):
        self.create_user(first_name="학습자")
        response = self.post("/api/auth/signup/", self.payload("second@example.invalid"))
        self.assertEqual(response.status_code, 201)
        self.assertEqual(get_user_model().objects.filter(first_name="학습자").count(), 2)

    def test_duplicate_legacy_email_is_rejected_without_modifying_it(self):
        user = self.create_user(email=" Legacy@Example.INVALID ")
        response = self.post("/api/auth/signup/", self.payload("legacy@example.invalid"))
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["fields"]["email"], ["email_unavailable"])
        user.refresh_from_db()
        self.assertEqual(user.email, " Legacy@Example.INVALID ")

    def test_password_checks_and_confirmation(self):
        for changes, field in [({"password": "12345678", "password_confirm": "12345678"}, "password"),
                               ({"password_confirm": "different"}, "password_confirm"),
                               ({"nickname": " "}, "nickname"),
                               ({"nickname": "a" * 31}, "nickname")]:
            with self.subTest(field=field, changes=tuple(changes)):
                response = self.post("/api/auth/signup/", self.payload(**changes))
                self.assertEqual(response.status_code, 400)
                self.assertIn(field, response.json()["fields"])
        self.assertFalse(get_user_model().objects.exists())

    def test_privilege_fields_and_invalid_json_types_are_rejected(self):
        for data in [self.payload(is_staff=True), self.payload(is_superuser="true"),
                     self.payload(email=[]), [], None]:
            response = self.post("/api/auth/signup/", data)
            self.assertEqual(response.status_code, 400)
        self.assertFalse(get_user_model().objects.exists())

    def test_json_content_type_and_size_are_bounded(self):
        response = self.client.post("/api/auth/login/", "bad", content_type="text/plain", HTTP_X_CSRFTOKEN=self.token)
        self.assertEqual(response.status_code, 415)
        response = self.post("/api/auth/signup/", self.payload(nickname="a" * 17000))
        self.assertEqual(response.status_code, 413)
        response = self.client.post("/api/auth/login/", "{", content_type="application/json", HTTP_X_CSRFTOKEN=self.token)
        self.assertEqual(response.status_code, 400)

    def test_login_uses_email_including_legacy_case_and_spaces(self):
        user = self.create_user(email=" Legacy@Example.INVALID ", first_name="Name")
        response = self.post("/api/auth/login/", {"email": " LEGACY@example.invalid ", "password": PASSWORD})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["user"]["id"], user.pk)
        self.assertIn("csrfToken", response.json())

    def test_unknown_inactive_and_wrong_password_have_same_error(self):
        user = self.create_user(is_active=False)
        responses = [self.post("/api/auth/login/", {"email": "missing@example.invalid", "password": PASSWORD}),
                     self.post("/api/auth/login/", {"email": user.email, "password": PASSWORD})]
        user.is_active = True
        user.save(update_fields=["is_active"])
        responses.append(self.post("/api/auth/login/", {"email": user.email, "password": "wrong"}))
        for response in responses:
            self.assertEqual(response.status_code, 401)
            self.assertEqual(response.json(), {"error": "invalid_credentials"})

    def test_every_auth_post_requires_csrf(self):
        self.create_user()
        for path, data in [("signup", self.payload("new@example.invalid")),
                           ("login", {"email": "learner@example.invalid", "password": PASSWORD}),
                           ("logout", {})]:
            response = self.client.post(f"/api/auth/{path}/", data, content_type="application/json")
            self.assertEqual(response.status_code, 403)
            self.assertEqual(response.json(), {"error": "csrf_failed"})

    def test_csrf_rotates_session_restores_and_logout_ends_it(self):
        self.create_user()
        old_cookie = self.client.cookies["csrftoken"].value
        response = self.post("/api/auth/login/", {"email": "learner@example.invalid", "password": PASSWORD})
        self.assertNotEqual(self.client.cookies["csrftoken"].value, old_cookie)
        other = Client(enforce_csrf_checks=True)
        other.cookies = self.client.cookies.copy()
        self.assertEqual(other.get("/api/auth/me/").status_code, 200)
        self.assertEqual(self.post("/api/auth/logout/", {}).status_code, 403)
        self.assertEqual(self.post("/api/auth/logout/", {}, token=response.json()["csrfToken"]).status_code, 204)
        self.assertEqual(self.client.get("/api/auth/me/").status_code, 401)
        self.assertEqual(other.get("/api/auth/me/").status_code, 401)

    def test_login_limit_is_case_insensitive_and_expires(self):
        for _ in range(5):
            response = self.post("/api/auth/login/", {"email": "Missing@example.invalid", "password": "wrong"})
            self.assertEqual(response.status_code, 401)
        response = self.post("/api/auth/login/", {"email": "missing@EXAMPLE.INVALID", "password": "wrong"})
        self.assertEqual(response.status_code, 429)
        self.assertTrue(1 <= int(response["Retry-After"]) <= 300)
        RateLimit.objects.filter(scope="login").update(expires_at=timezone.now() - timedelta(seconds=1))
        self.assertEqual(self.post("/api/auth/login/", {"email": "missing@example.invalid", "password": "wrong"}).status_code, 401)

    def test_success_resets_failures_and_signup_has_separate_limit(self):
        self.create_user()
        for _ in range(4):
            self.post("/api/auth/login/", {"email": "learner@example.invalid", "password": "wrong"})
        response = self.post("/api/auth/login/", {"email": "learner@example.invalid", "password": PASSWORD})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(check_limit("login", "learner@example.invalid", 1), 0)
        self.post("/api/auth/logout/", {}, token=response.json()["csrfToken"])
        self.token = self.client.get("/api/csrf/").json()["csrfToken"]
        for _ in range(5):
            self.assertEqual(self.post("/api/auth/signup/", self.payload(password_confirm="wrong")).status_code, 400)
        self.assertEqual(self.post("/api/auth/signup/", self.payload()).status_code, 429)

    def test_public_get_and_method_restrictions(self):
        self.assertEqual(self.client.get("/api/auth/me/").status_code, 401)
        for path in ("login", "signup", "logout"):
            self.assertEqual(self.client.get(f"/api/auth/{path}/").status_code, 405)

    def test_existing_admin_username_login_remains_available(self):
        admin = get_user_model().objects.create_superuser(
            username="existing-admin", email="admin@example.invalid", password=PASSWORD,
        )
        response = self.client.post("/admin/login/", {
            "username": admin.username, "password": PASSWORD,
            "csrfmiddlewaretoken": self.token, "next": "/admin/",
        })
        self.assertRedirects(response, "/admin/")
        self.assertEqual(self.client.get("/api/auth/me/").json()["user"]["id"], admin.pk)
        token = self.client.get("/api/csrf/").json()["csrfToken"]
        self.assertEqual(self.post("/api/auth/logout/", {}, token=token).status_code, 204)
        self.assertRedirects(self.client.get("/admin/"), "/admin/login/?next=/admin/")

    @override_settings(SESSION_COOKIE_SECURE=True, CSRF_COOKIE_SECURE=True)
    def test_secure_session_cookie_and_untrusted_origin(self):
        user = self.create_user()
        response = self.post("/api/auth/login/", {"email": user.email, "password": PASSWORD})
        self.assertTrue(response.cookies["sessionid"]["httponly"])
        self.assertTrue(response.cookies["sessionid"]["secure"])
        self.assertEqual(response.cookies["sessionid"]["samesite"], "Lax")
        response = self.client.post("/api/auth/logout/", {}, content_type="application/json",
                                    HTTP_X_CSRFTOKEN=response.json()["csrfToken"], HTTP_ORIGIN="https://evil.example")
        self.assertEqual(response.status_code, 403)


@override_settings(PASSWORD_HASHERS=FAST_HASHERS)
class ConcurrentSignupTests(AuthClientMixin, TransactionTestCase):
    def test_concurrent_requests_cannot_create_two_accounts(self):
        barrier = Barrier(2, timeout=10)
        original = SignupForm.clean_email

        def clean_email(form):
            email = original(form)
            barrier.wait()
            return email

        def attempt(_):
            close_old_connections()
            try:
                client, token = self.csrf_client()
                return self.post("/api/auth/signup/", self.payload(), client, token).status_code
            finally:
                connection.close()

        with patch.object(SignupForm, "clean_email", clean_email), ThreadPoolExecutor(max_workers=2) as pool:
            statuses = sorted(pool.map(attempt, range(2)))
        self.assertEqual(statuses, [201, 400])
        self.assertEqual(get_user_model().objects.count(), 1)
        self.assertEqual(SignupSurveyResponse.objects.count(), 1)

    def test_database_counter_updates_are_atomic_across_connections(self):
        def attempt(limit):
            close_old_connections()
            try:
                return record_attempt("signup", f"thread-{limit}@example.invalid", limit, 600)
            finally:
                connection.close()

        for limit in (5, 100):
            with ThreadPoolExecutor(max_workers=8) as pool:
                results = list(pool.map(attempt, [limit] * 20))
            self.assertEqual(sum(result == 0 for result in results), min(limit, 20))
        self.assertEqual(sorted(RateLimit.objects.values_list("attempts", flat=True)), [6, 20])


class EmailIndexMigrationTests(TransactionTestCase):
    def test_index_reversible_without_new_tables_or_columns_and_conflicts_abort(self):
        before_tables = set(connection.introspection.table_names())
        with connection.cursor() as cursor:
            before_columns = [column.name for column in connection.introspection.get_table_description(cursor, "auth_user")]
        executor = MigrationExecutor(connection)
        executor.migrate([("accounts", None)])
        user_model = get_user_model()
        try:
            user_model.objects.create(username="one", email=" Dup@example.invalid ")
            user_model.objects.create(username="two", email="dup@EXAMPLE.INVALID")
            migration = import_module("migration.accounts.0001_initial")
            with connection.schema_editor() as editor:
                with self.assertRaisesMessage(RuntimeError, "Duplicate nonempty email"):
                    migration.check_email_conflicts(None, editor)
        finally:
            user_model.objects.all().delete()
            MigrationExecutor(connection).migrate([("accounts", "0002_rate_limit")])
        self.assertEqual(set(connection.introspection.table_names()), before_tables)
        with connection.cursor() as cursor:
            self.assertEqual([column.name for column in connection.introspection.get_table_description(cursor, "auth_user")], before_columns)
            indexes = connection.introspection.get_constraints(cursor, "auth_user")
            self.assertTrue(indexes["auth_user_email_ci_unique"]["unique"])
        user_model.objects.create(username="empty-one", email="")
        user_model.objects.create(username="empty-two", email=" ")
        user_model.objects.create(username="unique", email=" Dup@example.invalid ")
        with self.assertRaises(IntegrityError), transaction.atomic():
            user_model.objects.create(username="duplicate", email="dup@EXAMPLE.INVALID")
