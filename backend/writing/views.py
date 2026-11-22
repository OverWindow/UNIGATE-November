import json
from functools import wraps
from uuid import UUID

from django.core.exceptions import RequestDataTooBig
from django.db import DatabaseError
from django.views.decorators.debug import sensitive_variables
from django.views.decorators.http import require_GET, require_POST, require_http_methods

from accounts.credits import account_with_monthly_credits, balance_data
from accounts.models import CreditTransaction
from accounts.rate_limits import RateLimitUnavailable, record_attempt
from accounts.views import api_response
from question_bank.writing import WritingUnavailable

from .models import Evaluation
from .services import EvaluationError, config_data, expire_for_user, serialize, submit, unlock


def authenticated(view):
    @wraps(view)
    def wrapped(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return api_response({"error": "authentication_required"}, 401)
        try:
            return view(request, *args, **kwargs)
        except EvaluationError as exc:
            return api_response({"error": exc.code}, exc.status)
        except (DatabaseError, RateLimitUnavailable, WritingUnavailable):
            return api_response({"error": "writing_unavailable"}, 503)
    return wrapped


def page_number(request):
    try:
        page = int(request.GET.get("page", "1"))
    except ValueError:
        raise EvaluationError("invalid_page") from None
    if not 1 <= page <= 10000:
        raise EvaluationError("invalid_page")
    return page


def page_rows(query, page):
    rows = list(query[(page - 1) * 20:page * 20 + 1])
    return rows[:20], page + 1 if len(rows) > 20 else None


@require_GET
@authenticated
def configuration(request):
    return api_response(config_data())


@require_POST
@authenticated
def unlock_set(request, set_id):
    if request.content_type != "application/json":
        return api_response({"error": "unsupported_media_type"}, 415)
    try:
        if len(request.body) > 1024 or json.loads(request.body) != {}:
            return api_response({"error": "invalid_submission"}, 400)
    except (ValueError, RequestDataTooBig):
        return api_response({"error": "invalid_submission"}, 400)
    data, created = unlock(user_id=request.user.pk, set_id=set_id)
    return api_response(data, 201 if created else 200)


@require_http_methods(["GET", "POST"])
@authenticated
@sensitive_variables()
def evaluations(request):
    if request.method == "GET":
        page = page_number(request)
        expire_for_user(request.user.pk)
        query = Evaluation.objects.filter(user=request.user).defer("question_snapshot", "answer", "result").order_by("-created_at", "-id")
        rows, next_page = page_rows(query, page)
        return api_response({"evaluations": [serialize(entry) for entry in rows], "nextPage": next_page})
    if request.content_type != "application/json":
        return api_response({"error": "unsupported_media_type"}, 415)
    try:
        # Enough for 20,000 Unicode code points, including JSON escaping.
        if len(request.body) > 262144:
            return api_response({"error": "payload_too_large"}, 413)
        data = json.loads(request.body)
        required = {"id", "setId", "typeSlot", "answer", "priceVersion"}
        if not isinstance(data, dict) or not required <= set(data) <= required | {"feedbackLanguage"}:
            raise ValueError
        feedback_language = data.get("feedbackLanguage", "ko")
        if feedback_language not in ("ko", "en", "id"):
            raise ValueError
        if type(data["typeSlot"]) is not int or data["typeSlot"] not in (51, 52, 53, 54):
            raise ValueError
        if not isinstance(data["priceVersion"], str) or len(data["priceVersion"]) != 64:
            raise ValueError
        evaluation_id, set_id = UUID(data["id"]), UUID(data["setId"])
        if not isinstance(data["answer"], dict):
            raise ValueError
    except RequestDataTooBig:
        return api_response({"error": "payload_too_large"}, 413)
    except (ValueError, TypeError, AttributeError):
        return api_response({"error": "invalid_submission"}, 400)
    wait = record_attempt("writing-submit", str(request.user.pk), limit=60, window=3600)
    if wait:
        result = api_response({"error": "rate_limited"}, 429)
        result["Retry-After"] = str(wait)
        return result
    try:
        entry, created = submit(user_id=request.user.pk, evaluation_id=evaluation_id, set_id=set_id,
                                slot=data["typeSlot"], answer=data["answer"], price_version=data["priceVersion"],
                                feedback_language=feedback_language)
    except ValueError:
        return api_response({"error": "invalid_submission"}, 400)
    return api_response(serialize(entry, detail=True), 202 if entry.status == "processing" else 201 if created else 200)


@require_GET
@authenticated
def evaluation_detail(request, evaluation_id):
    expire_for_user(request.user.pk)
    entry = Evaluation.objects.filter(pk=evaluation_id, user=request.user).first()
    if entry is None:
        return api_response({"error": "not_found"}, 404)
    return api_response(serialize(entry, detail=True))


@require_GET
@authenticated
def credits(request):
    expire_for_user(request.user.pk)
    account = account_with_monthly_credits(request.user.pk)
    return api_response(balance_data(account))


@require_GET
@authenticated
def transactions(request):
    page = page_number(request)
    expire_for_user(request.user.pk)
    account_with_monthly_credits(request.user.pk)
    query = CreditTransaction.objects.filter(account_id=request.user.pk).order_by("-created_at", "-id")
    rows, next_page = page_rows(query, page)
    return api_response({"transactions": [
        {"id": str(entry.pk), "kind": entry.kind, "amount": entry.amount,
         "evaluationId": str(entry.evaluation_id) if entry.evaluation_id else None,
         "setId": str(entry.set_id) if entry.set_id else None,
         "balanceAfter": entry.balance_after, "reservedAfter": entry.reserved_after,
         "createdAt": entry.created_at.isoformat()} for entry in rows
    ], "nextPage": next_page})
