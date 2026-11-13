from django.test import Client, TestCase, override_settings

from surveys.models import SurveyResponse


@override_settings(
    ALLOWED_HOSTS=["api.example.com"],
    CSRF_TRUSTED_ORIGINS=["https://www.example.com"],
    CSRF_COOKIE_SECURE=True,
    CSRF_COOKIE_SAMESITE="None",
)
class SurveyCorsTests(TestCase):
    def setUp(self):
        self.client = Client(enforce_csrf_checks=True)
        self.headers = {"HTTP_HOST": "api.example.com", "HTTP_ORIGIN": "https://www.example.com"}
        self.payload = {"email": "synthetic@example.com", "age": 20, "education_type": "universitas"}

    def test_cross_origin_preflight_and_submission(self):
        response = self.client.options(
            "/api/survey-responses/", secure=True, **self.headers,
            HTTP_ACCESS_CONTROL_REQUEST_METHOD="POST",
            HTTP_ACCESS_CONTROL_REQUEST_HEADERS="content-type,x-csrftoken",
        )
        self.assertEqual(response.status_code, 204)
        self.assertEqual(response["Access-Control-Allow-Origin"], self.headers["HTTP_ORIGIN"])
        self.assertEqual(response["Access-Control-Allow-Credentials"], "true")
        self.assertIn("X-CSRFToken", response["Access-Control-Allow-Headers"])
        response = self.client.get("/api/csrf/", secure=True, **self.headers)
        self.assertTrue(response.cookies["csrftoken"]["secure"])
        self.assertEqual(response.cookies["csrftoken"]["samesite"], "None")
        response = self.client.post(
            "/api/survey-responses/", self.payload, content_type="application/json",
            secure=True, **self.headers, HTTP_X_CSRFTOKEN=response.json()["csrfToken"],
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response["Access-Control-Allow-Origin"], self.headers["HTTP_ORIGIN"])
        self.assertEqual(SurveyResponse.objects.count(), 1)

    def test_untrusted_origins_are_not_allowed(self):
        for origin in ("https://evil.example", "https://www.example.com.evil.example", "null"):
            headers = {**self.headers, "HTTP_ORIGIN": origin}
            response = self.client.options("/api/survey-responses/", secure=True, **headers,
                                           HTTP_ACCESS_CONTROL_REQUEST_METHOD="POST")
            self.assertEqual(response.status_code, 403)
            self.assertNotIn("Access-Control-Allow-Origin", response)
            token = self.client.get("/api/csrf/", secure=True, **self.headers).json()["csrfToken"]
            response = self.client.post("/api/survey-responses/", self.payload,
                                        content_type="application/json", secure=True,
                                        **headers, HTTP_X_CSRFTOKEN=token)
            self.assertEqual(response.status_code, 403)
            self.assertNotIn("Access-Control-Allow-Origin", response)
        self.assertFalse(SurveyResponse.objects.exists())

    def test_csrf_still_required_and_errors_readable(self):
        token = self.client.get("/api/csrf/", secure=True, **self.headers).json()["csrfToken"]
        response = self.client.post("/api/survey-responses/", self.payload,
                                    content_type="application/json", secure=True, **self.headers)
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response["Access-Control-Allow-Origin"], self.headers["HTTP_ORIGIN"])
        self.client.cookies.clear()
        response = self.client.post("/api/survey-responses/", self.payload,
                                    content_type="application/json", secure=True,
                                    **self.headers, HTTP_X_CSRFTOKEN=token)
        self.assertEqual(response.status_code, 403)
        self.assertFalse(SurveyResponse.objects.exists())

    def test_vary_and_path_scope(self):
        response = self.client.get("/api/csrf/", secure=True, HTTP_HOST="api.example.com")
        self.assertIn("Origin", response["Vary"])
        self.assertNotIn("Access-Control-Allow-Origin", response)
        response = self.client.get("/missing/", secure=True, **self.headers)
        self.assertNotIn("Access-Control-Allow-Origin", response)

    @override_settings(CSRF_TRUSTED_ORIGINS=["https://unigate.kr", "https://www.unigate.kr"])
    def test_both_official_landing_hosts_can_submit(self):
        for origin in ("https://unigate.kr", "https://www.unigate.kr"):
            with self.subTest(origin=origin):
                client = Client(enforce_csrf_checks=True)
                headers = {**self.headers, "HTTP_ORIGIN": origin}
                token = client.get("/api/csrf/", secure=True, **headers)
                self.assertEqual(token["Access-Control-Allow-Origin"], origin)
                self.assertEqual(token["Access-Control-Allow-Credentials"], "true")
                response = client.post(
                    "/api/survey-responses/", self.payload, content_type="application/json",
                    secure=True, **headers, HTTP_X_CSRFTOKEN=token.json()["csrfToken"],
                )
                self.assertEqual(response.status_code, 201)
                self.assertEqual(response["Access-Control-Allow-Origin"], origin)
        self.assertEqual(SurveyResponse.objects.count(), 2)
