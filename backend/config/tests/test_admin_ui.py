from datetime import datetime, timedelta, timezone
from unittest.mock import patch
from urllib.parse import urlsplit
from uuid import uuid4
from zoneinfo import ZoneInfo

from django.contrib.auth import SESSION_KEY, get_user_model
from django.contrib.auth.models import Group, Permission
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils.html import escape

from accounts.models import RateLimit
from pbt.models import Attempt, Exam, ExamAttemptFeedback
from writing.models import Evaluation


@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class AdminEmailLoginTests(TestCase):
    password = "Synthetic-admin-form-password42!"

    @classmethod
    def setUpTestData(cls):
        cls.staff = get_user_model().objects.create_user(
            username="operator", email="operator@example.invalid", password=cls.password, is_staff=True,
        )

    def test_registered_email_opens_dashboard_with_staff_session(self):
        # Valid emails can exceed the Django username field's 150-character limit.
        email = f"Operator@{'a' * 55}.{'b' * 55}.{'c' * 55}.invalid"
        get_user_model().objects.filter(pk=self.staff.pk).update(email=f" {email} ")
        index = reverse("admin:index")
        login_url = self.client.get(index).url
        page = self.client.get(login_url)
        self.assertContains(page, 'type="email"')
        self.assertIn('maxlength="254"', str(page.context["form"]["username"]))
        self.assertContains(page, "이메일")

        response = self.client.post(login_url, {"username": f" {email.upper()} ", "password": self.password})
        self.assertRedirects(response, index)
        self.assertEqual(self.client.session[SESSION_KEY], str(self.staff.pk))

    def test_usernames_and_accounts_without_admin_access_are_rejected(self):
        users = get_user_model().objects
        users.create_user(username="old-id@example.invalid", password=self.password, is_staff=True)
        users.create_user(username="member", email="member@example.invalid", password=self.password)
        users.create_user(
            username="inactive", email="inactive@example.invalid", password=self.password,
            is_staff=True, is_active=False,
        )
        login_url = reverse("admin:login")
        bad_password = self.client.post(login_url, {"username": self.staff.email, "password": "wrong"})
        self.assertEqual(bad_password.status_code, 200)
        generic_error = bad_password.context["form"].non_field_errors()
        self.assertTrue(generic_error)
        self.assertNotIn(SESSION_KEY, self.client.session)
        rejected_emails = (
            "old-id@example.invalid", "missing@example.invalid", "member@example.invalid", "inactive@example.invalid",
        )
        for email in rejected_emails:
            with self.subTest(email=email):
                response = self.client.post(login_url, {"username": email, "password": self.password})
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.context["form"].non_field_errors(), generic_error)
                self.assertNotIn(SESSION_KEY, self.client.session)

        response = self.client.post(login_url, {"username": self.staff.username, "password": self.password})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.context["form"].errors)
        self.assertNotIn(SESSION_KEY, self.client.session)

    def test_ambiguous_email_lookup_does_not_create_a_session(self):
        users = get_user_model().objects
        second = users.create_user(username="other", email="other@example.invalid", password=self.password)
        # The production index prevents storing duplicate normalized emails.
        matches = users.filter(pk__in=[self.staff.pk, second.pk])
        with patch("accounts.forms.users_for_email", return_value=matches):
            response = self.client.post(
                reverse("admin:login"), {"username": self.staff.email, "password": self.password},
            )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.context["form"].non_field_errors())
        self.assertNotIn(SESSION_KEY, self.client.session)


