from django.db.models import Count, Q
from django.utils import timezone

from accounts.models import CreditTransaction

from .models import Evaluation


QUESTION_PRICES = {51: 20, 52: 20, 53: 30, 54: 30}
SET_COST = sum(QUESTION_PRICES.values())
EVALUATION_LIMIT = 20


def has_access(user_id, set_id):
    return CreditTransaction.objects.filter(account_id=user_id, set_id=set_id, kind="unlock").exists()


def evaluation_usage(user_id, set_id):
    rows = Evaluation.objects.filter(user_id=user_id, set_id=set_id).values("type_slot").annotate(
        used=Count("id", filter=Q(status="succeeded")),
        pending=Count("id", filter=Q(status="processing", expires_at__gt=timezone.now())),
    )
    counts = {row["type_slot"]: row for row in rows}
    result = {}
    for slot in QUESTION_PRICES:
        row = counts.get(slot, {"used": 0, "pending": 0})
        result[str(slot)] = {"used": row["used"], "pending": row["pending"], "limit": EVALUATION_LIMIT,
                             "remaining": max(0, EVALUATION_LIMIT - row["used"] - row["pending"])}
    return result
