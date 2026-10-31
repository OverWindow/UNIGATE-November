import json

from django.core.exceptions import RequestDataTooBig, ValidationError
from django.http import JsonResponse
from django.middleware.csrf import get_token
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_GET, require_POST

from .models import EducationType, SurveyResponse


@never_cache
@require_GET
def csrf_token(request):
    return JsonResponse({"csrfToken": get_token(request)})


@never_cache
@require_POST
def create_response(request):
    if request.content_type != "application/json":
        return JsonResponse({"error": "unsupported_media_type"}, status=415)
    try:
        # Bound public input without changing the existing database schema.
        if len(request.body) > 16_384:
            return JsonResponse({"error": "payload_too_large"}, status=413)
        data = json.loads(request.body)
    except RequestDataTooBig:
        return JsonResponse({"error": "payload_too_large"}, status=413)
    except (ValueError, UnicodeDecodeError):
        return JsonResponse({"error": "invalid_json"}, status=400)
    if not isinstance(data, dict):
        return JsonResponse({"error": "invalid_json"}, status=400)

    errors = {}
    email = data.get("email")
    age = data.get("age")
    education_type = data.get("education_type")
    university = data.get("desired_university")
    if not isinstance(email, str) or not email.strip() or len(email.strip()) > 254:
        errors["email"] = "invalid"
    if type(age) is not int or not 0 <= age <= 120:
        errors["age"] = "invalid"
    if not isinstance(education_type, str) or education_type not in EducationType.values:
        errors["education_type"] = "invalid"
    if university is not None and (not isinstance(university, str) or len(university) > 500):
        errors["desired_university"] = "invalid"
    if errors:
        return JsonResponse({"error": "validation_error", "fields": errors}, status=400)

    try:
        SurveyResponse.objects.create(
            email=email, age=age, education_type=education_type,
            desired_university=university,
        )
    except ValidationError as exc:
        # Return field identifiers, never submitted personal data or internal errors.
        fields = {field: "invalid" for field in exc.message_dict}
        return JsonResponse({"error": "validation_error", "fields": fields}, status=400)
    return JsonResponse({"ok": True}, status=201)
