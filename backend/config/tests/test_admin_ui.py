from datetime import datetime, timedelta, timezone
from unittest.mock import patch
from urllib.parse import urlsplit
from uuid import uuid4
from zoneinfo import ZoneInfo

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group, Permission
from django.test import TestCase
from django.urls import reverse
from django.utils.html import escape

from accounts.models import RateLimit
from pbt.models import Attempt, Exam
from surveys.models import SurveyResponse
from writing.models import Evaluation


class AdminUiTests(TestCase):
    def test_restricted_staff_see_only_their_permitted_sidebar_links(self):
        cases = (
            ("auth", "view_user", "회원·크레딧", "auth_user_changelist"),
            ("pbt", "add_exam", "시험·피드백", "pbt_exam_add"),
        )
        for app, codename, heading, route in cases:
            with self.subTest(permission=codename):
                staff = get_user_model().objects.create_user(username=codename, is_staff=True)
                permission = Permission.objects.get(content_type__app_label=app, codename=codename)
                staff.user_permissions.add(permission)
                self.client.force_login(staff)

                response = self.client.get(reverse("admin:index"))
                target = reverse(f"admin:{route}")
                self.assertContains(response, f'href="{target}"')
                sidebar = response.context["sidebar_navigation"]
                self.assertEqual([group["title"] for group in sidebar], [heading])
                self.assertEqual([item["link"] for item in sidebar[0]["items"]], [target])
                self.assertEqual(self.client.get(target).status_code, 200)

    def test_group_add_form_saves_assigned_permissions(self):
        self.client.force_login(get_user_model().objects.create_superuser(username="group-admin"))
        permission = Permission.objects.get(content_type__app_label="pbt", codename="view_exam")
        url = reverse("admin:auth_group_add")
        self.assertContains(self.client.get(url), 'name="permissions"')
        response = self.client.post(url, {"name": "시험 조회", "permissions": [permission.pk]})
        self.assertEqual(response.status_code, 302)
        self.assertTrue(Group.objects.get(name="시험 조회").permissions.filter(pk=permission.pk).exists())

    def test_user_password_can_be_enabled_and_disabled_from_admin_forms(self):
        users = get_user_model().objects
        self.client.force_login(users.create_superuser(username="user-admin"))
        add_url = reverse("admin:auth_user_add")
        self.assertContains(self.client.get(add_url), 'name="usable_password"')
        response = self.client.post(add_url, {"username": "operator", "usable_password": "false"})
        self.assertEqual(response.status_code, 302)
        user = users.get(username="operator")
        self.assertFalse(user.has_usable_password())

        password_url = reverse("admin:auth_user_password_change", args=[user.pk])
        password = "Synthetic-form-password42!"
        response = self.client.post(password_url, {
            "password1": password, "password2": password, "set-password": "1",
        })
        self.assertEqual(response.status_code, 302)
        user.refresh_from_db()
        self.assertTrue(user.check_password(password))

        page = self.client.get(password_url)
        self.assertContains(page, 'name="usable_password"')
        self.assertContains(page, 'name="unset-password"')
        response = self.client.post(password_url, {"usable_password": "false", "unset-password": "1"})
        self.assertEqual(response.status_code, 302)
        user.refresh_from_db()
        self.assertFalse(user.has_usable_password())


