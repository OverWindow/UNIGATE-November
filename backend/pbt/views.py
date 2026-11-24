import json
import uuid
from datetime import timedelta
from functools import wraps

from django.core.exceptions import RequestDataTooBig, ValidationError
from django.db import DatabaseError, transaction
from django.http import Http404, JsonResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.crypto import constant_time_compare
from django.views.decorators.debug import sensitive_variables, sensitive_post_parameters
from django.views.decorators.http import require_GET, require_POST, require_http_methods

from accounts.rate_limits import record_attempt, request_subject, RateLimitUnavailable
from accounts.email_delivery import EmailDeliveryError
from accounts.plans import has_active_plan
from question_bank.models import QuestionSet
from .bank import BankNotReady, load_question, load_set
from .models import Attempt, AttemptItem, Exam, ExamAttemptFeedback
from .result_delivery import (LINK_LIFETIME, feedback_state, has_result_access, new_token,
                              send_result_email, token_hash)
from .survey import validate_delivery, validate_survey
from .formats import EXAM_FORMATS
from .services import attempt_data, finalize, is_answered, owner_filter
from .sentence_order import valid_selected_order


def response(data, status=200):
    result = JsonResponse(data, status=status)
    result["Cache-Control"] = "private, no-store"
    result["Vary"] = "Cookie"
    return result


class PlusRequired(Exception):
    pass


def published_exams(exam_format):
    sources = QuestionSet.objects.filter(exam_format=exam_format).values("set_id")
    return Exam.objects.filter(exam_format=exam_format, is_published=True, source_set_id__in=sources)


def require_exam_access(user_id, exam):
    if not exam.is_published:
        raise Http404
    section = Exam.objects.filter(exam_format=exam.exam_format, section=exam.section, is_published=True)
    # With a single published set, saved answers need no bank lookup.
    if not section.exclude(pk=exam.pk).exists() or has_active_plan(user_id):
        return
    # Removed sources and gaps in round numbers follow the same order as the catalog.
    first_visible = published_exams(exam.exam_format).filter(section=exam.section).values_list("pk", flat=True).first()
    if first_visible != exam.pk:
        raise PlusRequired


def available(view=None, *, public=False):
    if view is None:
        return lambda handler: available(handler, public=public)
    @wraps(view)
    def wrapped(request, *args, **kwargs):
        try:
            if not public and not request.user.is_authenticated:
                return response({"error": "login_required"}, 401)
            return view(request, *args, **kwargs)
        except PlusRequired:
            return response({"error": "plus_required"}, 403)
        except BankNotReady:
            return response({"error": "exam_not_ready"}, 409)
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
@available(public=True)
def exams(request, exam_format="pbt"):
    config = EXAM_FORMATS[exam_format]
    rows = list(published_exams(exam_format))
    if not rows:
        return response({"exams": []})
    first_by_section = {}
    for exam in rows:
        first_by_section.setdefault(exam.section, exam.pk)
    free_ids = set(first_by_section.values())
    member = request.user.is_authenticated
    plus = member and has_active_plan(request.user.pk)
    progress = exam_progress(request.user, exam_format, rows) if member else {}
    return response({"exams": [{"id": str(e.pk), "title": e.title, "section": e.section,
        "examFormat": e.exam_format, "round": e.display_order, "questionCount": config["question_count"],
        "durationSeconds": config["duration"][e.section], "maxScore": 100,
        "guestAvailable": False, "freeAvailable": e.pk in free_ids, "accessible": member and (plus or e.pk in free_ids),
        "myProgress": progress.get(e.pk)}
        for e in rows]})


def exam_progress(user, exam_format, rows):
    progress = {e.pk: {mode: {"latestResult": None, "inProgressId": None}
                      for mode in ("practice", "timed")} for e in rows}
    with transaction.atomic():
        owned = Attempt.objects.filter(user=user, exam_format=exam_format, exam_id__in=progress)
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
    return progress


