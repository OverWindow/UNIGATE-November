import io
import json
from datetime import timedelta
from unittest.mock import patch
from urllib.error import HTTPError, URLError

from django.contrib.auth import get_user_model
from django.core import signing
from django.db import connection
from django.test import SimpleTestCase, TestCase, override_settings
from django.utils import timezone

from .email_delivery import EmailDeliveryError, build_verification_email, send_verification_email
from .email_verification import TOKEN_SALT, make_verification_token
from .models import RateLimit
from .tests import AuthClientMixin, FAST_HASHERS


@override_settings(PASSWORD_HASHERS=FAST_HASHERS)
class EmailVerificationApiTests(AuthClientMixin, TestCase):
    def setUp(self):
        self.client, self.token = self.csrf_client()

    @patch("accounts.views.send_verification_email")
    def test_send_verify_and_signup_without_temporary_user_or_schema_changes(self, deliver):
        tables = set(connection.introspection.table_names())
        response = self.post("/api/auth/email/send/", {
            "email": " Learner@Example.INVALID ", "language": "id", "next": "/?source=mail#faq",
        })
        self.assertEqual(response.status_code, 202)
        self.assertEqual(response.json(), {"status": "verification_sent", "retryAfter": 60})
        self.assertFalse(get_user_model().objects.exists())
        email, proof, language = deliver.call_args.args
        self.assertEqual((email, language), ("learner@example.invalid", "id"))
        self.assertNotIn(proof, response.content.decode())
        response = self.post("/api/auth/email/verify/", {"token": proof})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["email"], email)
        self.assertEqual(response.json()["language"], "id")
        self.assertEqual(response.json()["next"], "/?source=mail#faq")
        self.assertIn("no-store", response["Cache-Control"])
        self.assertFalse(get_user_model().objects.exists())
        response = self.post("/api/auth/signup/", self.payload(verification_token=proof))
        self.assertEqual(response.status_code, 201)
        self.assertEqual(self.client.get("/api/auth/me/").status_code, 200)
        self.assertEqual(set(connection.introspection.table_names()), tables)

    def test_signup_cannot_bypass_verification_or_change_verified_email(self):
        for proof in ("", "forged", make_verification_token("other@example.invalid")):
            response = self.post("/api/auth/signup/", self.payload(verification_token=proof))
            self.assertEqual(response.status_code, 400)
            self.assertIn("verification_token", response.json()["fields"])
        self.assertFalse(get_user_model().objects.exists())

    def test_expiration_wrong_purpose_and_tampering_are_rejected(self):
        with patch("accounts.email_verification.time.time", return_value=10000):
            proof = make_verification_token("learner@example.invalid")
        with patch("accounts.email_verification.time.time", return_value=10901):
            for path, data in (
                ("/api/auth/email/verify/", {"token": proof}),
                ("/api/auth/signup/", self.payload(verification_token=proof)),
            ):
                response = self.post(path, data)
                self.assertEqual(response.status_code, 400)
                self.assertIn("email_verification_expired", response.content.decode())
        for token in (proof + "x", signing.dumps({"email": "learner@example.invalid"}, salt="other-purpose")):
            self.assertEqual(self.post("/api/auth/email/verify/", {"token": token}).status_code, 400)
        self.assertFalse(get_user_model().objects.exists())

    @patch("accounts.views.send_verification_email")
    def test_resend_email_limit_expiration_and_peer_limit(self, deliver):
        for _ in range(5):
            response = self.post("/api/auth/email/send/", {"email": "learner@example.invalid"})
            self.assertEqual(response.status_code, 202)
            again = self.post("/api/auth/email/send/", {"email": "LEARNER@example.invalid"})
            self.assertEqual(again.status_code, 429)
            self.assertTrue(1 <= int(again["Retry-After"]) <= 60)
            RateLimit.objects.filter(scope="email-resend").update(expires_at=timezone.now() - timedelta(seconds=1))
        self.assertEqual(self.post("/api/auth/email/send/", {"email": "learner@example.invalid"}).status_code, 429)
        RateLimit.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
        self.assertEqual(self.post("/api/auth/email/send/", {"email": "learner@example.invalid"}).status_code, 202)
        RateLimit.objects.all().delete()
        from .rate_limits import record_attempt
        for _ in range(100):
            record_attempt("email-send-peer", "127.0.0.1", 100, 3600)
        response = self.post("/api/auth/email/send/", {"email": "new@example.invalid"})
        self.assertEqual(response.status_code, 429)
        self.assertEqual(deliver.call_count, 6)

    @patch("accounts.views.send_verification_email", side_effect=EmailDeliveryError())
    def test_delivery_failure_does_not_create_user_and_can_be_retried(self, deliver):
        response = self.post("/api/auth/email/send/", {"email": "learner@example.invalid"})
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["error"], "email_delivery_unavailable")
        self.assertFalse(get_user_model().objects.exists())
        deliver.side_effect = None
        RateLimit.objects.filter(scope="email-resend").update(expires_at=timezone.now() - timedelta(seconds=1))
        self.assertEqual(self.post("/api/auth/email/send/", {"email": "learner@example.invalid"}).status_code, 202)

    @patch("accounts.views.send_verification_email")
    def test_existing_accounts_and_inactive_accounts_are_unchanged(self, deliver):
        user = get_user_model().objects.create_user(username="existing", email="learner@example.invalid", is_active=False)
        response = self.post("/api/auth/email/send/", {"email": " LEARNER@example.invalid "})
        self.assertEqual(response.status_code, 400)
        deliver.assert_not_called()
        user.refresh_from_db()
        self.assertFalse(user.is_active)

    @patch("accounts.views.send_verification_email")
    def test_post_csrf_input_and_redirect_validation(self, deliver):
        for route in ("send", "verify"):
            path = f"/api/auth/email/{route}/"
            self.assertEqual(self.client.get(path).status_code, 405)
            self.assertEqual(self.client.post(path, {}, content_type="application/json").status_code, 403)
            self.assertEqual(self.post(path, {"extra": "field"}).status_code, 400)
        self.assertEqual(self.post("/api/auth/email/send/", {"email": "bad"}).status_code, 400)
        self.assertEqual(self.post("/api/auth/email/send/", {"email": "valid@example.invalid", "language": "xx"}).status_code, 400)
        for path in ("//evil.example", "/\\evil.example", "/verify-email#token=bad", "/login", "/\npath"):
            response = self.post("/api/auth/email/verify/", {"token": make_verification_token("valid@example.invalid", next_path=path)})
            self.assertEqual(response.json()["next"], "/")
        deliver.assert_not_called()


