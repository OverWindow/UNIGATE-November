import uuid

from django.conf import settings
from django.db import models


class RateLimit(models.Model):
    scope = models.CharField(max_length=64)
    key_hash = models.CharField(max_length=64)
    attempts = models.PositiveIntegerField()
    expires_at = models.DateTimeField(db_index=True)

    class Meta:
        db_table = "accounts_rate_limit"
        constraints = [
            models.UniqueConstraint(fields=("scope", "key_hash"), name="accounts_rate_limit_scope_key_unique"),
            models.CheckConstraint(condition=models.Q(attempts__gte=1), name="accounts_rate_limit_attempts_positive"),
        ]


class CreditAccount(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, models.PROTECT, primary_key=True)
    balance = models.PositiveBigIntegerField(default=0)
    reserved = models.PositiveBigIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "credit_accounts"
        constraints = [models.CheckConstraint(condition=models.Q(balance__gte=models.F("reserved")), name="credit_reserve_within_balance")]


class CreditTransaction(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    account = models.ForeignKey(CreditAccount, models.PROTECT)
    evaluation = models.ForeignKey("writing.Evaluation", models.PROTECT, null=True)
    kind = models.CharField(max_length=10, choices=[("grant", "지급"), ("reserve", "예약"), ("capture", "차감"), ("release", "예약 해제")])
    amount = models.PositiveIntegerField()
    balance_after = models.PositiveBigIntegerField()
    reserved_after = models.PositiveBigIntegerField()
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, models.PROTECT, null=True, related_name="credit_grants")
    reason = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "credit_transactions"
        indexes = [models.Index(fields=["account", "-created_at"])]
        constraints = [
            models.UniqueConstraint(fields=["evaluation", "kind"], name="credit_evaluation_event_unique"),
            models.CheckConstraint(condition=(
                models.Q(kind="grant", evaluation__isnull=True, actor__isnull=False)
                | models.Q(kind__in=["reserve", "capture", "release"], evaluation__isnull=False, actor__isnull=True)
            ), name="credit_transaction_source"),
        ]
