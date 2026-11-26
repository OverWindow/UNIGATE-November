from calendar import monthrange

from django.db.models import Max
from django.utils import timezone

from .models import OPEN_SUBSCRIPTION_STATES, CreditPurchase, PlusFreeTrial


def paid_plans():
    return CreditPurchase.objects.filter(status="fulfilled", plan_months__isnull=False).exclude(subscription_state="revoked").exclude(refunds__status="succeeded")


def active_plans(user_id, at):
    return paid_plans().filter(user_id=user_id, plan_starts_at__lte=at, plan_ends_at__gt=at)


def active_trials(user_id, at):
    return PlusFreeTrial.objects.filter(user_id=user_id, status="started", started_at__lte=at, ends_at__gt=at,
                                        purchase__subscription_state__in=("trialing", "ending"))


def has_active_plan(user_id):
    now = timezone.now()
    paid = active_plans(user_id, now).values_list("pk")
    trials = active_trials(user_id, now).values_list("pk")
    return paid.union(trials, all=True).exists()


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
    rows = list(periods.values_list("plan_starts_at", "plan_ends_at", "plan_months"))
    if rows and rows[0][0] <= now:
        return rows[0][2], extend_plan_end(rows[0][1], ((start, end) for start, end, _ in rows[1:]))
    trial_end = active_trials(user_id, now).values_list("ends_at", flat=True).first()
    if trial_end is None:
        return None, None
    return 1, extend_plan_end(trial_end, ((start, end) for start, end, _ in rows))


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
