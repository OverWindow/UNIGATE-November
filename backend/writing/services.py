from datetime import timedelta

from django.conf import settings
from django.utils import timezone

from accounts.credits import balance_data, evaluation_lock, locked_account, record, settle
from question_bank.models import WritingQuestion
from question_bank.writing import complete_sets, question as public_question

from .contract import FEEDBACK_LANGUAGES, LearnerAnswer, build_request, digest, empty_response, validate_response
from .models import Evaluation
from .access import EVALUATION_LIMIT, QUESTION_PRICES, SET_COST, evaluation_usage, has_access
from .provider import ProviderError, evaluate


class EvaluationError(Exception):
    def __init__(self, code, status=400):
        self.code, self.status = code, status


def config_data():
    model = settings.WRITING_EVALUATION_MODEL
    enabled = bool(model and settings.BIZROUTER_API_KEY)
    version = digest({"model": model, "policy": "set-unlock-v1", "prices": QUESTION_PRICES, "limit": EVALUATION_LIMIT})
    return {"questionPrices": QUESTION_PRICES, "setCost": SET_COST, "evaluationLimit": EVALUATION_LIMIT,
            "enabled": enabled, "priceVersion": version,
            "timeoutSeconds": settings.WRITING_EVALUATION_TIMEOUT_SECONDS}


def expire_locked():
    now = timezone.now()
    for entry in Evaluation.objects.select_for_update().filter(status="processing", expires_at__lte=now):
        settle(entry, success=False)
        entry.status, entry.error_code, entry.completed_at = "failed", "evaluation_expired", now
        entry.save(update_fields=["status", "error_code", "completed_at"])


def existing_locked(user_id, evaluation_id, submission_hash, feedback_language):
    entry = Evaluation.objects.filter(pk=evaluation_id).first()
    if entry and (entry.user_id != user_id or entry.submission_hash != submission_hash
                  or entry.feedback_language != feedback_language):
        raise EvaluationError("request_conflict", 409)
    return entry


def prepare_question(set_id, item, answer, feedback_language="ko"):
    display = public_question(item)
    source = {"exam_format": "pbt", "section": "writing", "type_slot": item.type_slot,
              "topic": display["topic"], "instruction": display["instruction"],
              "context_title": display["contextTitle"], "passage": display["passage"],
              "data_source": display["dataSource"], "materials": display["materials"],
              "material_notes": display["materialNotes"], "requirements": display["requirements"]}
    try:
        request = build_request(f"writing:{set_id}:{item.type_slot}", source, answer, feedback_language=feedback_language)
    except ValueError:
        raise EvaluationError("question_unavailable", 503) from None
    snapshot = source.copy()
    if display["imageUrl"]:
        snapshot["image_url"] = display["imageUrl"]
    return request, snapshot


def unlock(*, user_id, set_id):
    with evaluation_lock():
        expire_locked()
        account = locked_account(user_id)
        if has_access(user_id, set_id):
            return {"setId": str(set_id), "unlocked": True, "chargedCredits": 0,
                    "credits": balance_data(account)}, False
        if not complete_sets().filter(pk=set_id).exists():
            raise EvaluationError("not_found", 404)
        items = list(WritingQuestion.objects.filter(set_id=set_id).order_by("type_slot"))
        if [item.type_slot for item in items] != list(QUESTION_PRICES):
            raise EvaluationError("question_unavailable", 503)
        # Validate all four prompts before charging; no provider calls are made here.
        for item in items:
            prepare_question(set_id, item, {})
        if account.balance - account.reserved < SET_COST:
            raise EvaluationError("insufficient_credits", 409)
        account.balance -= SET_COST
        record(account, "unlock", SET_COST, set_id=set_id)
        return {"setId": str(set_id), "unlocked": True, "chargedCredits": SET_COST,
                "credits": balance_data(account)}, True


