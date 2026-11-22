from contextlib import contextmanager

from django.db import connection, transaction
from django.db.models import F
from django.utils import timezone

from .models import CreditAccount, CreditTransaction
from .plans import add_calendar_months, paid_plans


class CreditError(Exception):
    pass


@contextmanager
def evaluation_lock():
    # Shared across Gunicorn processes; never held while calling BizRouter.
    with transaction.atomic():
        with connection.cursor() as cursor:
            cursor.execute("SET LOCAL lock_timeout = '2s'")
            cursor.execute("SELECT pg_advisory_xact_lock(2026111751)")
        yield


def locked_account(user_id):
    CreditAccount.objects.get_or_create(user_id=user_id)
    return CreditAccount.objects.select_for_update().get(user_id=user_id)


def record(account, kind, amount, *, evaluation=None, actor=None, reason="", entry_id=None, set_id=None):
    account.save(update_fields=["balance", "reserved", "updated_at"])
    fields = {"id": entry_id} if entry_id else {}
    return CreditTransaction.objects.create(
        **fields, account=account, evaluation=evaluation, kind=kind, amount=amount,
        balance_after=account.balance, reserved_after=account.reserved, actor=actor, reason=reason, set_id=set_id,
    )


def due_plan_months(user_id, now):
    # Include expired receipts so earned credits survive a long absence.
    receipts = paid_plans().filter(user_id=user_id, plan_starts_at__lte=now,
                                   credited_months__lt=F("plan_months")).order_by("plan_starts_at", "pk")
    for receipt in receipts:
        start = timezone.localtime(receipt.plan_starts_at)
        credited = receipt.credited_months
        while credited < receipt.plan_months:
            due = add_calendar_months(start, credited)
            if due > now or due >= receipt.plan_ends_at:
                break
            credited += 1
        if credited > receipt.credited_months:
            yield receipt, credited


@transaction.atomic
def account_with_monthly_credits(user_id, *, for_update=False):
    if not for_update and not any(due_plan_months(user_id, timezone.now())):
        account, _ = CreditAccount.objects.get_or_create(user_id=user_id)
        return account
    account = locked_account(user_id)
    # Another reader may have posted the installments while we waited for the wallet.
    for receipt, months_due in due_plan_months(user_id, timezone.now()):
        for month_index in range(receipt.credited_months, months_due):
            account.balance += receipt.credits
            entry = record(account, "plan_bonus", receipt.credits)
            if month_index == 0:
                receipt.transaction = entry
        receipt.credited_months = months_due
        receipt.save(update_fields=["credited_months", "transaction"])
    return account


def welcome(user_id):
    # Only the successful signup transaction calls this; existing accounts get no bonus.
    with evaluation_lock():
        account = locked_account(user_id)
        if CreditTransaction.objects.filter(account=account, kind="welcome").exists():
            return
        account.balance += 100
        record(account, "welcome", 100)


def settle(evaluation, *, success):
    amount = evaluation.credit_cost
    if not amount:
        return
    account = account_with_monthly_credits(evaluation.user_id, for_update=True)
    account.reserved -= amount
    if success:
        account.balance -= amount
    record(account, "capture" if success else "release", amount, evaluation=evaluation)


def grant(*, user_id, amount, actor, reason, entry_id):
    if type(amount) is not int or not 1 <= amount <= 1_000_000 or not reason.strip():
        raise CreditError("invalid_grant")
    with evaluation_lock():
        existing = CreditTransaction.objects.filter(pk=entry_id).first()
        if existing:
            if (existing.kind, existing.account_id, existing.amount, existing.actor_id, existing.reason) != (
                "grant", user_id, amount, actor.pk, reason.strip(),
            ):
                raise CreditError("grant_conflict")
            return existing
        account = locked_account(user_id)
        if account.balance + amount > 9_000_000_000_000:
            raise CreditError("balance_limit")
        account.balance += amount
        return record(account, "grant", amount, actor=actor, reason=reason.strip(), entry_id=entry_id)


def balance_data(account):
    return {"balance": account.balance, "reserved": account.reserved,
            "available": account.balance - account.reserved}
