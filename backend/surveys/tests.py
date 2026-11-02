import json

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import Client, TestCase
from django.utils import timezone

from .models import EducationType, SurveyResponse


class SurveyResponseTests(TestCase):
    def response(self, **overrides):
        values = {"email": "student@example.com", "age": 20,
                  "education_type": EducationType.UNIVERSITAS}
        values.update(overrides)
        return SurveyResponse(**values)

    def test_duplicate_emails_and_optional_university(self):
        first = self.response(email=" student@example.com ", desired_university=" \t ")
        first.save()
        second = self.response(desired_university=" Seoul National University ")
        second.save()
        first.refresh_from_db()
        self.assertEqual(first.email, second.email)
        self.assertIsNone(first.desired_university)
        self.assertEqual(second.desired_university, "Seoul National University")
        self.assertNotEqual(first.pk, second.pk)
        self.assertTrue(timezone.is_aware(first.created_at))

    def test_choices_and_age_boundaries(self):
        for choice in EducationType.values:
            for age in (0, 120):
                with self.subTest(choice=choice, age=age):
                    self.response(education_type=choice, age=age).save()

    def test_invalid_model_inputs(self):
        for values in ({"email": "invalid"}, {"email": " "}, {"age": -1},
                       {"age": 121}, {"education_type": "invalid"},
                       {"education_type": ""}, {"age": None}):
            with self.subTest(values=values), self.assertRaises(ValidationError):
                self.response(**values).save()

    def test_database_constraints_when_validation_is_bypassed(self):
        for values in ({"age": -1}, {"age": 121}, {"education_type": "invalid"},
                       {"email": " "}, {"desired_university": " "}):
            with self.subTest(values=values), self.assertRaises(IntegrityError):
                with transaction.atomic():
                    SurveyResponse.objects.bulk_create([self.response(**values)])


class SurveyApiTests(TestCase):
    def setUp(self):
        self.client = Client(enforce_csrf_checks=True)
        response = self.client.get("/api/csrf/")
        self.token = response.json()["csrfToken"]
        self.assertIn("no-store", response.headers["Cache-Control"])
        self.payload = {"email": " student@example.com ", "age": 20,
                        "education_type": "universitas", "desired_university": " "}

    def post(self, payload=None, **kwargs):
        return self.client.post("/api/survey-responses/", json.dumps(
            self.payload if payload is None else payload), content_type="application/json",
            HTTP_X_CSRFTOKEN=self.token, **kwargs)

    def test_save_normalizes_and_does_not_return_personal_information(self):
        response = self.post()
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json(), {"ok": True})
        saved = SurveyResponse.objects.get()
        self.assertEqual(saved.email, "student@example.com")
        self.assertIsNone(saved.desired_university)
        self.assertEqual(saved.age, 20)
        self.assertIsNotNone(saved.created_at)

    def test_existing_choices_and_duplicate_email_policy(self):
        for choice in EducationType.values:
            self.assertEqual(self.post({**self.payload, "education_type": choice,
                                        "desired_university": " Korea University "}).status_code, 201)
        self.assertEqual(SurveyResponse.objects.count(), len(EducationType.values))
        self.assertEqual(SurveyResponse.objects.first().desired_university, "Korea University")

    def test_invalid_values_are_rejected_without_writes(self):
        cases = [{"email": "invalid"}, {"email": None}, {"email": ["x"]},
                 {"age": True}, {"age": 20.5}, {"age": "20"}, {"age": -1},
                 {"age": 121}, {"age": None}, {"education_type": "invalid"},
                 {"education_type": []}, {"desired_university": 123},
                 {"desired_university": "x" * 501}]
        for override in cases:
            with self.subTest(override=override):
                response = self.post({**self.payload, **override})
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.json()["error"], "validation_error")
        for payload in ({}, [], None, "text"):
            body = json.dumps(payload)
            response = self.client.post("/api/survey-responses/", body,
                                        content_type="application/json", HTTP_X_CSRFTOKEN=self.token)
            self.assertEqual(response.status_code, 400)
        self.assertFalse(SurveyResponse.objects.exists())

    def test_csrf_and_untrusted_origin_rejected(self):
        response = self.client.post("/api/survey-responses/", self.payload, content_type="application/json")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(self.post(HTTP_ORIGIN="https://untrusted.example").status_code, 403)
        self.assertFalse(SurveyResponse.objects.exists())

    def test_methods_content_type_and_bad_json(self):
        self.assertEqual(self.client.get("/api/survey-responses/").status_code, 405)
        self.assertEqual(self.client.post("/api/csrf/", HTTP_X_CSRFTOKEN=self.token).status_code, 405)
        for body, content_type, status in [("{", "application/json", 400),
                                           ("email=a", "text/plain", 415),
                                           ('"' + 'x' * 17000 + '"', "application/json", 413)]:
            response = self.client.post("/api/survey-responses/", body,
                                        content_type=content_type, HTTP_X_CSRFTOKEN=self.token)
            self.assertEqual(response.status_code, status)
        self.assertFalse(SurveyResponse.objects.exists())

    def test_client_cannot_override_generated_fields(self):
        response = self.post({**self.payload, "id": 98765, "created_at": "2000-01-01"})
        self.assertEqual(response.status_code, 201)
        saved = SurveyResponse.objects.get()
        self.assertNotEqual(saved.pk, 98765)
        self.assertGreater(saved.created_at.year, 2000)
