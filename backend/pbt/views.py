import json
import uuid
from datetime import timedelta
from functools import wraps

from django.core.exceptions import RequestDataTooBig, ValidationError
from django.db import DatabaseError, transaction
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.crypto import constant_time_compare
from django.views.decorators.debug import sensitive_variables, sensitive_post_parameters
from django.views.decorators.http import require_GET, require_POST, require_http_methods

from accounts.rate_limits import record_attempt, RateLimitUnavailable
from accounts.email_delivery import EmailDeliveryError
from question_bank.models import QuestionSet
from .bank import BankNotReady, load_set
from .models import Attempt, AttemptItem, Exam, ExamAttemptFeedback
from .result_delivery import (LINK_LIFETIME, feedback_state, has_result_access, new_token,
                              send_result_email, token_hash)
from .survey import validate_delivery, validate_survey
from .formats import EXAM_FORMATS
from .services import attempt_data, finalize, owner_filter
from .sentence_order import valid_selected_order


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
            return response({"error": f"{kwargs.get('exam_format', 'pbt')}_unavailable"}, 503)
    return wrapped


def payload(request, fields, optional_fields=(), max_size=4096):
    if request.content_type != "application/json":
        raise ValueError
    try:
        if len(request.body) > max_size:
            raise ValueError
        data = json.loads(request.body)
    except (RequestDataTooBig, UnicodeDecodeError):
        raise ValueError from None
    if not isinstance(data, dict) or not fields <= set(data) <= fields | set(optional_fields):
        raise ValueError
    return data


@require_GET
@available
def exams(request, exam_format="pbt"):
    config = EXAM_FORMATS[exam_format]
    if not request.user.is_authenticated and not request.session.get("pbt_guest_id"):
        request.session["pbt_guest_id"] = str(uuid.uuid4())
    rows = list(Exam.objects.filter(exam_format=exam_format, is_published=True, source_set_id__in=QuestionSet.objects.filter(exam_format=exam_format).values("set_id")))
    progress = {}
    if request.user.is_authenticated:
        progress = {e.pk: {mode: {"latestResult": None, "inProgressId": None}
                          for mode in ("practice", "timed")} for e in rows}
        with transaction.atomic():
            owned = Attempt.objects.filter(user=request.user, exam_format=exam_format, exam_id__in=progress)
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
        "examFormat": e.exam_format, "round": e.display_order, "questionCount": config["question_count"],
        "durationSeconds": config["duration"][e.section], "maxScore": 100,
        "guestAvailable": e.guest_slot is not None, "accessible": request.user.is_authenticated or e.guest_slot is not None,
        "myProgress": progress.get(e.pk)}
        for e in rows]})


@require_http_methods(["GET", "POST"])
@available
def attempts(request, exam_format="pbt"):
    if request.method == "GET":
        with transaction.atomic():
            rows = list(Attempt.objects.filter(owner_filter(request), exam_format=exam_format).select_for_update().order_by("-started_at")[:100])
            for attempt in rows:
                finalize(attempt)
            return response({"attempts": [attempt_data(a, request=request) for a in rows]})
    try:
        data = payload(request, {"examId", "mode"}, {"restartAttemptId"})
        exam_id = uuid.UUID(data["examId"])
        restart_id = uuid.UUID(data["restartAttemptId"]) if "restartAttemptId" in data else None
        if data["mode"] not in ("practice", "timed"):
            raise ValueError
    except (ValueError, TypeError, AttributeError):
        return response({"error": "invalid_request"}, 400)
    if not request.user.is_authenticated and not request.session.get("pbt_guest_id"):
        request.session["pbt_guest_id"] = str(uuid.uuid4())
    with transaction.atomic():
        exam = get_object_or_404(Exam.objects.select_for_update(), pk=exam_id, exam_format=exam_format, is_published=True)
        if not request.user.is_authenticated and exam.guest_slot is None:
            return response({"error": "login_required"}, 403)
        owner = {"user": request.user} if request.user.is_authenticated else {"guest_id": request.session["pbt_guest_id"], "user": None}
        active = Attempt.objects.filter(exam=exam, mode=data["mode"], status="in_progress", **owner)
        restart = None
        if restart_id is not None:
            restart = get_object_or_404(Attempt.objects.select_for_update().filter(owner_filter(request)),
                pk=restart_id, exam=exam, exam_format=exam_format, mode=data["mode"])
            existing = active.first()
            # A retry may only close the named attempt, never its replacement.
            if existing and existing.pk != restart.pk:
                return response(attempt_data(existing, request=request))
            if restart.status != "in_progress":
                return response({"error": "attempt_closed"}, 409)
        else:
            existing = active.select_for_update().first()
            if existing:
                finalize(existing)
                if existing.status == "in_progress":
                    return response(attempt_data(existing, request=request))
        wait = record_attempt(f"{exam_format}_start", str(request.user.pk) if request.user.is_authenticated else request.session["pbt_guest_id"], limit=30, window=3600)
        if wait:
            result = response({"error": "rate_limited"}, 429)
            result["Retry-After"] = str(wait)
            return result
        try:
            questions = load_set(exam.source_set_id, exam.section, exam_format)
        except BankNotReady:
            return response({"error": "exam_not_ready"}, 409)
        if restart is not None:
            finalize(restart, force=True)
        now = timezone.now()
        duration = EXAM_FORMATS[exam_format]["duration"][exam.section]
        attempt = Attempt.objects.create(exam=exam, exam_format=exam_format, title=exam.title, section=exam.section, mode=data["mode"],
            started_at=now, expires_at=now + timedelta(seconds=duration) if data["mode"] == "timed" and duration is not None else None, **owner)
        AttemptItem.objects.bulk_create([AttemptItem(attempt=attempt, **q) for q in questions])
        return response(attempt_data(attempt, request=request), 201)


