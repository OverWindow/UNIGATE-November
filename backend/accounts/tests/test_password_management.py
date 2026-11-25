from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from time import time
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import PBKDF2PasswordHasher
from django.db import connection
from django.test import SimpleTestCase, TestCase, TransactionTestCase, override_settings

from ..email_delivery import EmailDeliveryError, send_password_email
from ..email_verification import make_verification_token
from ..models import GoogleIdentity, RateLimit
from .test_core import AuthClientMixin, FAST_HASHERS, PASSWORD


REQUEST = "/api/auth/password/request/"
CONFIRM = "/api/auth/password/confirm/"
ME = "/api/auth/me/"
NEW_PASSWORD = "New!Study-2847"
ACCEPTED = {"status": "request_accepted", "retryAfter": 60}


def confirmation(proof, password=NEW_PASSWORD):
    return {"token": proof, "new_password": password, "new_password_confirm": password}


@override_settings(PASSWORD_HASHERS=FAST_HASHERS)
class PasswordManagementTests(AuthClientMixin, TestCase):
    def setUp(self):
        self.client, self.token = self.csrf_client()
        self.user = get_user_model().objects.create_user(
            username="password-test", email="learner@example.invalid", password=PASSWORD,
        )
        self.deliver = self.enterContext(patch("accounts.passwords.send_password_email"))

    def reset_request(self, email=None, **kwargs):
        return self.post(REQUEST, {"purpose": "reset", "email": email or self.user.email, "language": "ko"}, **kwargs)

    def change_request(self, password=PASSWORD, **kwargs):
        return self.post(REQUEST, {"purpose": "change", "current_password": password, "language": "en"}, **kwargs)

    def reset_token(self):
        response = self.reset_request()
        self.assertEqual(response.status_code, 202)
        self.assertEqual(response.json(), ACCEPTED)
        return self.deliver.call_args.args[1]

    def test_reset_legacy_address_logs_out_other_sessions_and_requires_login(self):
        get_user_model().objects.filter(pk=self.user.pk).update(email=" Learner@Example.INVALID ")
        other, _ = self.csrf_client()
        other.force_login(self.user)
        proof = self.reset_token()
        self.deliver.assert_called_once_with(self.user.email, proof, "reset", "ko")
        self.assertEqual(other.get(ME).status_code, 200)
        response = self.post(CONFIRM, confirmation(proof))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"purpose": "reset"})
        self.assertIn("no-store", response["Cache-Control"])
        self.assertEqual(other.get(ME).status_code, 401)
        self.assertEqual(self.client.get(ME).status_code, 401)
        self.assertEqual(self.post(CONFIRM, confirmation(proof, "Another!Study-2847")).status_code, 400)
        login = "/api/auth/login/"
        self.assertEqual(self.post(login, {"email": self.user.email, "password": PASSWORD}).status_code, 401)
        self.assertEqual(self.post(login, {"email": self.user.email, "password": NEW_PASSWORD}).status_code, 200)

    def test_public_responses_hide_account_status_delivery_failure_and_recipient_cooldown(self):
        google_user = get_user_model().objects.create_user(username="google", email="google@example.invalid")
        GoogleIdentity.objects.create(user=google_user, google_sub="google-only")
        inactive = get_user_model().objects.create_user(
            username="inactive", email="inactive@example.invalid", password=PASSWORD, is_active=False,
        )
        self.deliver.side_effect = EmailDeliveryError(uncertain=True)
        for address in (self.user.email, google_user.email, inactive.email, "missing@example.invalid"):
            with self.subTest(address=address):
                for _ in range(2):
                    client, csrf = self.csrf_client()
                    response = self.reset_request(address, client=client, token=csrf)
                    self.assertEqual(response.status_code, 202)
                    self.assertEqual(response.json(), ACCEPTED)
        self.deliver.assert_called_once()
        self.user.refresh_from_db()
        google_user.refresh_from_db()
        self.assertTrue(self.user.check_password(PASSWORD))
        self.assertFalse(google_user.has_usable_password())

    def test_change_requires_current_password_and_cannot_redirect_email(self):
        self.assertEqual(self.change_request().status_code, 401)
        self.client.force_login(self.user)
        self.assertEqual(self.change_request("wrong").json(), {"error": "invalid_credentials"})
        bad_target = self.post(REQUEST, {"purpose": "change", "current_password": PASSWORD,
                                         "email": "different@example.invalid", "language": "en"})
        self.assertEqual(bad_target.status_code, 400)
        self.deliver.assert_not_called()
        self.deliver.side_effect = EmailDeliveryError()
        response = self.change_request()
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["error"], "email_delivery_unavailable")
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(PASSWORD))

    def test_requester_limit_and_change_resend_return_retry_after(self):
        self.reset_token()
        RateLimit.objects.filter(scope="password-reset-subject").update(attempts=100)
        limited = self.reset_request("another@example.invalid")
        self.assertEqual(limited.status_code, 429)
        self.assertGreater(int(limited["Retry-After"]), 0)
        self.client.force_login(self.user)
        self.assertEqual(self.change_request().status_code, 202)
        cooldown = self.change_request()
        self.assertEqual(cooldown.status_code, 429)
        self.assertTrue(1 <= int(cooldown["Retry-After"]) <= 60)
        self.assertEqual(self.deliver.call_count, 2)

    def test_change_only_works_in_requesting_session_and_keeps_it_signed_in(self):
        GoogleIdentity.objects.create(user=self.user, google_sub="linked")
        other, other_csrf = self.csrf_client()
        other.force_login(self.user)
        stranger = get_user_model().objects.create_user(username="stranger", email="stranger@example.invalid", password=PASSWORD)
        stranger_client, stranger_csrf = self.csrf_client()
        stranger_client.force_login(stranger)
        self.client.force_login(self.user)
        self.assertEqual(self.change_request().status_code, 202)
        proof = self.deliver.call_args.args[1]
        self.deliver.assert_called_once_with(self.user.email, proof, "change", "en")
        anonymous, csrf = self.csrf_client()
        self.assertEqual(self.post(CONFIRM, confirmation(proof), anonymous, csrf).status_code, 401)
        for label, client, csrf in (("same account", other, other_csrf), ("other account", stranger_client, stranger_csrf)):
            with self.subTest(session=label):
                response = self.post(CONFIRM, confirmation(proof), client, csrf)
                self.assertEqual(response.status_code, 403)
                self.assertEqual(response.json()["error"], "password_session_mismatch")
        response = self.post(CONFIRM, confirmation(proof))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"purpose": "change"})
        self.assertEqual(self.client.get(ME).json()["user"]["id"], self.user.pk)
        self.assertEqual(other.get(ME).status_code, 401)
        self.assertEqual(stranger_client.get(ME).status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(NEW_PASSWORD))
        self.assertTrue(GoogleIdentity.objects.filter(user=self.user, google_sub="linked").exists())

    @override_settings(PASSWORD_HASHERS=[*FAST_HASHERS, "django.contrib.auth.hashers.PBKDF2PasswordHasher"])
    def test_current_password_hash_upgrade_keeps_the_change_link_usable(self):
        self.user.password = PBKDF2PasswordHasher().encode(PASSWORD, "legacy-test-salt", iterations=10)
        self.user.save(update_fields=["password"])
        self.client.force_login(self.user)
        self.assertEqual(self.change_request().status_code, 202)
        self.user.refresh_from_db()
        self.assertTrue(self.user.password.startswith("md5$"))
        self.assertEqual(self.client.get(ME).status_code, 200)
        proof = self.deliver.call_args.args[1]
        self.assertEqual(self.post(CONFIRM, confirmation(proof)).status_code, 200)
        self.assertEqual(self.client.get(ME).status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(NEW_PASSWORD))

    def test_google_only_account_cannot_start_change(self):
        self.user.set_unusable_password()
        self.user.save(update_fields=["password"])
        GoogleIdentity.objects.create(user=self.user, google_sub="google-only")
        self.client.force_login(self.user)
        self.assertIs(self.client.get(ME).json()["user"]["hasUsablePassword"], False)
        response = self.change_request()
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"], "password_unavailable")
        self.deliver.assert_not_called()

    def test_expired_tampered_and_signup_tokens_cannot_confirm(self):
        proof = self.reset_token()
        with patch("django.core.signing.time.time", return_value=time() + 901):
            response = self.post(CONFIRM, confirmation(proof))
            self.assertEqual(response.status_code, 400)
            self.assertEqual(response.json()["error"], "password_link_expired")
        for value in (proof + "x", make_verification_token(self.user.email)):
            response = self.post(CONFIRM, confirmation(value))
            self.assertEqual(response.status_code, 400)
            self.assertEqual(response.json()["error"], "password_link_invalid")
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(PASSWORD))

    def test_confirmation_rechecks_email_active_status_and_password(self):
        proof = self.reset_token()
        for update, restore in (({"is_active": False}, {"is_active": True}),
                                ({"email": "updated@example.invalid"}, {"email": self.user.email})):
            get_user_model().objects.filter(pk=self.user.pk).update(**update)
            self.assertEqual(self.post(CONFIRM, confirmation(proof)).status_code, 400)
            get_user_model().objects.filter(pk=self.user.pk).update(**restore)
        self.user.set_password("ChangedElsewhere!456")
        self.user.save(update_fields=["password"])
        self.assertEqual(self.post(CONFIRM, confirmation(proof)).status_code, 400)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("ChangedElsewhere!456"))

    def test_invalid_new_password_can_be_corrected_on_same_link(self):
        proof = self.reset_token()
        for payload, field in [(confirmation(proof, "12345678"), "new_password"),
                               ({**confirmation(proof), "new_password_confirm": "different"}, "new_password_confirm")]:
            response = self.post(CONFIRM, payload)
            self.assertEqual(response.status_code, 400)
            self.assertIn(field, response.json()["fields"])
        self.assertEqual(self.post(CONFIRM, confirmation(proof)).status_code, 200)

    def test_both_endpoints_require_post_and_csrf(self):
        for path in (REQUEST, CONFIRM):
            self.assertEqual(self.client.get(path).status_code, 405)
            response = self.client.post(path, {}, content_type="application/json")
            self.assertEqual(response.status_code, 403)
            self.assertEqual(response.json(), {"error": "csrf_failed"})
        self.deliver.assert_not_called()