class AdminDashboardTests(TestCase):
    def test_today_and_week_use_seoul_dates_and_link_to_matching_rows(self):
        start = datetime(2026, 11, 26, tzinfo=ZoneInfo("Asia/Seoul"))
        day = timedelta(days=1)
        tick = timedelta(microseconds=1)
        before = start - tick
        tomorrow = start + day
        users = get_user_model().objects
        staff = users.create_superuser(username="dashboard-admin", date_joined=start - 7 * day)
        for index, stamp in enumerate([before, start, tomorrow]):
            users.create_user(username=f"signup-{index}", date_joined=stamp)

        surveys = [
            SurveyResponse.objects.create(email="test@example.com", age=20, education_type="other", created_at=stamp)
            for stamp in [start - 7 * day, start - 6 * day, before, start, tomorrow - tick, tomorrow]
        ]
        exam = Exam.objects.create(source_set_id=uuid4(), title="읽기", section="reading", display_order=1)
        for stamp in [before, start, start + timedelta(minutes=1), start + timedelta(minutes=2), tomorrow, None]:
            Attempt.objects.create(
                exam=exam, user=staff, title=exam.title, section=exam.section, mode="practice",
                started_at=before, status="submitted" if stamp else "in_progress", submitted_at=stamp,
            )
        for stamp in [before, start, tomorrow]:
            evaluation = Evaluation.objects.create(
                user=staff, set_id=uuid4(), type_slot=51, question_snapshot={}, answer={},
                credit_cost=0, status="processing", expires_at=tomorrow,
            )
            Evaluation.objects.filter(pk=evaluation.pk).update(created_at=stamp)

        self.client.force_login(staff)
        # The UTC date is still the previous day at 00:30 in Seoul.
        now = (start + timedelta(minutes=30)).astimezone(timezone.utc)
        with patch("django.utils.timezone.now", return_value=now):
            response = self.client.get(reverse("admin:index"))
        self.assertEqual(response.context["dashboard_date"], start.date())
        metrics = response.context["dashboard_metrics"]
        self.assertEqual([(item["label"], item["value"]) for item in metrics], [
            ("PDF 신청", 2), ("신규 회원", 1), ("모의고사 응시 완료", 3), ("쓰기 평가 요청", 1),
        ])
        self.assertIsNone(metrics[2]["url"])
        week = response.context["pdf_week"]
        expected_dates = [start.date() - n * day for n in range(6, -1, -1)]
        self.assertEqual([entry["date"] for entry in week], expected_dates)
        self.assertEqual([entry["count"] for entry in week], [1, 0, 0, 0, 0, 1, 2])

        for item, route in (
            (metrics[0], "surveys_surveyresponse_changelist"),
            (metrics[1], "auth_user_changelist"),
            (metrics[3], "writing_evaluation_changelist"),
        ):
            self.assertEqual(urlsplit(item["url"]).path, reverse(f"admin:{route}"))
            self.assertContains(response, f'href="{escape(item["url"])}"')
            listing = self.client.get(item["url"]).context["cl"]
            self.assertEqual(listing.result_count, item["value"])
            if item["label"] == "PDF 신청":
                self.assertCountEqual(listing.queryset, surveys[3:5])

    def test_dashboard_permissions_control_indicators_chart_and_shortcuts(self):
        cases = (
            ("view_surveyresponse", ["PDF 신청"], ["surveys_surveyresponse_changelist"]),
            ("view_attempt", ["모의고사 응시 완료"], []),
            ("add_credittransaction", [], ["accounts_creditaccount_grant"]),
            ("view_examattemptfeedback", [], ["pbt_examattemptfeedback_changelist"]),
            ("add_exam", [], []),
        )
        for codename, labels, shortcut_routes in cases:
            with self.subTest(permission=codename):
                staff = get_user_model().objects.create_user(username=codename, is_staff=True)
                staff.user_permissions.add(Permission.objects.get(codename=codename))
                self.client.force_login(staff)
                response = self.client.get(reverse("admin:index"))
                self.assertEqual(response.status_code, 200)
                context = response.context
                self.assertEqual([item["label"] for item in context["dashboard_metrics"]], labels)
                self.assertEqual(bool(context["pdf_week"]), codename == "view_surveyresponse")
                self.assertEqual(context["stored_counts"], [])
                self.assertEqual(
                    [link["url"] for link in context["dashboard_links"]],
                    [reverse(f"admin:{route}") for route in shortcut_routes],
                )

    def test_rate_limit_rows_include_expired_records_and_count_exact_expiry_as_expired(self):
        staff = get_user_model().objects.create_user(username="rate-viewer", is_staff=True)
        staff.user_permissions.add(Permission.objects.get(codename="view_ratelimit"))
        self.client.force_login(staff)
        url = reverse("admin:index")
        label = "인증 시도 제한 기록"
        empty = self.client.get(url)
        self.assertEqual(empty.context["stored_counts"], [
            {"label": label, "value": 0, "active": 0, "expired": 0},
        ])
        self.assertContains(empty, label)
        self.assertNotContains(empty, "문항별 응답 기록")

        now = datetime.now(timezone.utc)
        for index, expiry in enumerate([now - timedelta(days=5), now, now + timedelta(microseconds=1)]):
            RateLimit.objects.create(scope="login", key_hash=f"{index:064x}", attempts=7, expires_at=expiry)
        with patch("django.utils.timezone.now", return_value=now):
            counts = self.client.get(url).context["stored_counts"]
        self.assertEqual(counts, [{"label": label, "value": 3, "active": 1, "expired": 2}])

    def test_item_rows_include_partial_and_unanswered_questions_and_count_edits_once(self):
        staff = get_user_model().objects.create_user(username="item-viewer", is_staff=True)
        staff.user_permissions.add(Permission.objects.get(codename="view_attemptitem"))
        self.client.force_login(staff)
        url = reverse("admin:index")
        label = "문항별 응답 기록"
        self.assertEqual(self.client.get(url).context["stored_counts"], [{"label": label, "value": 0}])

        old = datetime.now(timezone.utc) - timedelta(days=10)
        exam = Exam.objects.create(source_set_id=uuid4(), title="읽기", section="reading", display_order=1)
        attempt = Attempt.objects.create(
            exam=exam, user=staff, title=exam.title, section=exam.section, mode="practice", started_at=old,
        )
        attempt.items.create(position=1, source_item_id=uuid4(), correct_answer=1, snapshot={})
        attempt.items.create(
            position=2, source_item_id=uuid4(), correct_answer=2, snapshot={"answerMode": "sentence_order"},
            selected_order=["가", None, None, None], answered_at=old,
        )
        edited = attempt.items.create(
            position=3, source_item_id=uuid4(), correct_answer=3, snapshot={}, selected_option=1, answered_at=old,
        )
        edited.selected_option = 3
        edited.save(update_fields=["selected_option"])

        response = self.client.get(url)
        self.assertEqual(response.context["stored_counts"], [{"label": label, "value": 3}])
        self.assertContains(response, label)
        self.assertNotContains(response, "인증 시도 제한 기록")