def owned_attempt(request, attempt_id, exam_format):
    return get_object_or_404(Attempt.objects.select_for_update().filter(owner_filter(request), exam_format=exam_format), pk=attempt_id)


@require_GET
@available
def detail(request, attempt_id, exam_format="pbt"):
    with transaction.atomic():
        attempt = owned_attempt(request, attempt_id, exam_format)
        finalize(attempt)
        return response(attempt_data(attempt, include_items=True, request=request))


@require_http_methods(["PUT"])
@available
def answer(request, attempt_id, position, exam_format="pbt"):
    try:
        data = payload(request, set(), {"selectedOption", "selectedOrder"})
        if len(data) != 1:
            raise ValueError
        if "selectedOrder" in data:
            if not valid_selected_order(data["selectedOrder"]):
                raise ValueError
        else:
            option = data["selectedOption"]
            if option is not None and (type(option) is not int or not 1 <= option <= 4):
                raise ValueError
    except (ValueError, TypeError):
        return response({"error": "invalid_request"}, 400)
    with transaction.atomic():
        attempt = owned_attempt(request, attempt_id, exam_format)
        finalize(attempt)
        if attempt.status != "in_progress":
            return response({"error": "attempt_closed", "attempt": attempt_data(attempt, request=request)}, 409)
        item = get_object_or_404(AttemptItem, attempt=attempt, position=position)
        ordering = item.snapshot.get("answerMode") == "sentence_order"
        if ordering != ("selectedOrder" in data):
            return response({"error": "invalid_request"}, 400)
        if ordering:
            item.selected_order = data["selectedOrder"]
        else:
            item.selected_option = data["selectedOption"]
        item.answered_at = timezone.now()
        item.save(update_fields=["selected_order" if ordering else "selected_option", "answered_at"])
        return response({"position": position, **data, "serverNow": timezone.now().isoformat()})


@require_POST
@available
def submit(request, attempt_id, exam_format="pbt"):
    with transaction.atomic():
        attempt = owned_attempt(request, attempt_id, exam_format)
        finalize(attempt, force=True)
        return response(attempt_data(attempt, request=request))


@require_GET
@available
def result(request, attempt_id, exam_format="pbt"):
    with transaction.atomic():
        attempt = get_object_or_404(Attempt.objects.select_for_update(), pk=attempt_id, exam_format=exam_format)
        allowed = has_result_access(request, attempt)
        if not allowed:
            get_object_or_404(Attempt.objects.filter(owner_filter(request)), pk=attempt_id)
        finalize(attempt)
        if attempt.status != "submitted":
            return response({"error": "result_not_ready"}, 409)
        if not allowed:
            return response({"error": "result_email_required"}, 403)
        return response(attempt_data(attempt, include_items=True, results=True, request=request))


def limited(wait):
    result = response({"error": "result_email_rate_limited", "retryAfter": wait}, 429)
    result["Retry-After"] = str(wait)
    return result


