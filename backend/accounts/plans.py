from calendar import monthrange

from django.db.models import Max
from django.utils import timezone

from .models import OPEN_SUBSCRIPTION_STATES, CreditPurchase


def paid_plans():
    return CreditPurchase.objects.filter(status="fulfilled", plan_months__isnull=False).exclude(subscription_state="revoked").exclude(refunds__status="succeeded")


def active_plans(user_id, at):
    return paid_plans().filter(user_id=user_id, plan_starts_at__lte=at, plan_ends_at__gt=at)


def has_active_plan(user_id):
    return active_plans(user_id, timezone.now()).exists()


def extend_plan_end(until, periods):
    # Periods are ordered by start time. A gap ends the current entitlement.
    for start, end in periods:
        if start > until:
            break
        until = max(until, end)
    return until


def current_plan(user_id):
    now = timezone.now()
    periods = paid_plans().filter(user_id=user_id, plan_ends_at__gt=now).order_by("plan_starts_at", "pk")
    rows = iter(periods.values_list("plan_starts_at", "plan_ends_at", "plan_months"))
    first = next(rows, None)
    if first is None or first[0] > now:
        return None, None
    _, first_end, months = first
    return months, extend_plan_end(first_end, ((start, end) for start, end, _ in rows))


def current_plan_end(user_id):
    return current_plan(user_id)[1]


def open_subscription(user_id):
    return CreditPurchase.objects.filter(user_id=user_id, subscription_state__in=OPEN_SUBSCRIPTION_STATES).first()


def add_calendar_months(start, count):
    year_offset, month_index = divmod(start.month - 1 + count, 12)
    year, month = start.year + year_offset, month_index + 1
    return start.replace(year=year, month=month, day=min(start.day, monthrange(year, month)[1]))


def assign_plan_period(purchase, paid_at):
    # The caller holds the wallet lock, including when two different orders settle at once.
    last_end = paid_plans().filter(user_id=purchase.user_id).aggregate(end=Max("plan_ends_at"))["end"]
    start = timezone.localtime(max(paid_at, last_end) if last_end else paid_at)
    purchase.plan_starts_at = start
    purchase.plan_ends_at = add_calendar_months(start, purchase.plan_months)