@override_settings(BREVO_API_KEY="synthetic-api-key", BREVO_SENDER_EMAIL="sender@example.invalid",
                   BREVO_SENDER_NAME="TOPIQ", TOPIQ_PUBLIC_URL="https://topiq.example.invalid")
class BrevoDeliveryTests(SimpleTestCase):
    @patch("accounts.email_delivery.urlopen")
    def test_brevo_payload_timeout_message_id_and_three_languages(self, send):
        send.return_value.__enter__.return_value.read.return_value = b'{"messageId":"synthetic-message"}'
        for language in ("ko", "en", "id"):
            send_verification_email("learner@example.invalid", "synthetic-token", language)
            request = send.call_args.args[0]
            body = json.loads(request.data)
            self.assertEqual(request.full_url, "https://api.brevo.com/v3/smtp/email")
            self.assertEqual(request.method, "POST")
            self.assertEqual(request.get_header("Api-key"), "synthetic-api-key")
            self.assertEqual(send.call_args.kwargs["timeout"], 10)
            self.assertEqual(body["to"], [{"email": "learner@example.invalid", "contactPixelTrackingConsent": False}])
            self.assertEqual(body["tags"], ["topiq-email-verification"])
            self.assertIn("/verify-email#token=synthetic-token", body["textContent"])
            self.assertNotIn("synthetic-api-key", body["htmlContent"])

    @patch("accounts.email_delivery.urlopen")
    def test_provider_failures_are_sanitized_and_not_retried(self, send):
        errors = [URLError("private-details"), TimeoutError("private-details"),
                  HTTPError("https://api.brevo.com", 429, "private-details", {}, io.BytesIO(b"private-details"))]
        for error in errors:
            send.reset_mock()
            send.side_effect = error
            with self.assertLogs("accounts.email_delivery", level="WARNING") as logs:
                with self.assertRaises(EmailDeliveryError):
                    send_verification_email("learner@example.invalid", "synthetic-token", "en")
            self.assertNotIn("private-details", "".join(logs.output))
            send.assert_called_once()
        send.side_effect = None
        for payload in (b"bad-json", b"{}", b'{"messageId":null}'):
            send.return_value.__enter__.return_value.read.return_value = payload
            with self.assertRaises(EmailDeliveryError):
                send_verification_email("learner@example.invalid", "synthetic-token", "en")

    @override_settings(BREVO_API_KEY="")
    @patch("accounts.email_delivery.urlopen")
    def test_unconfigured_provider_does_not_attempt_network(self, send):
        with self.assertRaises(EmailDeliveryError):
            send_verification_email("learner@example.invalid", "synthetic-token", "en")
        send.assert_not_called()

    def test_link_token_is_encoded_and_only_in_fragment(self):
        content = build_verification_email('token:with/<>&"', "ko")
        self.assertIn("#token=token%3Awith%2F%3C%3E%26%22", content["textContent"])
        self.assertNotIn('token:with/<>&"', content["htmlContent"])
