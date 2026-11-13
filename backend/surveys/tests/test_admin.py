import codecs
import csv
from datetime import datetime, timezone as dt_timezone
import io
from unittest.mock import patch
from urllib.parse import urlencode

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.contrib.admin.models import LogEntry, CHANGE, DELETION
from django.test import Client, TestCase
from django.urls import reverse
from django.utils.html import escape

from ..models import SurveyResponse


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
        self.export_url = reverse("admin:surveys_surveyresponse_export_csv")
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

    def csv_rows(self, response):
        self.assertEqual(response.status_code, 200)
        return list(csv.reader(io.StringIO(response.content.decode("utf-8-sig"), newline="")))

    def test_csv_download_requires_active_staff_with_survey_permission(self):
        staff = get_user_model().objects.create_user(username="staff-without-permission", is_staff=True)
        inactive = get_user_model().objects.create_user(username="inactive", is_staff=True, is_active=False)
        for user, status in ((None, 302), (self.regular, 302), (staff, 403), (inactive, 302)):
            with self.subTest(user=user):
                self.client.logout()
                if user:
                    self.client.force_login(user)
                response = self.client.get(self.export_url)
                self.assertEqual(response.status_code, status)
                self.assertNotIn(b"synthetic@example.com", response.content)
                if status == 302:
                    self.assertIn("/admin/login/", response.url)

        editor = get_user_model().objects.create_user(username="editor", is_staff=True)
        editor.user_permissions.add(Permission.objects.get(codename="change_surveyresponse"))
        for user in (self.admin, self.viewer, editor):
            with self.subTest(user=user):
                self.client.force_login(user)
                self.assertEqual(len(self.csv_rows(self.client.get(self.export_url))), 2)

    def test_csv_button_preserves_search_filters_and_default_admin_tools(self):
        params = {"q": '서울 & "국제"', "education_type__exact": "universitas"}
        for user in (self.admin, self.viewer):
            with self.subTest(user=user):
                self.client.force_login(user)
                response = self.client.get(self.list_url, params)
                link = f'href="{self.export_url}?{escape(urlencode(params))}"'
                self.assertContains(response, link)
                self.assertContains(response, "CSV 다운로드")
                if user == self.admin:
                    self.assertContains(response, reverse("admin:surveys_surveyresponse_add"))

    def test_csv_format_filename_and_database_are_preserved(self):
        timestamp = datetime(2026, 10, 30, 18, 4, 5, 123456, tzinfo=dt_timezone.utc)
        SurveyResponse.objects.filter(pk=self.response.pk).update(created_at=timestamp)
        quoted = SurveyResponse.objects.create(
            email="+csv@example.com", age=21, education_type="other",
            desired_university='서울대학교, "국제학부"\n한국어 과정', created_at=timestamp,
        )
        formula = SurveyResponse.objects.create(
            email="formula@example.com", age=22, education_type="universitas",
            desired_university="=1+1", created_at=timestamp,
        )
        before = list(SurveyResponse.objects.order_by("id").values())
        self.client.force_login(self.viewer)
        with patch("surveys.admin.timezone.now", return_value=timestamp):
            response = self.client.get(self.export_url)
        self.assertEqual(response["Content-Type"], "text/csv; charset=utf-8")
        self.assertEqual(response["Content-Disposition"],
                         'attachment; filename="survey_responses_20261031_030405_123456.csv"')
        self.assertIn("no-store", response["Cache-Control"])
        self.assertTrue(response.content.startswith(codecs.BOM_UTF8))
        self.assertFalse(response.content[len(codecs.BOM_UTF8):].startswith(codecs.BOM_UTF8))
        self.assertEqual(self.csv_rows(response), [
            ["id", "email", "age", "education_type", "desired_university", "created_at"],
            [str(self.response.pk), "synthetic@example.com", "20", "universitas", "",
             "2026-10-31T03:04:05.123456+09:00"],
            [str(quoted.pk), "'+csv@example.com", "21", "other", '서울대학교, "국제학부"\n한국어 과정',
             "2026-10-31T03:04:05.123456+09:00"],
            [str(formula.pk), "formula@example.com", "22", "universitas", "'=1+1",
             "2026-10-31T03:04:05.123456+09:00"],
        ])
        self.assertEqual(list(SurveyResponse.objects.order_by("id").values()), before)

    def test_csv_exports_all_matching_pages_with_search_education_and_date_filters(self):
        timestamp = datetime(2026, 10, 30, 18, tzinfo=dt_timezone.utc)
        matched = SurveyResponse.objects.bulk_create([
            SurveyResponse(email="matched@example.com", age=20, education_type="universitas",
                           desired_university="테스트 대학교", created_at=timestamp)
            for _ in range(55)
        ])
        SurveyResponse.objects.create(email="excluded@example.com", age=20, education_type="other",
                                      desired_university="테스트 대학교", created_at=timestamp)
        SurveyResponse.objects.create(email="old@example.com", age=20, education_type="universitas",
                                      desired_university="테스트 대학교",
                                      created_at=datetime(2026, 10, 1, tzinfo=dt_timezone.utc))
        params = {"q": "테스트", "education_type__exact": "universitas",
                  "created_at__gte": "2026-10-31T00:00:00+09:00",
                  "created_at__lt": "2026-11-01T00:00:00+09:00", "p": 2, "o": "-1"}
        self.client.force_login(self.viewer)
        listing = self.client.get(self.list_url, params)
        self.assertEqual(listing.context["cl"].result_count, 55)
        self.assertEqual(len(listing.context["cl"].result_list), 5)
        rows = self.csv_rows(self.client.get(self.export_url, params))
        self.assertEqual([int(row[0]) for row in rows[1:]], [row.pk for row in matched])
        params.update(p=999, all="1")
        self.assertEqual(self.csv_rows(self.client.get(self.export_url, params)), rows)

    def test_csv_empty_results_have_only_header(self):
        self.client.force_login(self.viewer)
        rows = self.csv_rows(self.client.get(self.export_url, {"q": "no-matching-response"}))
        self.assertEqual(rows, [["id", "email", "age", "education_type", "desired_university", "created_at"]])

    def test_csv_invalid_filters_do_not_export_unfiltered_data(self):
        self.client.force_login(self.viewer)
        for params in ({"unknown_field": "value"}, {"created_at__gte": "invalid-date"}):
            with self.subTest(params=params):
                response = self.client.get(self.export_url, params)
                self.assertEqual(response.status_code, 400)
                self.assertNotIn("Content-Disposition", response)
                self.assertNotIn(b"synthetic@example.com", response.content)

    def test_csv_respects_admin_queryset_restrictions(self):
        SurveyResponse.objects.create(email="excluded@example.com", age=20, education_type="other")
        self.client.force_login(self.viewer)
        with patch("surveys.admin.SurveyResponseAdmin.get_queryset",
                   return_value=SurveyResponse.objects.filter(pk=self.response.pk)):
            rows = self.csv_rows(self.client.get(self.export_url))
        self.assertEqual([row[0] for row in rows[1:]], [str(self.response.pk)])

    def test_csv_is_get_only_and_preserves_csrf_protection(self):
        client = Client(enforce_csrf_checks=True)
        client.force_login(self.viewer)
        client.get(self.list_url)
        self.assertEqual(client.post(self.export_url).status_code, 403)
        response = client.post(self.export_url, {"csrfmiddlewaretoken": client.cookies["csrftoken"].value})
        self.assertEqual(response.status_code, 405)
        self.assertEqual(response["Allow"], "GET")
        self.assertEqual(SurveyResponse.objects.count(), 1)