@require_POST
@available
@sensitive_post_parameters()
@sensitive_variables()
def result_email(request, attempt_id, exam_format="pbt"):
    try:
        data = payload(request, {"email", "rating", "language"}, {"survey"}, max_size=16_384)
        delivery = validate_delivery(data)
    except (ValueError, TypeError):
        return response({"error": "invalid_request"}, 400)
    except ValidationError as exc:
        return response({"error": "validation_error", "fields": list(exc.message_dict)}, 400)
    with transaction.atomic():
        attempt = owned_attempt(request, attempt_id, exam_format)
        finalize(attempt)
        if attempt.user_id is not None or attempt.status != "submitted":
            return response({"error": "feedback_not_available"}, 409)
        feedback = ExamAttemptFeedback.objects.filter(attempt=attempt).first()
        if feedback is None:
            try:
                survey = validate_survey(data.get("survey"))
            except ValidationError as exc:
                return response({"error": "survey_required" if "survey" not in data else "invalid_survey",
                                 "fields": list(exc.message_dict)}, 400)
            feedback = ExamAttemptFeedback.objects.create(attempt=attempt, **delivery, **survey)
        now = timezone.now()
        if feedback.email_requested_at and feedback.email_requested_at + timedelta(seconds=60) > now:
            return limited(max(1, int((feedback.email_requested_at + timedelta(seconds=60) - now).total_seconds()) + 1))
        for scope, key, limit in (("result-attempt", str(attempt.pk), 5),
                                  ("result-recipient", delivery["email"], 5),
                                  ("result-peer", request.META.get("REMOTE_ADDR", "unknown"), 100)):
            wait = record_attempt(scope, key, limit=limit, window=3600)
            if wait:
                return limited(wait)
        token = new_token()
        digest = token_hash(token)
        # A delivery timeout can still produce a usable link; persist its hash before sending.
        for key, value in delivery.items():
            setattr(feedback, key, value)
        feedback.result_token_hash = digest
        feedback.result_token_expires_at = now + LINK_LIFETIME
        feedback.email_status = "sending"
        feedback.email_requested_at = now
        feedback.email_sent_at = None
        feedback.save()
    state = "accepted"
    try:
        send_result_email(attempt, delivery["email"], token, delivery["language"])
    except EmailDeliveryError as exc:
        state = "uncertain" if exc.uncertain else "failed"
    ExamAttemptFeedback.objects.filter(attempt=attempt, result_token_hash=digest).update(
        email_status=state, email_sent_at=timezone.now() if state == "accepted" else None, updated_at=timezone.now())
    feedback.refresh_from_db()
    attempt.feedback = feedback
    body = {"feedback": feedback_state(attempt)}
    if state != "accepted":
        body["error"] = "result_email_uncertain" if state == "uncertain" else "result_email_failed"
    return response(body, 202 if state == "accepted" else 503)


@require_POST
@available
@sensitive_post_parameters("token")
@sensitive_variables()
def result_access(request, exam_format="pbt"):
    try:
        data = payload(request, {"attemptId", "token"})
        attempt_id = uuid.UUID(data["attemptId"])
        token = data["token"]
        if not isinstance(token, str) or len(token) != 43:
            raise ValueError
    except (ValueError, TypeError, AttributeError):
        return response({"error": "result_link_invalid"}, 400)
    wait = record_attempt("result-access-peer", request.META.get("REMOTE_ADDR", "unknown"), limit=100, window=600)
    if wait:
        return limited(wait)
    with transaction.atomic():
        feedback = ExamAttemptFeedback.objects.select_for_update().select_related("attempt").filter(
            attempt_id=attempt_id, attempt__exam_format=exam_format,
            attempt__user__isnull=True, attempt__status="submitted").first()
        if not feedback or not constant_time_compare(token_hash(token), feedback.result_token_hash):
            return response({"error": "result_link_invalid"}, 400)
        if not feedback.result_token_expires_at or feedback.result_token_expires_at <= timezone.now():
            return response({"error": "result_link_expired"}, 400)
        if feedback.result_accessed_at is None:
            feedback.result_accessed_at = timezone.now()
            feedback.save(update_fields=["result_accessed_at", "updated_at"])
        grants = request.session.get("exam_result_grants", {})
        grants.pop(str(attempt_id), None)
        grants[str(attempt_id)] = feedback.result_token_hash
        request.session["exam_result_grants"] = dict(list(grants.items())[-100:])
        return response({"attemptId": str(attempt_id), "language": feedback.language,
                         "expiresAt": feedback.result_token_expires_at.isoformat()})
