from django.conf import settings
from django.http import HttpResponse
from django.utils.cache import patch_vary_headers


class SurveyCorsMiddleware:
    """Allow credentialed survey requests from explicitly trusted frontend origins."""

    paths = {"/api/csrf/", "/api/survey-responses/", "/api/health/"}

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.path not in self.paths:
            return self.get_response(request)

        origin = request.headers.get("Origin")
        allowed = bool(origin and origin != "null" and origin in settings.CSRF_TRUSTED_ORIGINS)
        preflight = request.method == "OPTIONS" and "Access-Control-Request-Method" in request.headers
        response = HttpResponse(status=204 if allowed else 403) if preflight else self.get_response(request)
        patch_vary_headers(response, ("Origin",))
        if allowed:
            response["Access-Control-Allow-Origin"] = origin
            response["Access-Control-Allow-Credentials"] = "true"
            if preflight:
                response["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
                response["Access-Control-Allow-Headers"] = "Content-Type, X-CSRFToken"
        return response
