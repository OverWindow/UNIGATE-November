from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.db import IntegrityError, transaction
from django.test import TestCase, override_settings
from django.utils import timezone

from surveys.learner import CATALOG
from surveys.models import SignupSurveyResponse
from .tests import AuthClientMixin, FAST_HASHERS, signup_survey_input


@override_settings(PASSWORD_HASHERS=FAST_HASHERS)
class SignupSurveyTests(AuthClientMixin, TestCase):
    def setUp(self):
        self.client, self.token = self.csrf_client()

    def test_signup_records_verified_user_and_normalized_survey_in_each_language(self):
        for language in ("ko", "en", "id"):
            client, token = self.csrf_client()
            response = self.post("/api/auth/signup/", self.payload(f"{language}@example.invalid", language=language,
                survey=signup_survey_input(topikReasons=["other", "employment"], topikReasonOther="  Study  ",
                                          currentTopikLevel=4)), client, token)
            self.assertEqual(response.status_code, 201)
            saved = SignupSurveyResponse.objects.get(user_id=response.json()["user"]["id"])
            self.assertEqual(saved.user.email, f"{language}@example.invalid")
            self.assertEqual(saved.language, language)
            self.assertEqual(saved.nationality_code, "ID")
            self.assertEqual(saved.topik_reason_other, "Study")
            self.assertIsNone(saved.current_topik_level)
            self.assertEqual(saved.survey_version, CATALOG["signupVersion"])
            self.assertEqual(saved.privacy_consent_version, CATALOG["signupConsentVersion"])
            self.assertEqual(saved.survey_completed_at, saved.privacy_consented_at)
            self.assertEqual(client.get("/api/auth/me/").status_code, 200)
            self.assertNotIn("survey", response.json())

    def test_required_survey_cannot_be_skipped_and_invalid_answers_create_no_account(self):
        cases = [(None, "survey"), ({}, "nationalityCode"),
            (signup_survey_input(privacyConsent=False), "privacyConsent"),
            (signup_survey_input(privacyConsentVersion=CATALOG["consentVersion"]), "privacyConsent"),
            (signup_survey_input(topikReasons=["other"]), "topikReasonOther"),
            (signup_survey_input(topikExperience="once"), "currentTopikLevel"),
            (signup_survey_input(topikReasons=["employment", "employment"]), "topikReasons"),
            (signup_survey_input(targetTopikLevel=True), "targetTopikLevel"),
            (signup_survey_input(birthYear=timezone.localdate().year + 1), "birthYear")]
        for index, (survey, field) in enumerate(cases):
            with self.subTest(field=field, index=index):
                data = self.payload(f"missing-{index}@example.invalid", survey=survey)
                if survey is None:
                    del data["survey"]
                response = self.post("/api/auth/signup/", data)
                self.assertEqual(response.status_code, 400)
                self.assertIn(field, response.json()["fields"])
        self.assertFalse(get_user_model().objects.exists())
        self.assertFalse(SignupSurveyResponse.objects.exists())

    def test_types_and_language_cannot_bypass_signup_validation(self):
        for index, changes in enumerate(({"survey": []}, {"survey": "{}"}, {"nickname": {}},
                                         {"language": "xx"}, {"rating": 5})):
            self.assertEqual(self.post("/api/auth/signup/", self.payload(f"types-{index}@example.invalid", **changes)).status_code, 400)
        self.assertFalse(get_user_model().objects.exists())

    @patch("accounts.views.SignupSurveyResponse.objects.create", side_effect=IntegrityError("synthetic failure"))
    def test_survey_failure_rolls_back_user_and_does_not_log_in(self, save):
        with self.assertLogs("accounts.views", level="ERROR"):
            response = self.post("/api/auth/signup/", self.payload())
        self.assertEqual(response.status_code, 500)
        self.assertFalse(get_user_model().objects.exists())
        self.assertFalse(SignupSurveyResponse.objects.exists())
        self.assertEqual(self.client.get("/api/auth/me/").status_code, 401)

    def test_one_response_per_user_and_level_constraints(self):
        self.post("/api/auth/signup/", self.payload())
        saved = SignupSurveyResponse.objects.get()
        values = {field.name: getattr(saved, field.name) for field in saved._meta.fields}
        with self.assertRaises(IntegrityError), transaction.atomic():
            SignupSurveyResponse.objects.create(**values)
        for change in ({"target_topik_level": 2}, {"current_topik_level": 7}):
            with self.assertRaises(IntegrityError), transaction.atomic():
                SignupSurveyResponse.objects.update(**change)

    def test_admin_requires_view_permission_and_responses_are_read_only(self):
        self.post("/api/auth/signup/", self.payload())
        staff = get_user_model().objects.create_user(username="survey-reader", is_staff=True)
        self.client.force_login(staff)
        url = "/admin/surveys/signupsurveyresponse/"
        self.assertEqual(self.client.get(url).status_code, 403)
        staff.user_permissions.add(Permission.objects.get(codename="view_signupsurveyresponse"))
        response = self.client.get(url)
        self.assertContains(response, "learner@example.invalid")
        saved = SignupSurveyResponse.objects.get()
        detail = f"{url}{saved.pk}/change/"
        self.assertEqual(self.client.get(detail).status_code, 200)
        self.assertEqual(self.post(detail, {"target_topik_level": 6}).status_code, 403)
        self.assertEqual(self.client.get(url + "add/").status_code, 403)
