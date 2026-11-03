from django.db.models import Q
from django.utils import timezone

from .models import AttemptItem


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
        item.is_correct = item.selected_option == item.correct_answer
    AttemptItem.objects.bulk_update(items, ["is_correct"])
    attempt.status = "submitted"
    attempt.timed_out = expired
    attempt.submitted_at = attempt.expires_at if expired else timezone.now()
    attempt.score = sum(item.points for item in items if item.is_correct)
    attempt.save(update_fields=["status", "timed_out", "submitted_at", "score"])


def attempt_data(attempt, include_items=False, results=False):
    data = {"id": str(attempt.pk), "examId": str(attempt.exam_id), "title": attempt.title,
            "section": attempt.section, "mode": attempt.mode, "status": attempt.status,
            "startedAt": attempt.started_at.isoformat(),
            "expiresAt": attempt.expires_at.isoformat() if attempt.expires_at else None,
            "submittedAt": attempt.submitted_at.isoformat() if attempt.submitted_at else None,
            "timedOut": attempt.timed_out, "score": attempt.score, "maxScore": 100,
            "serverNow": timezone.now().isoformat()}
    if include_items:
        data["items"] = []
        for item in attempt.items.all():
            question = {**item.snapshot, "position": item.position, "selectedOption": item.selected_option}
            if results:
                question.update(correctAnswer=item.correct_answer, explanation=item.explanation,
                                transcript=item.transcript, isCorrect=item.is_correct, points=item.points)
            data["items"].append(question)
    return data
