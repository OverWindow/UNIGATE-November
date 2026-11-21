import json
import time
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone
from google.auth import crypt, jwt

from pbt.models import Attempt, Exam
from surveys.models import SignupSurveyResponse
from ..models import CreditAccount, CreditTransaction, GoogleIdentity
from .test_core import AuthClientMixin, FAST_HASHERS, PASSWORD, signup_survey_input


BASE = "/api/auth/google/"
CLIENT = "fixture.apps.googleusercontent.com"
EMAIL = "learner@example.invalid"


@override_settings(GOOGLE_CLIENT_ID=CLIENT, PASSWORD_HASHERS=FAST_HASHERS)
class GoogleLoginTests(AuthClientMixin, TestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        cls.signer = crypt.RSASigner(key, "fixture")
        public = key.public_key().public_bytes(serialization.Encoding.PEM,
                                               serialization.PublicFormat.SubjectPublicKeyInfo)
        cls.certs = SimpleNamespace(status=200, data=json.dumps({"fixture": public.decode()}).encode())

    def setUp(self):
        self.client, self.token = self.csrf_client()
        certs = patch("google.auth.transport.requests.Request.__call__", return_value=self.certs)
        self.fetch_certs = certs.start()
        self.addCleanup(certs.stop)

    def google(self, *, invalid_signature=False, **claims):
        start = self.post(BASE + "start/", {})
        self.assertEqual(start.json()["clientId"], CLIENT)
        now = int(time.time())
        payload = {"iss": "https://accounts.google.com", "aud": CLIENT, "exp": now + 600, "iat": now - 1,
                   "nonce": start.json()["nonce"], "sub": "fixture-sub", "email": EMAIL, "email_verified": True,
                   **claims}
        self.credential = jwt.encode(self.signer, payload).decode()
        if invalid_signature:
            body, signature = self.credential.rsplit(".", 1)
            first = "A" if signature[0] != "A" else "B"
            self.credential = f"{body}.{first}{signature[1:]}"
        return self.post(BASE, {"credential": self.credential})

    def signup(self, flow, **changes):
        return self.post(BASE + "signup/", {"flow": flow, "language": "ko", "nickname": "학습자",
                                           "survey": signup_survey_input(), **changes})

    def test_signup_atomic_award_and_return_by_sub_after_email_change(self):
        step = self.google(hd="example.invalid").json()
        self.assertEqual((step["step"], step["needsEmail"]), ("signup", False))
        flow = step["flow"]
        self.assertEqual(self.signup(flow, survey=signup_survey_input(privacyConsent=False)).status_code, 400)
        self.assertFalse(get_user_model().objects.exists())
        response = self.signup(flow)
        self.assertEqual(response.status_code, 201)
        user = GoogleIdentity.objects.get().user
        self.assertFalse(user.has_usable_password())
        self.assertTrue(SignupSurveyResponse.objects.filter(user=user).exists())
        self.assertEqual(CreditAccount.objects.get(user=user).balance, 100)
        self.assertEqual(self.client.get("/api/auth/me/").json()["user"]["id"], user.pk)
        self.token = response.json()["csrfToken"]
        self.assertEqual(self.signup(flow).status_code, 409)
        self.assertEqual(self.post("/api/auth/logout/", {}).status_code, 204)
        response = self.google(email="changed@example.invalid")
        self.assertEqual(response.json()["user"]["id"], user.pk)
        self.assertEqual(CreditTransaction.objects.filter(kind="welcome").count(), 1)

    @patch("accounts.views.send_verification_email")
    def test_external_email_requires_proof_for_same_browser_and_flow(self, send):
        step = self.google().json()
        self.assertTrue(step["needsEmail"])
        flow = step["flow"]
        self.assertEqual(self.signup(flow).status_code, 400)
        self.assertEqual(self.post("/api/auth/email/send/", {"email": EMAIL, "google_flow": flow}).status_code, 202)
        proof = send.call_args.args[1]
        other, csrf = self.csrf_client()
        self.assertEqual(self.post("/api/auth/email/verify/", {"token": proof}, other, csrf).status_code, 409)
        self.assertEqual(self.post("/api/auth/email/verify/", {"token": proof}).json()["googleFlow"], flow)
        self.assertEqual(self.post("/api/auth/signup/", self.payload(EMAIL, verification_token=proof)).status_code, 400)
        self.assertEqual(self.signup(flow, verification_token=proof).status_code, 201)

    def test_existing_account_requires_its_password_and_preserves_balance(self):
        user = get_user_model().objects.create_user(username="old", email=EMAIL, password=PASSWORD)
        CreditAccount.objects.create(user=user, balance=312)
        exam = Exam.objects.create(source_set_id=uuid4(), title="Fixture", section="reading", display_order=1)
        attempt = Attempt.objects.create(user=user, exam=exam, title=exam.title, section=exam.section, mode="practice",
                                         started_at=timezone.now(), submitted_at=timezone.now(), status="submitted", score=80)
        step = self.google().json()
        self.assertEqual(step["step"], "link")
        data = {"flow": step["flow"], "password": PASSWORD}
        self.assertEqual(self.post(BASE + "link/", {**data, "password": "incorrect"}).status_code, 401)
        self.assertFalse(GoogleIdentity.objects.exists())
        self.assertEqual(self.post(BASE + "link/", {**data, "user_id": "2"}).status_code, 400)
        self.assertEqual(self.post(BASE + "link/", data).json()["user"]["id"], user.pk)
        self.assertEqual(GoogleIdentity.objects.get().user_id, user.pk)
        self.assertEqual(self.client.get("/api/credits/").json()["balance"], 312)
        history = self.client.get("/api/pbt/attempts/").json()["attempts"]
        self.assertEqual([row["id"] for row in history], [str(attempt.pk)])
        self.assertFalse(CreditTransaction.objects.exists())
        self.assertTrue(user.check_password(PASSWORD))

    def test_conflicting_binding_and_disabled_account(self):
        user = get_user_model().objects.create_user(username="old", email=EMAIL, password=PASSWORD)
        step = self.google().json()
        GoogleIdentity.objects.create(user=user, google_sub="different-sub")
        self.assertEqual(self.post(BASE + "link/", {"flow": step["flow"], "password": PASSWORD}).status_code, 409)
        self.assertEqual(self.google().status_code, 409)
        user.is_active = False
        user.save(update_fields=["is_active"])
        self.assertEqual(self.google(sub="different-sub").status_code, 401)
        self.assertEqual(self.client.get("/api/auth/me/").status_code, 401)

    def test_link_and_password_login_share_failure_limit(self):
        get_user_model().objects.create_user(username="old", email=EMAIL, password=PASSWORD)
        flow = self.google().json()["flow"]
        for _ in range(5):
            self.post(BASE + "link/", {"flow": flow, "password": "incorrect"})
        self.assertEqual(self.post("/api/auth/login/", {"email": EMAIL, "password": PASSWORD}).status_code, 429)
        self.assertFalse(GoogleIdentity.objects.exists())

    def test_token_validation_nonce_replay_and_expiry(self):
        self.assertEqual(self.google(invalid_signature=True).status_code, 401)
        for changes in ({"aud": "other-client"}, {"iss": "wrong-issuer"}, {"exp": 1}, {"nonce": "unrelated"}):
            with self.subTest(claims=changes):
                self.assertEqual(self.google(**changes).status_code, 401)
        step = self.google().json()
        self.assertEqual(self.post(BASE, {"credential": self.credential}).status_code, 409)
        session = self.client.session
        pending = session["google_pending"]
        pending["expires_at"] = 0
        session["google_pending"] = pending
        session.save()
        self.assertEqual(self.signup(step["flow"]).status_code, 409)
        self.assertFalse(GoogleIdentity.objects.exists())

    def test_concurrent_signup_winner_and_loser_share_no_partial_records(self):
        # Two independently verified sessions reach the final POST for the same Google identity.
        first = self.google(hd="example.invalid").json()
        first_client, first_token = self.client, self.token
        self.client, self.token = self.csrf_client()
        second = self.google(hd="example.invalid").json()
        self.assertEqual(self.signup(second["flow"]).status_code, 201)
        self.client, self.token = first_client, first_token
        self.assertEqual(self.signup(first["flow"]).status_code, 409)
        self.assertEqual(get_user_model().objects.count(), 1)
        self.assertEqual(CreditTransaction.objects.filter(kind="welcome").count(), 1)

    def test_endpoints_require_csrf_and_disabled_client_is_optional(self):
        for path in (BASE, BASE + "start/", BASE + "link/", BASE + "signup/"):
            self.assertEqual(self.client.post(path, {}, content_type="application/json").status_code, 403)
        with override_settings(GOOGLE_CLIENT_ID=""):
            self.assertEqual(self.post(BASE + "start/", {}).json(), {"enabled": False})