def submit(*, user_id, evaluation_id, set_id, slot, answer, price_version, feedback_language="ko"):
    if not isinstance(feedback_language, str) or feedback_language not in FEEDBACK_LANGUAGES:
        raise ValueError("지원하지 않는 평가 언어입니다.")
    # Whitespace is preserved. Hash identity does not change when model/prices change.
    answer = LearnerAnswer.model_validate(answer).for_slot(slot)
    submission_hash = digest({"set": str(set_id), "slot": slot, "answer": answer})
    with evaluation_lock():
        expire_locked()
        existing = existing_locked(user_id, evaluation_id, submission_hash, feedback_language)
        if existing:
            return existing, False
        if not has_access(user_id, set_id):
            raise EvaluationError("set_locked", 403)

    if not complete_sets().filter(pk=set_id).exists():
        raise EvaluationError("not_found", 404)
    item = WritingQuestion.objects.filter(set_id=set_id, type_slot=slot).first()
    if item is None:
        raise EvaluationError("not_found", 404)
    request, snapshot = prepare_question(set_id, item, answer, feedback_language)
    local = empty_response(request)
    config = config_data()
    if not config["enabled"]:
        raise EvaluationError("evaluation_unavailable", 503)
    if config["priceVersion"] != price_version:
        raise EvaluationError("price_changed", 409)
    options = {"max_tokens": 4096, "stream": False}
    timeout = settings.WRITING_EVALUATION_TIMEOUT_SECONDS
    with evaluation_lock():
        expire_locked()
        existing = existing_locked(user_id, evaluation_id, submission_hash, feedback_language)
        if existing:
            return existing, False
        if not has_access(user_id, set_id):
            raise EvaluationError("set_locked", 403)
        if evaluation_usage(user_id, set_id)[str(slot)]["remaining"] == 0:
            raise EvaluationError("evaluation_limit_reached", 409)
        if local is None and Evaluation.objects.filter(status="processing").count() >= settings.WRITING_EVALUATION_MAX_CONCURRENT:
            raise EvaluationError("evaluation_busy", 429)
        entry = Evaluation.objects.create(
            id=evaluation_id, user_id=user_id, set_id=set_id, type_slot=slot, submission_hash=submission_hash,
            question_snapshot=snapshot, answer=answer, request_hash=request.request_id, feedback_language=feedback_language,
            prompt_version=digest({"system": request.system, "rubric": request.payload["rubric"],
                                   "notes": "", "schema": request.payload["output_schema"]}),
            requested_model=settings.WRITING_EVALUATION_MODEL, model_options=options,
            price_version=price_version, credit_cost=0, status="processing",
            expires_at=timezone.now() + timedelta(seconds=timeout + 60),
        )

    usage, resolved_model, checked, error = {}, "", None, ""
    try:
        raw = local
        if raw is None:
            raw, usage, resolved_model = evaluate(request, model=entry.requested_model, options=options,
                                                  evaluation_id=entry.pk, timeout=timeout)
        checked = validate_response(raw, request)
    except ProviderError as exc:
        error = str(exc)
    except ValueError:
        error = "invalid_model_response"
    # Processing entries hold a quota slot until completion or expiry.
    with evaluation_lock():
        expire_locked()
        current = Evaluation.objects.select_for_update().get(pk=entry.pk)
        if current.status != "processing":
            return current, True
        settle(current, success=checked is not None)
        current.status = "succeeded" if checked is not None else "failed"
        current.result = checked.model_dump() if checked is not None else None
        current.total_score = checked.total if checked is not None else None
        current.usage, current.resolved_model, current.error_code = usage, resolved_model, error
        current.completed_at = timezone.now()
        current.save(update_fields=["status", "result", "total_score", "usage", "resolved_model", "error_code", "completed_at"])
        return current, True


def serialize(entry, *, detail=False):
    data = {"id": str(entry.pk), "setId": str(entry.set_id), "typeSlot": entry.type_slot,
            "feedbackLanguage": entry.feedback_language,
            "status": entry.status, "totalScore": entry.total_score,
            "maxScore": {51: 10, 52: 10, 53: 30, 54: 50}[entry.type_slot],
            "creditCost": entry.credit_cost, "chargedCredits": entry.credit_cost if entry.status == "succeeded" else 0,
            "error": entry.error_code, "createdAt": entry.created_at.isoformat(),
            "completedAt": entry.completed_at.isoformat() if entry.completed_at else None}
    if detail:
        data.update(answer=entry.answer, question=entry.question_snapshot, result=entry.result)
        data["usage"] = evaluation_usage(entry.user_id, entry.set_id)[str(entry.type_slot)]
    return data