@require_http_methods(["GET", "POST"])
@available
def attempts(request, exam_format="pbt"):
    if request.method == "GET":
        try:
            page = int(request.GET.get("page", "1"))
            if page < 1 or request.GET.get("format", exam_format) not in (exam_format, "all"):
                raise ValueError
        except ValueError:
            return response({"error": "invalid_request"}, 400)
        selected_format = request.GET.get("format", exam_format)
        with transaction.atomic():
            attempts_query = Attempt.objects.filter(owner_filter(request))
            if selected_format != "all":
                attempts_query = attempts_query.filter(exam_format=exam_format)
            total = attempts_query.count()
            page_size = 10
            rows = list(attempts_query.select_for_update().order_by("-started_at", "-id")[(page - 1) * page_size:page * page_size])
            for attempt in rows:
                finalize(attempt)
            return response({"attempts": [attempt_data(a, request=request) for a in rows],
                             "page": page, "pageCount": max(1, (total + page_size - 1) // page_size)})
    try:
        data = payload(request, {"examId", "mode"}, {"restartAttemptId"})
        exam_id = uuid.UUID(data["examId"])
        restart_id = uuid.UUID(data["restartAttemptId"]) if "restartAttemptId" in data else None
        if data["mode"] not in ("practice", "timed"):
            raise ValueError
    except (ValueError, TypeError, AttributeError):
        return response({"error": "invalid_request"}, 400)
    with transaction.atomic():
        exam = get_object_or_404(Exam.objects.select_for_update(), pk=exam_id, exam_format=exam_format, is_published=True)
        require_exam_access(request.user.pk, exam)
        owner = {"user": request.user}
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
        wait = record_attempt(f"{exam_format}_start", str(request.user.pk), limit=30, window=3600)
        if wait:
            result = response({"error": "rate_limited"}, 429)
            result["Retry-After"] = str(wait)
            return result
        try:
            load_set(exam.source_set_id, exam.section, exam_format)
        except BankNotReady:
            return response({"error": "exam_not_ready"}, 409)
        if restart is not None:
            finalize(restart, force=True)
        now = timezone.now()
        duration = EXAM_FORMATS[exam_format]["duration"][exam.section]
        attempt = Attempt.objects.create(exam=exam, exam_format=exam_format, title=exam.title, section=exam.section, mode=data["mode"],
            started_at=now, expires_at=now + timedelta(seconds=duration) if data["mode"] == "timed" and duration is not None else None, **owner)
        return response(attempt_data(attempt, request=request), 201)


def owned_attempt(request, attempt_id, exam_format):
    attempt = get_object_or_404(Attempt.objects.select_for_update().filter(owner_filter(request), exam_format=exam_format), pk=attempt_id)
    finalize(attempt)
    if attempt.status == "in_progress":
        require_exam_access(request.user.pk, attempt.exam)
    return attempt


@sensitive_variables("token")
def same_timed_session(request, attempt):
    token = request.headers.get("X-Exam-Session", "")
    return bool(attempt.timed_session_token_hash and len(token) == 36 and
                constant_time_compare(attempt.timed_session_token_hash, token_hash(token)))


@require_POST
@available
@sensitive_post_parameters("sessionToken")
@sensitive_variables("data", "token", "session_hash")
def enter(request, attempt_id, exam_format="pbt"):
    try:
        data = payload(request, {"sessionToken"})
        token = data["sessionToken"]
        if not isinstance(token, str) or str(uuid.UUID(token)) != token:
            raise ValueError
    except (ValueError, TypeError, AttributeError):
        return response({"error": "invalid_request"}, 400)
    with transaction.atomic():
        attempt = owned_attempt(request, attempt_id, exam_format)
        if attempt.mode == "timed" and attempt.status == "in_progress":
            session_hash = token_hash(token)
            if attempt.timed_session_token_hash and not constant_time_compare(attempt.timed_session_token_hash, session_hash):
                # A new page cannot resume a timed attempt, even if its exit request was lost.
                finalize(attempt, force=True)
            elif not attempt.timed_session_token_hash:
                attempt.timed_session_token_hash = session_hash
                attempt.save(update_fields=["timed_session_token_hash"])
        return response(attempt_data(attempt, include_items=attempt.status == "in_progress", request=request))


@require_GET
@available
def detail(request, attempt_id, exam_format="pbt"):
    with transaction.atomic():
        attempt = owned_attempt(request, attempt_id, exam_format)
        if attempt.mode == "timed" and attempt.status == "in_progress" and not same_timed_session(request, attempt):
            return response({"error": "attempt_session_required"}, 409)
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
        if attempt.status != "in_progress":
            return response({"error": "attempt_closed", "attempt": attempt_data(attempt, request=request)}, 409)
        if attempt.mode == "timed" and not same_timed_session(request, attempt):
            return response({"error": "attempt_session_required"}, 409)
        if not 1 <= position <= EXAM_FORMATS[exam_format]["question_count"]:
            raise Http404
        item = attempt.items.filter(position=position).first()
        if item is None:
            question = load_question(attempt.exam.source_set_id, attempt.section, exam_format, position)
            item = AttemptItem(attempt=attempt, **question)
            item.snapshot = {**item.snapshot, "_answerOnly": True}
        ordering = item.snapshot.get("answerMode") == "sentence_order"
        if ordering != ("selectedOrder" in data):
            return response({"error": "invalid_request"}, 400)
        was_answered = is_answered(item)
        if ordering:
            item.selected_order = data["selectedOrder"]
        else:
            item.selected_option = data["selectedOption"]
        has_input = any(value is not None for value in item.selected_order) if ordering else item.selected_option is not None
        if not has_input and item.snapshot.get("_answerOnly"):
            if item.pk is not None:
                item.delete()
        else:
            item.answered_at = timezone.now()
            item.save()
        now_answered = is_answered(item)
        if was_answered != now_answered:
            attempt.answered_count += 1 if now_answered else -1
            attempt.save(update_fields=["answered_count"])
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
        attempt = get_object_or_404(Attempt.objects.select_for_update().filter(owner_filter(request)), pk=attempt_id, exam_format=exam_format)
        finalize(attempt)
        if attempt.user_id is not None or attempt.status != "submitted":
            return response({"error": "feedback_not_available"}, 409)
        wait = record_attempt("result-subject", request_subject(request), limit=100, window=3600)
        if wait:
            return limited(wait)
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
                                  ("result-recipient", delivery["email"], 5)):
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
    wait = record_attempt("result-access-subject", request_subject(request), limit=100, window=600)
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
