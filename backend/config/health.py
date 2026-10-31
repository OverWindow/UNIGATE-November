from django.db import DatabaseError, connection
from django.http import JsonResponse
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_GET


@never_cache
@require_GET
def health(request):
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT id FROM survey_responses LIMIT 0")
    except DatabaseError:
        return JsonResponse({"ok": False}, status=503)
    return JsonResponse({"ok": True})
