import uuid

from django.conf import settings
from django.db import models


CREDIT_PURCHASE_QUANTITY = 1000


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
    set_id = models.UUIDField(null=True)
    kind = models.CharField(max_length=10, choices=[("grant", "지급"), ("reserve", "예약"), ("capture", "차감"), ("release", "예약 해제"), ("welcome", "신규 가입 지급"), ("unlock", "세트 열람"), ("purchase", "유료 충전")])
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
            models.UniqueConstraint(fields=["account", "set_id"], condition=models.Q(kind="unlock"), name="credit_set_unlock_unique"),
            models.UniqueConstraint(fields=["account"], condition=models.Q(kind="welcome"), name="credit_welcome_unique"),
            models.CheckConstraint(condition=(
                models.Q(kind="grant", evaluation__isnull=True, actor__isnull=False, set_id__isnull=True)
                | models.Q(kind__in=["reserve", "capture", "release"], evaluation__isnull=False, actor__isnull=True, set_id__isnull=True)
                | models.Q(kind="welcome", evaluation__isnull=True, actor__isnull=True, set_id__isnull=True, amount=100)
                | models.Q(kind="unlock", evaluation__isnull=True, actor__isnull=True, set_id__isnull=False, amount=100)
                | models.Q(kind="purchase", evaluation__isnull=True, actor__isnull=True, set_id__isnull=True, amount=CREDIT_PURCHASE_QUANTITY)
            ), name="credit_transaction_source"),
        ]


class CreditPurchase(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, models.PROTECT)
    attempt_id = models.UUIDField()
    stripe_price_id = models.CharField(max_length=255, null=True)
    amount = models.PositiveIntegerField()
    currency = models.CharField(max_length=3, default="krw")
    credits = models.PositiveIntegerField(default=CREDIT_PURCHASE_QUANTITY)
    status = models.CharField(max_length=10, default="pending", choices=[
        ("pending", "결제 대기"), ("fulfilled", "적립 완료"), ("expired", "만료"),
    ])
    stripe_session_id = models.CharField(max_length=255, unique=True, null=True)
    transaction = models.OneToOneField(CreditTransaction, models.PROTECT, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "credit_purchases"
        constraints = [
            models.UniqueConstraint(fields=["user", "attempt_id"], name="credit_purchase_attempt_unique"),
            models.CheckConstraint(condition=(
                models.Q(status="fulfilled", transaction__isnull=False, stripe_session_id__isnull=False)
                | models.Q(status__in=["pending", "expired"], transaction__isnull=True)
            ), name="credit_purchase_fulfillment"),
        ]
