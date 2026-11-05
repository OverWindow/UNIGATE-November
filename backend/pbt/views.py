import json
import uuid
from datetime import timedelta
from functools import wraps

from django.core.exceptions import RequestDataTooBig
from django.db import DatabaseError, transaction
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.views.decorators.http import require_GET, require_POST, require_http_methods

from accounts.rate_limits import record_attempt, RateLimitUnavailable
from question_bank.models import QuestionSet
from .bank import BankNotReady, load_set
from .models import Attempt, AttemptItem, Exam
from .services import attempt_data, finalize, owner_filter


def response(data, status=200):
    result = JsonResponse(data, status=status)
    result["Cache-Control"] = "private, no-store"
    result["Vary"] = "Cookie"
    return result


def available(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        try:
            return view(*args, **kwargs)
        except (DatabaseError, RateLimitUnavailable):
            return response({"error": "pbt_unavailable"}, 503)
    return wrapped


def payload(request, fields):
    if request.content_type != "application/json":
        raise ValueError
    try:
        if len(request.body) > 4096:
            raise ValueError
        data = json.loads(request.body)
    except (RequestDataTooBig, UnicodeDecodeError):
        raise ValueError from None
    if not isinstance(data, dict) or set(data) != fields:
        raise ValueError
    return data


@require_GET
@available
def exams(request):
    if not request.user.is_authenticated and not request.session.get("pbt_guest_id"):
        request.session["pbt_guest_id"] = str(uuid.uuid4())
    rows = list(Exam.objects.filter(is_published=True, source_set_id__in=QuestionSet.objects.filter(exam_format="pbt").values("set_id")))
    progress = {}
    if request.user.is_authenticated:
        progress = {e.pk: {mode: {"latestResult": None, "inProgressId": None}
                          for mode in ("practice", "timed")} for e in rows}
        with transaction.atomic():
            owned = Attempt.objects.filter(user=request.user, exam_id__in=progress)
            # Finalize expired tests before selecting results, including older history.
            for attempt in owned.filter(status="in_progress", expires_at__lte=timezone.now()).select_for_update().order_by("-started_at"):
                finalize(attempt)
            latest = owned.filter(status="submitted").order_by("exam_id", "mode", "-submitted_at", "-started_at", "-id").distinct("exam_id", "mode")
            for attempt in latest:
                progress[attempt.exam_id][attempt.mode]["latestResult"] = {
                    "id": str(attempt.pk), "score": attempt.score, "maxScore": 100,
                    "submittedAt": attempt.submitted_at.isoformat(),
                }
            for attempt in owned.filter(status="in_progress"):
                progress[attempt.exam_id][attempt.mode]["inProgressId"] = str(attempt.pk)
    return response({"exams": [{"id": str(e.pk), "title": e.title, "section": e.section,
        "round": e.display_order, "questionCount": 50, "durationSeconds": 3600 if e.section == "listening" else 4200,
        "guestAvailable": e.guest_slot is not None, "accessible": request.user.is_authenticated or e.guest_slot is not None,
        "myProgress": progress.get(e.pk)}
        for e in rows]})


@require_http_methods(["GET", "POST"])
@available
def attempts(request):
    if request.method == "GET":
        with transaction.atomic():
            rows = list(Attempt.objects.filter(owner_filter(request)).select_for_update().order_by("-started_at")[:100])
            for attempt in rows:
                finalize(attempt)
            return response({"attempts": [attempt_data(a) for a in rows]})
    try:
        data = payload(request, {"examId", "mode"})
        exam_id = uuid.UUID(data["examId"])
        if data["mode"] not in ("practice", "timed"):
            raise ValueError
    except (ValueError, TypeError, AttributeError):
        return response({"error": "invalid_request"}, 400)
    if not request.user.is_authenticated and not request.session.get("pbt_guest_id"):
        request.session["pbt_guest_id"] = str(uuid.uuid4())
    with transaction.atomic():
        exam = get_object_or_404(Exam.objects.select_for_update(), pk=exam_id, is_published=True)
        if not request.user.is_authenticated and exam.guest_slot is None:
            return response({"error": "login_required"}, 403)
        owner = {"user": request.user} if request.user.is_authenticated else {"guest_id": request.session["pbt_guest_id"], "user": None}
        existing = Attempt.objects.select_for_update().filter(exam=exam, mode=data["mode"], status="in_progress", **owner).first()
        if existing:
            finalize(existing)
            if existing.status == "in_progress":
                return response(attempt_data(existing))
        wait = record_attempt("pbt_start", str(request.user.pk) if request.user.is_authenticated else request.session["pbt_guest_id"], limit=30, window=3600)
        if wait:
            result = response({"error": "rate_limited"}, 429)
            result["Retry-After"] = str(wait)
            return result
        try:
            questions = load_set(exam.source_set_id, exam.section)
        except BankNotReady:
            return response({"error": "exam_not_ready"}, 409)
        now = timezone.now()
        attempt = Attempt.objects.create(exam=exam, title=exam.title, section=exam.section, mode=data["mode"],
            started_at=now, expires_at=now + timedelta(seconds=3600 if exam.section == "listening" else 4200) if data["mode"] == "timed" else None, **owner)
        AttemptItem.objects.bulk_create([AttemptItem(attempt=attempt, **q) for q in questions])
        return response(attempt_data(attempt), 201)


def owned_attempt(request, attempt_id):
    return get_object_or_404(Attempt.objects.select_for_update().filter(owner_filter(request)), pk=attempt_id)


@require_GET
@available
def detail(request, attempt_id):
    with transaction.atomic():
        attempt = owned_attempt(request, attempt_id)
        finalize(attempt)
        return response(attempt_data(attempt, include_items=True))


@require_http_methods(["PUT"])
@available
def answer(request, attempt_id, position):
    try:
        data = payload(request, {"selectedOption"})
        option = data["selectedOption"]
        if option is not None and (type(option) is not int or not 1 <= option <= 4):
            raise ValueError
    except (ValueError, TypeError):
        return response({"error": "invalid_request"}, 400)
    with transaction.atomic():
        attempt = owned_attempt(request, attempt_id)
        finalize(attempt)
        if attempt.status != "in_progress":
            return response({"error": "attempt_closed", "attempt": attempt_data(attempt)}, 409)
        item = get_object_or_404(AttemptItem, attempt=attempt, position=position)
        item.selected_option = option
        item.answered_at = timezone.now()
        item.save(update_fields=["selected_option", "answered_at"])
        return response({"position": position, "selectedOption": option, "serverNow": timezone.now().isoformat()})


@require_POST
@available
def submit(request, attempt_id):
    with transaction.atomic():
        attempt = owned_attempt(request, attempt_id)
        finalize(attempt, force=True)
        return response(attempt_data(attempt))


@require_GET
@available
def result(request, attempt_id):
    with transaction.atomic():
        attempt = owned_attempt(request, attempt_id)
        finalize(attempt)
        if attempt.status != "submitted":
            return response({"error": "result_not_ready"}, 409)
        return response(attempt_data(attempt, include_items=True, results=True))
