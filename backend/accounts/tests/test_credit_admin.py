import uuid
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.db import DatabaseError
from django.test import Client, TestCase
from django.urls import reverse

from accounts.credits import grant
from accounts.models import CreditAccount, CreditTransaction


class BulkCreditAdminTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        users = get_user_model()
        cls.admin = users.objects.create_superuser(username="credit-admin")
        cls.first = users.objects.create_user(username="credit-first", email="batch-first@example.com", first_name="첫 사용자")
        cls.second = users.objects.create_user(username="credit-second", email="batch-second@example.com", first_name="둘째 사용자")
        cls.other = users.objects.create_user(username="credit-other", email="other@example.com")
        CreditAccount.objects.create(user=cls.first, balance=10, reserved=2)
        CreditAccount.objects.create(user=cls.second, balance=20)
        CreditAccount.objects.create(user=cls.other, balance=30)
        cls.viewer = users.objects.create_user(username="credit-viewer", is_staff=True)
        cls.viewer.user_permissions.add(Permission.objects.get(codename="view_creditaccount"))

    def setUp(self):
        self.client.force_login(self.admin)
        self.url = reverse("admin:accounts_creditaccount_changelist")
        self.selected = [self.first.pk, self.second.pk]

    def action_data(self, **changes):
        return {"action": "grant_selected", "_selected_action": self.selected, "select_across": "0", **changes}

    def preview(self, **changes):
        return self.client.post(self.url, self.action_data(
            preview="1", amount=25, reason="테스트 지급", grant_id=str(uuid.uuid4()), **changes,
        ))

    def confirmation_data(self, response):
        return self.action_data(confirmation=response.context["confirmation"])

    def balances(self):
        return list(CreditAccount.objects.order_by("user_id").values_list("balance", flat=True))

    def test_selection_preview_and_grant_preserve_unselected_balance_and_reservations(self):
        listing = self.client.get(self.url)
        self.assertContains(listing, 'name="_selected_action"')
        self.assertContains(listing, "선택한 사용자에게 크레딧 지급")
        response = self.client.post(self.url, self.action_data(index="0"))
        self.assertContains(response, "batch-first@example.com")
        self.assertContains(response, "batch-second@example.com")
        self.assertNotContains(response, "other@example.com")
        self.assertFalse(response.context["form"].is_bound)
        self.assertFalse(CreditTransaction.objects.exists())

        preview = self.preview()
        self.assertContains(preview, "지급 확정")
        self.assertEqual(preview.context["total"], 50)
        self.assertFalse(CreditTransaction.objects.exists())
        self.assertRedirects(self.client.post(self.url, self.confirmation_data(preview)), self.url)
        self.assertEqual(self.balances(), [35, 45, 30])
        self.assertEqual(CreditAccount.objects.get(user=self.first).reserved, 2)
        entries = CreditTransaction.objects.order_by("account_id")
        self.assertEqual(list(entries.values_list("account_id", "kind", "amount", "actor_id", "reason")), [
            (self.first.pk, "grant", 25, self.admin.pk, "테스트 지급"),
            (self.second.pk, "grant", 25, self.admin.pk, "테스트 지급"),
        ])
        self.assertEqual(list(entries.values_list("balance_after", "reserved_after")), [(35, 2), (45, 0)])

    def test_duplicate_confirmation_is_idempotent_and_uses_confirmed_amount(self):
        data = self.confirmation_data(self.preview())
        for _ in range(2):
            response = self.client.post(self.url, data | {"amount": 999, "reason": "changed"})
            self.assertEqual(response.status_code, 302)
        self.assertEqual(self.balances(), [35, 45, 30])
        self.assertEqual(CreditTransaction.objects.count(), 2)
        self.assertEqual(set(CreditTransaction.objects.values_list("reason", flat=True)), {"테스트 지급"})

    def test_failed_recipient_rolls_back_the_entire_batch(self):
        CreditAccount.objects.filter(user=self.second).update(balance=9_000_000_000_000)
        data = self.confirmation_data(self.preview())
        response = self.client.post(self.url, data)
        self.assertContains(response, "변경 사항은 모두 취소되었습니다")
        self.assertEqual(self.balances(), [10, 9_000_000_000_000, 30])
        self.assertFalse(CreditTransaction.objects.exists())
        CreditAccount.objects.filter(user=self.second).update(balance=20)
        self.assertEqual(self.client.post(self.url, data).status_code, 302)
        self.assertEqual(self.balances(), [35, 45, 30])

    def test_database_error_after_first_grant_rolls_back_the_entire_batch(self):
        data = self.confirmation_data(self.preview())

        def fail_second(**kwargs):
            if kwargs["user_id"] == self.second.pk:
                raise DatabaseError("synthetic failure")
            return grant(**kwargs)

        with patch("accounts.admin.grant", side_effect=fail_second):
            response = self.client.post(self.url, data)
        self.assertContains(response, "변경 사항은 모두 취소되었습니다")
        self.assertEqual(self.balances(), [10, 20, 30])
        self.assertFalse(CreditTransaction.objects.exists())

    def test_inactive_recipient_is_rejected_on_selection_and_confirmation(self):
        data = self.confirmation_data(self.preview())
        get_user_model().objects.filter(pk=self.second.pk).update(is_active=False)
        for request_data in (self.action_data(index="0"), data):
            with self.subTest(stage="confirmation" if "confirmation" in request_data else "selection"):
                response = self.client.post(self.url, request_data, follow=True)
                self.assertContains(response, "활성 사용자만 선택하여 지급해 주세요")
        self.assertEqual(self.balances(), [10, 20, 30])
        self.assertFalse(CreditTransaction.objects.exists())

    def test_confirmation_rejects_changed_selection_or_signature(self):
        data = self.confirmation_data(self.preview())
        for changed in (
            {"_selected_action": [self.first.pk]},
            {"_selected_action": self.selected + [self.other.pk]},
            {"confirmation": data["confirmation"] + "tampered"},
        ):
            with self.subTest(changed=list(changed)):
                response = self.client.post(self.url, data | changed, follow=True)
                self.assertContains(response, "대상을 다시 선택해 주세요")
                self.assertFalse(CreditTransaction.objects.exists())
        self.assertEqual(self.balances(), [10, 20, 30])

    def test_confirmation_cannot_be_used_by_another_admin(self):
        data = self.confirmation_data(self.preview())
        other_admin = get_user_model().objects.create_superuser(username="other-credit-admin")
        self.client.force_login(other_admin)
        response = self.client.post(self.url, data, follow=True)
        self.assertContains(response, "대상을 다시 선택해 주세요")
        self.assertFalse(CreditTransaction.objects.exists())

    def test_invalid_input_never_reaches_confirmation_or_changes_balances(self):
        for invalid in ({"amount": 0}, {"amount": -1}, {"amount": 1_000_001}, {"amount": "abc"},
                        {"reason": "   "}, {"grant_id": "invalid"}):
            with self.subTest(invalid=invalid):
                data = self.action_data(preview="1", amount=25, reason="테스트", grant_id=str(uuid.uuid4()))
                response = self.client.post(self.url, data | invalid)
                self.assertTrue(response.context["form"].errors)
                self.assertFalse(response.context["confirmation"])
                self.assertNotContains(response, "지급 확정")
        self.assertEqual(self.balances(), [10, 20, 30])
        self.assertFalse(CreditTransaction.objects.exists())

    def test_view_permission_does_not_allow_grants_and_grant_permission_is_sufficient(self):
        data = self.confirmation_data(self.preview())
        self.client.force_login(self.viewer)
        self.assertNotContains(self.client.get(self.url), 'name="_selected_action"')
        self.client.post(self.url, data)
        self.assertFalse(CreditTransaction.objects.exists())
        self.viewer.user_permissions.add(Permission.objects.get(codename="add_credittransaction"))
        preview = self.preview()
        self.assertEqual(self.client.post(self.url, self.confirmation_data(preview)).status_code, 302)
        self.assertEqual(self.balances(), [35, 45, 30])

    def test_csrf_and_empty_selection_cannot_grant(self):
        data = self.confirmation_data(self.preview())
        client = Client(enforce_csrf_checks=True)
        client.force_login(self.admin)
        self.assertEqual(client.post(self.url, data).status_code, 403)
        client.get(self.url)
        self.assertEqual(client.post(self.url, self.action_data(index="0") | {
            "csrfmiddlewaretoken": client.cookies["csrftoken"].value,
        }).status_code, 200)
        self.client.post(self.url, data | {"_selected_action": []})
        self.assertFalse(CreditTransaction.objects.exists())

    def test_select_across_search_results_freezes_recipients_before_confirmation(self):
        url = self.url + "?q=batch"
        selected = self.client.post(url, self.action_data(index="0", select_across="1", _selected_action=[self.first.pk]))
        self.assertEqual([account.pk for account in selected.context["accounts"]], self.selected)
        preview = self.client.post(url, self.action_data(
            preview="1", amount=25, reason="검색 지급", grant_id=str(selected.context["form"].initial["grant_id"]),
        ))
        self.assertContains(preview, 'name="select_across" value="0"')
        get_user_model().objects.filter(pk=self.other.pk).update(email="batch-new@example.com")
        self.assertEqual(self.client.post(url, self.confirmation_data(preview)).status_code, 302)
        self.assertEqual(self.balances(), [35, 45, 30])
