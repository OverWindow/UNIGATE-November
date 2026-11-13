from django.db.models import Q
from django.utils import timezone

from .bank import load_set
from .formats import EXAM_FORMATS
from .models import AttemptItem
from .result_delivery import feedback_state, has_result_access
from .sentence_order import choice_order, valid_selected_order


def owner_filter(request):
    owner = Q(user_id=request.user.pk) if request.user.is_authenticated else Q(pk__in=[])
    guest = request.session.get("pbt_guest_id")
    if guest:
        owner |= Q(user__isnull=True, guest_id=guest)
    return owner


def is_answered(item):
    if item.snapshot.get("answerMode") == "sentence_order":
        return valid_selected_order(item.selected_order) and None not in item.selected_order
    return item.selected_option is not None


def display_items(attempt):
    items = list(attempt.items.all())
    count = EXAM_FORMATS[attempt.exam_format]["question_count"]
    # Legacy attempts keep their complete, unmarked snapshots.
    if len(items) == count or any(not item.snapshot.get("_answerOnly") for item in items):
        return items
    saved = {item.position: item for item in items}
    questions = load_set(attempt.exam.source_set_id, attempt.section, attempt.exam_format)
    return [saved[q["position"]] if q["position"] in saved else AttemptItem(
        attempt=attempt, is_correct=False if attempt.status == "submitted" else None, **q,
    ) for q in questions]


def finalize(attempt, force=False):
    # Call with the attempt row locked; answer writes use the same lock.
    expired = attempt.expires_at is not None and timezone.now() >= attempt.expires_at
    if attempt.status != "in_progress" or not (force or expired):
        return
    items = list(attempt.items.all())
    for item in items:
        if item.snapshot.get("answerMode") == "sentence_order":
            item.is_correct = item.selected_order == choice_order(item.snapshot["choices"][item.correct_answer - 1])
        else:
            item.is_correct = item.selected_option == item.correct_answer
    AttemptItem.objects.bulk_update(items, ["is_correct"])
    attempt.status = "submitted"
    attempt.timed_out = expired
    attempt.submitted_at = attempt.expires_at if expired else timezone.now()
    attempt.answered_count = sum(is_answered(item) for item in items)
    attempt.score = sum(item.points for item in items if item.is_correct)
    if attempt.exam_format == "ibt":
        correct = sum(item.is_correct for item in items)
        count = EXAM_FORMATS[attempt.exam_format]["question_count"]
        attempt.score = (correct * 100 + count // 2) // count
    attempt.save(update_fields=["status", "timed_out", "submitted_at", "score", "answered_count"])


def attempt_data(attempt, include_items=False, results=False, request=None):
    allowed = request is not None and has_result_access(request, attempt)
    results = results and allowed
    data = {"id": str(attempt.pk), "examId": str(attempt.exam_id), "title": attempt.title,
            "examFormat": attempt.exam_format, "answeredCount": attempt.answered_count,
            "section": attempt.section, "mode": attempt.mode, "status": attempt.status,
            "startedAt": attempt.started_at.isoformat(),
            "expiresAt": attempt.expires_at.isoformat() if attempt.expires_at else None,
            "submittedAt": attempt.submitted_at.isoformat() if attempt.submitted_at else None,
            "timedOut": attempt.timed_out, "score": attempt.score if allowed else None, "maxScore": 100,
            "guestAttempt": attempt.user_id is None, "resultAccess": allowed,
            "serverNow": timezone.now().isoformat()}
    if attempt.user_id is None and not results:
        data["feedback"] = feedback_state(attempt)
    if include_items:
        data["items"] = []
        for item in display_items(attempt):
            question = {**item.snapshot, "position": item.position, "selectedOption": item.selected_option}
            question.pop("_answerOnly", None)
            if item.snapshot.get("answerMode") == "sentence_order":
                # Keep the original multiple-choice permutations only in the server snapshot.
                question.update(choices=[], passage="", selectedOrder=item.selected_order or [None] * 4)
                if results:
                    question["correctOrder"] = choice_order(item.snapshot["choices"][item.correct_answer - 1])
            if results:
                question.update(correctAnswer=item.correct_answer, explanation=item.explanation,
                                transcript=item.transcript, isCorrect=item.is_correct, points=item.points)
            data["items"].append(question)
    return data
