from calendar import monthrange

from django.db.models import Max, Min
from django.utils import timezone

from .models import CreditPurchase


def paid_plans(user_id):
    return CreditPurchase.objects.filter(user_id=user_id, status="fulfilled", plan_months__isnull=False)


def has_active_plan(user_id):
    now = timezone.now()
    return paid_plans(user_id).filter(plan_starts_at__lte=now, plan_ends_at__gt=now).exists()


def current_plan_end(user_id):
    now = timezone.now()
    periods = paid_plans(user_id).filter(plan_ends_at__gt=now).aggregate(start=Min("plan_starts_at"), end=Max("plan_ends_at"))
    # Extensions are contiguous with the last purchased period.
    return periods["end"] if periods["start"] and periods["start"] <= now else None


def assign_plan_period(purchase, paid_at):
    # The caller holds the wallet lock, including when two different orders settle at once.
    last_end = paid_plans(purchase.user_id).aggregate(end=Max("plan_ends_at"))["end"]
    start = timezone.localtime(max(paid_at, last_end) if last_end else paid_at)
    year_offset, month_index = divmod(start.month - 1 + purchase.plan_months, 12)
    year, month = start.year + year_offset, month_index + 1
    purchase.plan_starts_at = start
    purchase.plan_ends_at = start.replace(year=year, month=month, day=min(start.day, monthrange(year, month)[1]))