class AdminUiTests(TestCase):
    def test_restricted_staff_see_only_their_permitted_sidebar_links(self):
        cases = (
            ("auth", "view_user", "회원·크레딧", "auth_user_changelist"),
            ("pbt", "add_exam", "시험·피드백", "pbt_exam_add"),
            ("pbt", "view_attemptitem", "시험·피드백", "pbt_attemptitem_changelist"),
            ("surveys", "view_surveyresponse", "신청·설문", "surveys_surveyresponse_changelist"),
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
    def test_today_metrics_use_seoul_dates_and_link_to_matching_rows(self):
        start = datetime(2026, 11, 26, tzinfo=ZoneInfo("Asia/Seoul"))
        day = timedelta(days=1)
        tick = timedelta(microseconds=1)
        before = start - tick
        tomorrow = start + day
        users = get_user_model().objects
        staff = users.create_superuser(username="dashboard-admin", date_joined=start - 7 * day)
        for index, stamp in enumerate([before, start, tomorrow]):
            users.create_user(username=f"signup-{index}", date_joined=stamp)

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
            ("신규 회원", 1), ("모의고사 응시 완료", 3), ("쓰기 평가 요청", 1),
        ])
        self.assertIsNone(metrics[1]["url"])
        self.assertNotContains(response, "안내 PDF 신청 추이")

        for item, route in (
            (metrics[0], "auth_user_changelist"),
            (metrics[2], "writing_evaluation_changelist"),
        ):
            self.assertEqual(urlsplit(item["url"]).path, reverse(f"admin:{route}"))
            self.assertContains(response, f'href="{escape(item["url"])}"')
            listing = self.client.get(item["url"]).context["cl"]
            self.assertEqual(listing.result_count, item["value"])

    def test_dashboard_permissions_control_indicators_chart_and_shortcuts(self):
        cases = (
            ("view_surveyresponse", [], []),
            ("view_attemptitem", [], []),
            ("change_attemptitem", [], []),
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
                can_view_items = codename == "view_attemptitem"
                self.assertEqual(bool(context["response_week"]), can_view_items)
                self.assertEqual(
                    context["stored_counts"], [{"label": "문항별 응답 기록", "value": 0}] if can_view_items else [],
                )
                if not can_view_items:
                    listing = reverse("admin:pbt_attemptitem_changelist")
                    self.assertNotContains(response, f'href="{listing}"')
                    self.assertEqual(self.client.get(listing).status_code, 403)
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

    def test_item_chart_groups_latest_answer_by_seoul_day_and_keeps_all_rows_in_total(self):
        staff = get_user_model().objects.create_user(username="item-viewer", is_staff=True)
        staff.user_permissions.add(Permission.objects.get(codename="view_attemptitem"))
        self.client.force_login(staff)
        url = reverse("admin:index")
        label = "문항별 응답 기록"
        empty = self.client.get(url)
        self.assertEqual(empty.context["stored_counts"], [{"label": label, "value": 0}])
        self.assertEqual([entry["count"] for entry in empty.context["response_week"]], [0] * 7)

        start = datetime(2026, 11, 26, tzinfo=ZoneInfo("Asia/Seoul"))
        day = timedelta(days=1)
        tick = timedelta(microseconds=1)
        first = start - 6 * day
        tomorrow = start + day
        exam = Exam.objects.create(source_set_id=uuid4(), title="읽기", section="reading", display_order=1)
        attempt = Attempt.objects.create(
            exam=exam, user=staff, title=exam.title, section=exam.section, mode="practice", started_at=first - day,
        )
        attempt.items.create(position=1, source_item_id=uuid4(), correct_answer=1, snapshot={})
        partial = attempt.items.create(
            position=2, source_item_id=uuid4(), correct_answer=2, snapshot={"answerMode": "sentence_order"},
            selected_order=["가", None, None, None], answered_at=start - tick,
        )
        for position, stamp in enumerate([first - tick, first, start, tomorrow - tick, tomorrow], start=3):
            attempt.items.create(
                position=position, source_item_id=uuid4(), correct_answer=1, snapshot={},
                selected_option=1, answered_at=stamp,
            )

        with patch("django.utils.timezone.now", return_value=start + timedelta(minutes=30)):
            response = self.client.get(url)
            week = response.context["response_week"]
            self.assertEqual([entry["date"] for entry in week], [first.date() + n * day for n in range(7)])
            self.assertEqual([entry["count"] for entry in week], [1, 0, 0, 0, 0, 1, 2])
            self.assertContains(response, "<polyline")

            partial.selected_order = ["가", "나", None, None]
            partial.answered_at = start + timedelta(minutes=20)
            partial.save(update_fields=["selected_order", "answered_at"])
            response = self.client.get(url)

        self.assertEqual([entry["count"] for entry in response.context["response_week"]], [1, 0, 0, 0, 0, 0, 3])
        self.assertEqual(response.context["stored_counts"], [{"label": label, "value": 7}])
        self.assertNotContains(response, "인증 시도 제한 기록")


class AdminAttemptItemTests(TestCase):
    def test_list_and_detail_identify_the_respondent_from_the_current_member_account(self):
        users = get_user_model().objects
        viewer = users.create_user(username="item-viewer", is_staff=True)
        viewer.user_permissions.add(Permission.objects.get(codename="view_attemptitem"))
        self.client.force_login(viewer)
        member = users.create_user(username="respondent", email="previous@example.invalid")
        no_email = users.create_user(username="respondent-without-email")
        current_email = "current@example.invalid"
        recipient = "delivery-only@example.invalid"
        exam = Exam.objects.create(source_set_id=uuid4(), title="읽기", section="reading", display_order=1)
        now = datetime.now(timezone.utc)
        cases = []
        for user, expected in [(member, current_email), (no_email, "이메일 미등록"), (None, "비회원")]:
            attempt = Attempt.objects.create(
                exam=exam, user=user, guest_id=uuid4() if user is None else None, title=exam.title,
                section=exam.section, mode="practice", status="submitted", started_at=now, submitted_at=now,
            )
            item = attempt.items.create(position=1, source_item_id=uuid4(), correct_answer=1, snapshot={})
            if user is None:
                ExamAttemptFeedback.objects.create(
                    attempt=attempt, email=recipient, rating=5, language="ko", nationality_code="KR",
                    birth_year=2000, topik_reasons=[], target_topik_level=3,
                    survey_completed_at=now, privacy_consented_at=now,
                )
            cases.append((item, expected))
        users.filter(pk=member.pk).update(email=current_email)

        listing = self.client.get(reverse("admin:pbt_attemptitem_changelist"))
        self.assertContains(listing, "응답자 이메일")
        self.assertNotContains(listing, member.email)
        self.assertNotContains(listing, recipient)
        for item, expected in cases:
            with self.subTest(expected=expected):
                self.assertContains(listing, expected)
                detail = self.client.get(reverse("admin:pbt_attemptitem_change", args=[item.pk]))
                self.assertContains(detail, "응답자 이메일")
                self.assertContains(detail, expected)
                self.assertNotContains(detail, recipient)

    def test_list_shows_responses_supports_search_and_filter_and_denies_writes(self):
        staff = get_user_model().objects.create_superuser(username="item-admin")
        self.client.force_login(staff)
        attempts = []
        for exam_format, title in [("pbt", "종이 시험"), ("ibt", "컴퓨터 시험")]:
            exam = Exam.objects.create(
                source_set_id=uuid4(), exam_format=exam_format, title=title, section="reading", display_order=1,
            )
            attempts.append(Attempt.objects.create(
                exam=exam, exam_format=exam_format, user=staff, title=title, section="reading",
                mode="practice", started_at=datetime.now(timezone.utc),
            ))
        paper, computer = attempts
        answered = paper.items.create(position=1, source_item_id=uuid4(), correct_answer=1,
                                      selected_option=2, answered_at=paper.started_at, snapshot={})
        partial = paper.items.create(position=2, source_item_id=uuid4(), correct_answer=1,
                                     selected_order=["가", None, "다", None], answered_at=paper.started_at,
                                     snapshot={"answerMode": "sentence_order"})
        unanswered = computer.items.create(position=1, source_item_id=uuid4(), correct_answer=1, snapshot={})

        listing = reverse("admin:pbt_attemptitem_changelist")
        page = self.client.get(listing)
        self.assertContains(page, "2번")
        self.assertContains(page, "가 → — → 다 → —")
        self.assertContains(page, "미응답")
        self.assertCountEqual(page.context["cl"].result_list, [answered, partial, unanswered])
        search = self.client.get(listing, {"q": "컴퓨터"})
        self.assertCountEqual(search.context["cl"].result_list, [unanswered])
        filtered = self.client.get(listing, {"attempt__exam_format__exact": "pbt"})
        self.assertCountEqual(filtered.context["cl"].result_list, [answered, partial])

        for endpoint, args in [("add", []), ("change", [answered.pk]), ("delete", [answered.pk])]:
            with self.subTest(endpoint=endpoint):
                url = reverse(f"admin:pbt_attemptitem_{endpoint}", args=args)
                self.assertEqual(self.client.post(url, {"selected_option": 3, "post": "yes"}).status_code, 403)