@override_settings(PASSWORD_HASHERS=FAST_HASHERS)
class ConcurrentPasswordConfirmationTests(AuthClientMixin, TransactionTestCase):
    def test_only_one_concurrent_password_update_can_consume_a_link(self):
        user = get_user_model().objects.create_user(username="race", email="race@example.invalid", password=PASSWORD)
        self.client, self.token = self.csrf_client()
        with patch("accounts.passwords.send_password_email") as deliver:
            response = self.post(REQUEST, {"purpose": "reset", "email": user.email, "language": "ko"})
        self.assertEqual(response.status_code, 202)
        proof = deliver.call_args.args[1]
        barrier = Barrier(2, timeout=10)

        def attempt(password):
            try:
                client, csrf = self.csrf_client()
                barrier.wait()
                return self.post(CONFIRM, confirmation(proof, password), client, csrf).status_code
            finally:
                connection.close()

        passwords = (NEW_PASSWORD, "Other!Study-9824")
        with ThreadPoolExecutor(max_workers=2) as pool:
            outcomes = list(pool.map(attempt, passwords))
        self.assertCountEqual(outcomes, [200, 400])
        user.refresh_from_db()
        self.assertTrue(user.check_password(passwords[outcomes.index(200)]))


@override_settings(TOPIQ_PUBLIC_URL="https://topiq.example.invalid")
class PasswordEmailTests(SimpleTestCase):
    @patch("accounts.email_delivery.send_transactional_email")
    def test_both_purposes_render_localized_fragment_links_without_passwords(self, deliver):
        for language, prefix in (("ko", ""), ("en", "/en"), ("id", "/id")):
            subjects = []
            for purpose in ("reset", "change"):
                with self.subTest(language=language, purpose=purpose):
                    send_password_email("learner@example.invalid", "test:link", purpose, language)
                    destination, content, tag = deliver.call_args.args
                    self.assertEqual(destination, "learner@example.invalid")
                    self.assertEqual(tag, f"topiq-password-{purpose}")
                    link = f"https://topiq.example.invalid{prefix}/password/confirm#token=test%3Alink"
                    self.assertIn(link, content["textContent"])
                    self.assertIn(link, content["htmlContent"])
                    self.assertIn(f'lang="{language}"', content["htmlContent"])
                    subjects.append(content["subject"])
            self.assertNotEqual(*subjects)
