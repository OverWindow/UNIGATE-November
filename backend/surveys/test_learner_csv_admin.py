import codecs
import csv
import io
import uuid
from datetime import datetime, timezone as dt_timezone
from unittest.mock import patch
from urllib.parse import urlencode

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.test import Client, TestCase
from django.urls import reverse
from django.utils.html import escape

from pbt.admin import ExamAttemptFeedbackAdmin
from pbt.models import Attempt, Exam, ExamAttemptFeedback
from .admin import SignupSurveyResponseAdmin
from .learner_csv import EXAM_COLUMNS, SIGNUP_COLUMNS, write_exam_survey_csv, write_signup_survey_csv
from .models import SignupSurveyResponse


STAMP = datetime(2026, 11, 6, 18, 4, 5, tzinfo=dt_timezone.utc)


class LearnerCsvAdminTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        users = get_user_model()
        cls.signup_viewer = users.objects.create_user(username="signup-viewer", is_staff=True)
        cls.signup_viewer.user_permissions.add(Permission.objects.get(codename="view_signupsurveyresponse"))
        cls.exam_viewer = users.objects.create_user(username="exam-viewer", is_staff=True)
        cls.exam_viewer.user_permissions.add(Permission.objects.get(codename="view_examattemptfeedback"))
        cls.staff = users.objects.create_user(username="no-survey-permission", is_staff=True)
        cls.regular = users.objects.create_user(username="regular")
        cls.inactive = users.objects.create_user(username="inactive-staff", is_staff=True, is_active=False)
        cls.member = users.objects.create_user(username="csv-learner", email="+signup@example.invalid", first_name='=1,"학습자"\n다음 줄')
        answers = dict(language="ko", nationality_code="ID", birth_year=2000,
            topik_reasons=["university", "other"], topik_reason_other='  @SUM(1), "기타"\n두 번째 줄',
            korean_study_duration="1_to_2_years", topik_experience="none", current_topik_level=None,
            target_topik_level=4, survey_completed_at=STAMP, privacy_consented_at=STAMP)
        cls.signup = SignupSurveyResponse.objects.create(user=cls.member, **answers,
            survey_version="signup_survey_v1", privacy_consent_version="topiq_signup_privacy_v1")
        cls.feedbacks = []
        for exam_format, section, mode in (("pbt", "reading", "practice"), ("ibt", "listening", "timed")):
            exam = Exam.objects.create(source_set_id=uuid.uuid4(), title='=1,"모의고사"\n다음 줄',
                exam_format=exam_format, section=section, display_order=1)
            attempt = Attempt.objects.create(exam=exam, exam_format=exam_format, guest_id=uuid.uuid4(),
                title=exam.title, section=section, mode=mode, status="submitted", started_at=STAMP,
                submitted_at=STAMP, expires_at=STAMP if mode == "timed" else None, score=0 if exam_format == "pbt" else 88,
                answered_count=0 if exam_format == "pbt" else 29)
            cls.feedbacks.append(ExamAttemptFeedback.objects.create(attempt=attempt, email="+exam@example.invalid",
                rating=5, **answers, survey_version="post_exam_survey_v1", privacy_consent_version="topiq_exam_privacy_v1",
                email_status="accepted", result_token_hash="never-export-this-token-hash"))

    def exports(self):
        return (
            ("surveys_signupsurveyresponse", self.signup_viewer, SignupSurveyResponse, SignupSurveyResponseAdmin,
             SIGNUP_COLUMNS, "signup_survey_responses"),
            ("pbt_examattemptfeedback", self.exam_viewer, ExamAttemptFeedback, ExamAttemptFeedbackAdmin,
             EXAM_COLUMNS, "exam_attempt_feedback"),
        )

    def rows(self, response):
        self.assertEqual(response.status_code, 200)
        return list(csv.reader(io.StringIO(response.content.decode("utf-8-sig"), newline="")))

    def test_download_requires_active_staff_and_each_models_view_permission(self):
        for route, viewer, *_ in self.exports():
            other_viewer = self.exam_viewer if viewer == self.signup_viewer else self.signup_viewer
            url = reverse(f"admin:{route}_export_csv")
            for user, expected in ((None, 302), (self.regular, 302), (self.staff, 403), (self.inactive, 302),
                                    (other_viewer, 403), (viewer, 200)):
                with self.subTest(route=route, user=user):
                    self.client.logout()
                    if user:
                        self.client.force_login(user)
                    response = self.client.get(url)
                    self.assertEqual(response.status_code, expected)
                    if expected != 200:
                        self.assertNotIn(b"example.invalid", response.content)
                        self.assertNotIn("Content-Disposition", response)

    def test_readonly_list_shows_download_button_with_encoded_search_and_filters(self):
        for route, viewer, *_ in self.exports():
            self.client.force_login(viewer)
            params = {"q": '학습 & "시험"', "language__exact": "ko"}
            response = self.client.get(reverse(f"admin:{route}_changelist"), params)
            url = reverse(f"admin:{route}_export_csv")
            self.assertContains(response, f'href="{url}?{escape(urlencode(params))}"')
            self.assertContains(response, "CSV 다운로드")

    def test_export_format_values_bom_and_seoul_time_without_mutations_or_tokens(self):
        for route, viewer, model, _, columns, prefix in self.exports():
            self.client.force_login(viewer)
            before = list(model.objects.order_by("pk").values())
            with patch("surveys.admin_export.timezone.now", return_value=STAMP):
                response = self.client.get(reverse(f"admin:{route}_export_csv"))
            self.assertEqual(response["Content-Type"], "text/csv; charset=utf-8")
            self.assertEqual(response["Content-Disposition"], f'attachment; filename="{prefix}_20261107_030405_000000.csv"')
            self.assertIn("no-store", response["Cache-Control"])
            self.assertTrue(response.content.startswith(codecs.BOM_UTF8))
            self.assertFalse(response.content[len(codecs.BOM_UTF8):].startswith(codecs.BOM_UTF8))
            self.assertNotIn(b"never-export-this-token-hash", response.content)
            self.assertNotIn(b"result_token", response.content)
            rows = self.rows(response)
            self.assertEqual(rows[0], list(columns))
            for row in rows[1:]:
                self.assertEqual(len(row), len(columns))
                values = dict(zip(columns, row))
                self.assertEqual(values["TOPIK 응시 목적"], "한국 대학 입학; 기타")
                self.assertEqual(values["한국어 학습 기간"], "1~2년")
                self.assertEqual(values["TOPIK II 응시 경험"], "없음")
                self.assertEqual(values["현재 TOPIK 급수"], "")
                self.assertEqual(values["기타 응시 목적"], '\'  @SUM(1), "기타"\n두 번째 줄')
                self.assertEqual(values["설문 완료 시각"], "2026-11-07T03:04:05+09:00")
                self.assertEqual(values["동의 시각"], "2026-11-07T03:04:05+09:00")
                if model is SignupSurveyResponse:
                    self.assertEqual(values["이메일"], "'+signup@example.invalid")
                    self.assertEqual(values["닉네임"], '\'=1,"학습자"\n다음 줄')
                    self.assertNotIn("별점", columns)
                else:
                    self.assertEqual(values["이메일"], "'+exam@example.invalid")
                    self.assertEqual(values["시험명"], '\'=1,"모의고사"\n다음 줄')
                    self.assertEqual(values["점수"], "0" if values["시험 방식"] == "PBT" else "88")
                    self.assertEqual(values["푼 문제 수"], "0" if values["시험 방식"] == "PBT" else "29")
                    self.assertEqual(columns[columns.index("점수") + 1], "푼 문제 수")
                    self.assertEqual(values["영역"], "읽기" if values["시험 방식"] == "PBT" else "듣기")
                    self.assertEqual(values["모드"], "연습" if values["시험 방식"] == "PBT" else "실전")
                    self.assertEqual(values["별점"], "5")
                    self.assertEqual(values["메일 상태"], "발송업체 접수")
            self.assertEqual(list(model.objects.order_by("pk").values()), before)

    def test_all_matching_pages_export_and_admin_queryset_restrictions_are_kept(self):
        for route, viewer, model, model_admin, *_ in self.exports():
            self.client.force_login(viewer)
            export = reverse(f"admin:{route}_export_csv")
            params = {"q": "example.invalid", "language__exact": "ko", "survey_completed_at__gte": "2026-11-07T00:00:00+09:00",
                      "survey_completed_at__lt": "2026-11-08T00:00:00+09:00", "p": 999, "all": "1"}
            with patch.object(model_admin, "list_per_page", 1):
                rows = self.rows(self.client.get(export, params))
            self.assertEqual(len(rows) - 1, model.objects.count())
            params["language__exact"] = "en"
            self.assertEqual(len(self.rows(self.client.get(export, params))), 1)
            with patch.object(model_admin, "get_queryset", return_value=model.objects.none()):
                self.assertEqual(len(self.rows(self.client.get(export))), 1)
        self.client.force_login(self.exam_viewer)
        rows = self.rows(self.client.get(reverse("admin:pbt_examattemptfeedback_export_csv"),
            {"attempt__exam_format__exact": "ibt", "attempt__section__exact": "listening", "rating__exact": 5, "email_status__exact": "accepted"}))
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[1][2], "IBT")

    def test_empty_results_invalid_filters_and_get_only(self):
        for route, viewer, _, _, columns, *_ in self.exports():
            client = Client(enforce_csrf_checks=True)
            client.force_login(viewer)
            url = reverse(f"admin:{route}_export_csv")
            self.assertEqual(self.rows(client.get(url, {"q": "no-matching-response"})), [list(columns)])
            for params in ({"unknown_field": "bad"}, {"survey_completed_at__gte": "invalid-date"}):
                response = client.get(url, params)
                self.assertEqual(response.status_code, 400)
                self.assertNotIn("Content-Disposition", response)
            client.get(reverse(f"admin:{route}_changelist"))
            self.assertEqual(client.post(url, {}).status_code, 403)
            self.assertEqual(client.post(url, {"csrfmiddlewaretoken": client.cookies["csrftoken"].value}).status_code, 405)

    def test_related_data_uses_one_query_and_absent_dates_and_no_level_are_distinct(self):
        SignupSurveyResponse.objects.update(current_topik_level=0, topik_experience="once")
        Attempt.objects.update(submitted_at=None, score=None)
        for model, write in ((SignupSurveyResponse, write_signup_survey_csv), (ExamAttemptFeedback, write_exam_survey_csv)):
            stream = io.StringIO(newline="")
            with self.assertNumQueries(1):
                write(stream, model.objects.all())
            rows = list(csv.DictReader(io.StringIO(stream.getvalue(), newline="")))
            if model is SignupSurveyResponse:
                self.assertEqual(rows[0]["현재 TOPIK 급수"], "급수 없음")
            else:
                self.assertTrue(all(row["시험 제출 시각"] == row["점수"] == "" for row in rows))
