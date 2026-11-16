from contextlib import contextmanager

from django.db import connection, transaction

from .models import CreditAccount, CreditTransaction


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


def record(account, kind, amount, *, evaluation=None, actor=None, reason="", entry_id=None):
    account.save(update_fields=["balance", "reserved", "updated_at"])
    fields = {"id": entry_id} if entry_id else {}
    return CreditTransaction.objects.create(
        **fields, account=account, evaluation=evaluation, kind=kind, amount=amount,
        balance_after=account.balance, reserved_after=account.reserved, actor=actor, reason=reason,
    )


def reserve(account, evaluation):
    amount = evaluation.credit_cost
    if account.balance - account.reserved < amount:
        raise CreditError("insufficient_credits")
    account.reserved += amount
    if amount:
        record(account, "reserve", amount, evaluation=evaluation)


def settle(evaluation, *, success):
    amount = evaluation.credit_cost
    if not amount:
        return
    account = locked_account(evaluation.user_id)
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
