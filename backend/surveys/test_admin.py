from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.contrib.admin.models import LogEntry, CHANGE, DELETION
from django.test import Client, TestCase
from django.urls import reverse

from .models import SurveyResponse


class SurveyAdminTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_superuser(
            username="test-admin", password="Synthetic-admin-password-47!",
        )
        cls.viewer = get_user_model().objects.create_user(username="viewer", is_staff=True)
        cls.viewer.user_permissions.add(Permission.objects.get(codename="view_surveyresponse"))
        cls.regular = get_user_model().objects.create_user(username="regular")
        cls.response = SurveyResponse.objects.create(
            email="synthetic@example.com", age=20, education_type="universitas",
        )

    def setUp(self):
        self.list_url = reverse("admin:surveys_surveyresponse_changelist")
        self.change_url = reverse("admin:surveys_surveyresponse_change", args=[self.response.pk])
        self.delete_url = reverse("admin:surveys_surveyresponse_delete", args=[self.response.pk])

    def test_anonymous_and_nonstaff_cannot_access_responses(self):
        for user in (None, self.regular):
            if user:
                self.client.force_login(user)
            response = self.client.get(self.list_url)
            self.assertEqual(response.status_code, 302)
            self.assertIn("/admin/login/", response.url)
            self.assertNotIn(b"synthetic@example.com", response.content)

    def test_login_search_filter_and_csrf(self):
        client = Client(enforce_csrf_checks=True)
        login_url = reverse("admin:login")
        client.get(login_url)
        credentials = {"username": "test-admin", "password": "Synthetic-admin-password-47!",
                       "next": self.list_url}
        self.assertEqual(client.post(login_url, credentials).status_code, 403)
        credentials["csrfmiddlewaretoken"] = client.cookies["csrftoken"].value
        self.assertEqual(client.post(login_url, credentials).status_code, 302)
        result = client.get(self.list_url, {"q": "synthetic@example.com"})
        self.assertContains(result, "synthetic@example.com")
        self.assertEqual(client.get(self.list_url, {"education_type__exact": "other"})
                         .context["cl"].result_count, 0)
        self.assertEqual(client.post(self.delete_url, {"post": "yes"}).status_code, 403)
        self.assertTrue(SurveyResponse.objects.filter(pk=self.response.pk).exists())

    def test_view_permission_does_not_allow_edit_or_delete(self):
        self.client.force_login(self.viewer)
        self.assertEqual(self.client.get(self.list_url).status_code, 200)
        self.assertEqual(self.client.post(self.change_url, {}).status_code, 403)
        self.assertEqual(self.client.post(self.delete_url, {"post": "yes"}).status_code, 403)
        self.response.refresh_from_db()
        self.assertEqual(self.response.age, 20)

    def test_admin_edit_validation_delete_and_audit(self):
        self.client.force_login(self.admin)
        original_created = self.response.created_at
        values = {"email": "synthetic@example.com", "age": 121,
                  "education_type": "universitas", "desired_university": "Test University"}
        self.assertEqual(self.client.post(self.change_url, values).status_code, 200)
        self.response.refresh_from_db()
        self.assertEqual(self.response.age, 20)
        values["age"] = 21
        self.assertEqual(self.client.post(self.change_url, values).status_code, 302)
        self.response.refresh_from_db()
        self.assertEqual(self.response.age, 21)
        self.assertEqual(self.response.created_at, original_created)
        self.assertTrue(LogEntry.objects.filter(action_flag=CHANGE, object_id=str(self.response.pk)).exists())
        self.assertEqual(self.client.get(self.delete_url).status_code, 200)
        self.assertTrue(SurveyResponse.objects.filter(pk=self.response.pk).exists())
        self.assertEqual(self.client.post(self.delete_url, {"post": "yes"}).status_code, 302)
        self.assertFalse(SurveyResponse.objects.filter(pk=self.response.pk).exists())
        self.assertTrue(LogEntry.objects.filter(action_flag=DELETION, object_id=str(self.response.pk)).exists())
