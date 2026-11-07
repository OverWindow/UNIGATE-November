from django.db.models import Q
from django.utils import timezone

from .models import AttemptItem
from .result_delivery import feedback_state, has_result_access
from .sentence_order import choice_order


def owner_filter(request):
    owner = Q(user_id=request.user.pk) if request.user.is_authenticated else Q(pk__in=[])
    guest = request.session.get("pbt_guest_id")
    if guest:
        owner |= Q(user__isnull=True, guest_id=guest)
    return owner


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
    attempt.score = sum(item.points for item in items if item.is_correct)
    if attempt.exam_format == "ibt":
        correct = sum(item.is_correct for item in items)
        attempt.score = (correct * 100 + len(items) // 2) // len(items) if items else 0
    attempt.save(update_fields=["status", "timed_out", "submitted_at", "score"])


def attempt_data(attempt, include_items=False, results=False, request=None):
    allowed = request is not None and has_result_access(request, attempt)
    results = results and allowed
    data = {"id": str(attempt.pk), "examId": str(attempt.exam_id), "title": attempt.title,
            "examFormat": attempt.exam_format,
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
        for item in attempt.items.all():
            question = {**item.snapshot, "position": item.position, "selectedOption": item.selected_option}
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
