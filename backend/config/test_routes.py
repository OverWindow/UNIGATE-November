from django.test import SimpleTestCase
from django.urls import resolve


class RetainedRoutesTests(SimpleTestCase):
    def test_survey_and_operational_routes_remain(self):
        for path in ("/api/csrf/", "/api/survey-responses/", "/api/health/", "/admin/"):
            with self.subTest(path=path):
                self.assertIsNotNone(resolve(path))

    def test_shared_topiq_authentication_routes_remain(self):
        for path in ("/api/auth/signup/", "/api/auth/login/", "/api/auth/logout/",
                     "/api/auth/me/", "/api/auth/email/send/", "/api/auth/email/verify/"):
            with self.subTest(path=path):
                self.assertIsNotNone(resolve(path))
