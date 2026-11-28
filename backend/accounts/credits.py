from contextlib import contextmanager

from django.db import connection, transaction
from django.db.models import F, Q, Sum
from django.utils import timezone

from .credit_allocation import debit_sources, exclude_reservations, restore_sources
from .models import CreditAccount, CreditPurchase, CreditTransaction
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


def record(account, kind, amount, *, evaluation=None, actor=None, reason="", entry_id=None, set_id=None,
           refund_purchase=None):
    if kind in {"capture", "unlock", "refund", "restore"}:
        allocate_transaction(account, kind, amount, refund_purchase)
    account.save(update_fields=["balance", "reserved", "updated_at"])
    fields = {"id": entry_id} if entry_id else {}
    return CreditTransaction.objects.create(
        **fields, account=account, evaluation=evaluation, kind=kind, amount=amount,
        balance_after=account.balance, reserved_after=account.reserved, actor=actor, reason=reason, set_id=set_id,
        refund_purchase=refund_purchase,
    )


def allocate_transaction(account, kind, amount, purchase):
    if kind == "restore":
        parts = restore_sources(amount, purchase.refund_sources)
    else:
        lots = CreditPurchase.objects.filter(user_id=account.pk, remaining_credits__gt=0).order_by(
            "transaction__created_at", "pk").values_list("pk", "remaining_credits", "refund_attempt_id")
        paid = {}
        other_balance = account.balance + amount  # record() receives the post-debit wallet.
        reserved = account.reserved
        for order_id, remaining, hold in lots:
            other_balance -= remaining
            if hold is None:
                paid[str(order_id)] = remaining
            else:
                reserved -= remaining
        if kind != "capture":
            other_balance -= exclude_reservations(paid, reserved)
        parts = debit_sources(amount, paid, refund_order=str(purchase.pk) if purchase else None,
                              other_balance=other_balance)
        if purchase:
            purchase.refund_sources.extend(parts)
    for order_id, quantity in parts:
        if order_id:
            change = quantity if kind == "restore" else -quantity
            CreditPurchase.objects.filter(pk=order_id).update(remaining_credits=F("remaining_credits") + change)
    if purchase:
        purchase.save(update_fields=["refund_sources"])


def collect_pending_refunds(account):
    # Reconcile legacy pending deductions once, forgiving any unavailable balance.
    pending = CreditPurchase.objects.filter(user_id=account.pk, pending_refund_credits__gt=0).order_by("created_at", "pk")
    for purchase in pending:
        reconcile_purchase_refunds(account, purchase, previous_refunded=0)


def refund_credit_adjustment(account, purchase, refunded, previous_refunded):
    if refunded > purchase.amount:
        raise ValueError("Refunds exceed purchase amount")
    # Legacy plans with no installment counter received a single bonus.
    installments = purchase.credited_months if purchase.credited_months is not None else 1
    credits = purchase.credits * installments
    target = credits * refunded // purchase.amount
    entries = purchase.refund_entries.aggregate(
        debited=Sum("amount", filter=Q(kind="refund"), default=0),
        restored=Sum("amount", filter=Q(kind="restore"), default=0),
    )
    difference = target - (entries["debited"] - entries["restored"])
    if difference <= 0:
        return difference
    if previous_refunded is None:
        return 0
    # A newly successful refund never collects a previously forgiven shortfall.
    previous_target = credits * previous_refunded // purchase.amount
    return min(difference, max(0, target - previous_target), max(0, account.balance - account.reserved))


def reconcile_purchase_refunds(account, purchase, *, previous_refunded=None):
    if purchase.status != "fulfilled" or not purchase.refunds.exists():
        return
    refunded = purchase.refunds.filter(status="succeeded").aggregate(total=Sum("amount", default=0))["total"]
    change = refund_credit_adjustment(account, purchase, refunded, previous_refunded)
    if change:
        account.balance -= change
        record(account, "refund" if change > 0 else "restore", abs(change), refund_purchase=purchase)
    purchase.pending_refund_credits = 0
    purchase.save(update_fields=["pending_refund_credits"])



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
    if (not for_update and not any(due_plan_months(user_id, timezone.now()))
            and not CreditPurchase.objects.filter(user_id=user_id, pending_refund_credits__gt=0).exists()):
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
        reconcile_purchase_refunds(account, receipt)
    collect_pending_refunds(account)
    return account


def welcome(user_id):
    # Only the successful signup transaction calls this; existing accounts get no bonus.
    with evaluation_lock():
        account = locked_account(user_id)
        if CreditTransaction.objects.filter(account=account, kind="welcome").exists():
            return
        account.balance += 100
        record(account, "welcome", 100)
        collect_pending_refunds(account)


def settle(evaluation, *, success):
    amount = evaluation.credit_cost
    if not amount:
        return
    account = account_with_monthly_credits(evaluation.user_id, for_update=True)
    account.reserved -= amount
    if success:
        account.balance -= amount
    record(account, "capture" if success else "release", amount, evaluation=evaluation)
    if not success:
        collect_pending_refunds(account)


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
        entry = record(account, "grant", amount, actor=actor, reason=reason.strip(), entry_id=entry_id)
        collect_pending_refunds(account)
        return entry


def balance_data(account):
    return {"balance": account.balance, "reserved": account.reserved,
            "available": account.balance - account.reserved}
