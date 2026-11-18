from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db import DatabaseError, IntegrityError, transaction
from django.test import TestCase, override_settings

from accounts.credits import welcome
from accounts.models import CreditAccount, CreditTransaction
from accounts.tests.test_core import AuthClientMixin, FAST_HASHERS, PASSWORD


@override_settings(PASSWORD_HASHERS=FAST_HASHERS)
class WelcomeCreditTests(AuthClientMixin, TestCase):
    def setUp(self):
        self.client, self.token = self.csrf_client()

    def test_signup_grants_once_and_login_or_wallet_reads_never_grant_again(self):
        result = self.post("/api/auth/signup/", self.payload())
        self.assertEqual(result.status_code, 201)
        user = get_user_model().objects.get()
        self.assertEqual(CreditAccount.objects.get(user=user).balance, 100)
        welcome(user.pk)
        self.post("/api/auth/logout/", {})
        self.post("/api/auth/login/", {"email": user.email, "password": PASSWORD})
        for _ in range(2):
            self.assertEqual(self.client.get("/api/credits/").json()["balance"], 100)
        self.assertEqual(CreditTransaction.objects.filter(kind="welcome").count(), 1)
        self.assertFalse(CreditTransaction.objects.exclude(kind="welcome").exists())

    def test_existing_user_first_login_and_wallet_creation_receive_no_bonus(self):
        user = get_user_model().objects.create_user(username="existing", email="existing@example.invalid", password=PASSWORD)
        self.assertEqual(self.post("/api/auth/login/", {"email": user.email, "password": PASSWORD}).status_code, 200)
        self.assertEqual(self.client.get("/api/credits/").json()["balance"], 0)
        self.assertFalse(CreditTransaction.objects.exists())

    def test_failed_signup_rolls_back_user_wallet_and_bonus(self):
        with patch("accounts.views.clear_login_failures", side_effect=IntegrityError("synthetic")):
            with self.assertLogs("accounts.views", level="ERROR"):
                self.assertEqual(self.post("/api/auth/signup/", self.payload()).status_code, 500)
        self.assertFalse(get_user_model().objects.exists())
        self.assertFalse(CreditAccount.objects.exists())
        self.assertFalse(CreditTransaction.objects.exists())

    def test_database_enforces_one_system_bonus_per_account(self):
        self.post("/api/auth/signup/", self.payload())
        wallet = CreditAccount.objects.get()
        with self.assertRaises(IntegrityError), transaction.atomic():
            CreditTransaction.objects.create(account=wallet, kind="welcome", amount=100, balance_after=200, reserved_after=0)

    def test_bonus_database_failure_returns_json_and_rolls_back_signup(self):
        with patch("accounts.credits.record", side_effect=DatabaseError("synthetic")):
            with self.assertLogs("accounts.views", level="ERROR"):
                result = self.post("/api/auth/signup/", self.payload())
        self.assertEqual(result.status_code, 503)
        self.assertEqual(result.json(), {"error": "server_error"})
        self.assertFalse(get_user_model().objects.exists())
        self.assertFalse(CreditAccount.objects.exists())
        self.assertFalse(CreditTransaction.objects.exists())
