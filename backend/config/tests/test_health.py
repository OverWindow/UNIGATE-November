from unittest.mock import patch
from django.db import DatabaseError
from django.test import TestCase


class HealthTests(TestCase):
    def test_ready(self):
        response = self.client.get("/api/health/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"ok": True})
        self.assertIn("no-store", response["Cache-Control"])

    def test_unavailable(self):
        with patch("config.health.connection.cursor", side_effect=DatabaseError("private detail")):
            response = self.client.get("/api/health/")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json(), {"ok": False})

    def test_read_only_method(self):
        self.assertEqual(self.client.post("/api/health/").status_code, 405)
