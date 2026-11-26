import uuid

from django.conf import settings
from django.db import models


CREDIT_PURCHASE_QUANTITY = 1000
PLAN_BONUS = 400
PLAN_AMOUNTS = {1: 9900, 3: 23900, 6: 43900}
OPEN_SUBSCRIPTION_STATES = ("checkout", "trialing", "active", "ending", "past_due")


class GoogleIdentity(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, primary_key=True)
    google_sub = models.CharField(max_length=255, unique=True)


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
    stripe_customer_id = models.CharField(max_length=255, unique=True, null=True, editable=False)
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
    refund_purchase = models.ForeignKey("CreditPurchase", models.PROTECT, null=True, related_name="refund_entries")
    kind = models.CharField(max_length=10, choices=[("grant", "지급"), ("reserve", "예약"), ("capture", "차감"), ("release", "예약 해제"), ("welcome", "신규 가입 지급"), ("unlock", "세트 열람"), ("purchase", "유료 충전"), ("plan_bonus", "플랜 지급"), ("refund", "환불 차감"), ("restore", "환불 복원")])
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
            models.CheckConstraint(condition=(models.Q(refund_purchase__isnull=True) & (
                models.Q(kind="grant", evaluation__isnull=True, actor__isnull=False, set_id__isnull=True)
                | models.Q(kind__in=["reserve", "capture", "release"], evaluation__isnull=False, actor__isnull=True, set_id__isnull=True)
                | models.Q(kind="welcome", evaluation__isnull=True, actor__isnull=True, set_id__isnull=True, amount=100)
                | models.Q(kind="unlock", evaluation__isnull=True, actor__isnull=True, set_id__isnull=False, amount=100)
                | models.Q(kind="purchase", evaluation__isnull=True, actor__isnull=True, set_id__isnull=True, amount=CREDIT_PURCHASE_QUANTITY)
                | models.Q(kind="plan_bonus", evaluation__isnull=True, actor__isnull=True, set_id__isnull=True, amount=PLAN_BONUS)
            )) | models.Q(kind__in=["refund", "restore"], refund_purchase__isnull=False, amount__gt=0,
                          evaluation__isnull=True, actor__isnull=True, set_id__isnull=True),
                name="credit_transaction_source"),
        ]


class CreditPurchase(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, models.PROTECT)
    attempt_id = models.UUIDField()
    stripe_price_id = models.CharField(max_length=255, null=True)
    amount = models.PositiveIntegerField()
    currency = models.CharField(max_length=3, default="krw")
    credits = models.PositiveIntegerField(default=CREDIT_PURCHASE_QUANTITY)
    plan_months = models.PositiveSmallIntegerField(null=True)
    credited_months = models.PositiveSmallIntegerField(null=True)
    plan_starts_at = models.DateTimeField(null=True)
    plan_ends_at = models.DateTimeField(null=True)
    status = models.CharField(max_length=10, default="pending", choices=[
        ("pending", "결제 대기"), ("fulfilled", "적립 완료"), ("expired", "만료"),
    ])
    stripe_session_id = models.CharField(max_length=255, unique=True, null=True)
    stripe_payment_intent_id = models.CharField(max_length=255, unique=True, null=True)
    pending_refund_credits = models.PositiveIntegerField(default=0)
    remaining_credits = models.PositiveIntegerField(null=True)
    refund_attempt_id = models.UUIDField(null=True, editable=False)
    refund_review_required = models.BooleanField(default=False)
    refund_sources = models.JSONField(default=list, editable=False)
    stripe_subscription_id = models.CharField(max_length=255, unique=True, null=True)
    subscription_state = models.CharField(max_length=12, null=True)
    stripe_invoice_id = models.CharField(max_length=255, unique=True, null=True)
    transaction = models.OneToOneField(CreditTransaction, models.PROTECT, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "credit_purchases"
        constraints = [
            models.UniqueConstraint(fields=["user", "attempt_id"], name="credit_purchase_attempt_unique"),
            models.UniqueConstraint(fields=["user"], condition=models.Q(subscription_state__in=OPEN_SUBSCRIPTION_STATES),
                                    name="one_open_plus_subscription"),
            models.CheckConstraint(condition=(
                models.Q(plan_months__isnull=True, plan_starts_at__isnull=True, plan_ends_at__isnull=True)
                | (models.Q(plan_months__isnull=False, plan_months__in=list(PLAN_AMOUNTS), credits=PLAN_BONUS) & (
                    models.Q(status="fulfilled", plan_starts_at__isnull=False, plan_ends_at__isnull=False,
                             plan_ends_at__gt=models.F("plan_starts_at"))
                    | models.Q(status__in=["pending", "expired"], plan_starts_at__isnull=True, plan_ends_at__isnull=True)
                ))
            ), name="credit_purchase_plan_period"),
            models.CheckConstraint(condition=(
                (models.Q(status="fulfilled", transaction__isnull=False) &
                 (models.Q(stripe_session_id__isnull=False) | models.Q(stripe_invoice_id__isnull=False, plan_months__isnull=False)))
                | models.Q(status="fulfilled", stripe_invoice_id__isnull=False, plan_months__isnull=False,
                           transaction__isnull=True, credited_months__isnull=False, credited_months=0)
                | models.Q(status__in=["pending", "expired"], transaction__isnull=True)
            ), name="credit_purchase_fulfillment"),
        ]


class PlusFreeTrial(models.Model):
    purchase = models.OneToOneField(CreditPurchase, models.PROTECT, primary_key=True, related_name="free_trial")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, models.PROTECT)
    card_fingerprint_digest = models.CharField(max_length=64, blank=True, default="")
    status = models.CharField(max_length=12, default="setup", choices=[
        ("setup", "카드 등록 대기"), ("consent", "동의 대기"), ("reserved", "구독 생성 중"),
        ("started", "체험 시작"), ("rejected", "중복 거절"), ("closed", "신청 종료"),
    ])
    consented_at = models.DateTimeField(null=True)
    consent_version = models.CharField(max_length=64, blank=True, default="")
    agreed_trial_ends_at = models.DateTimeField(null=True)
    started_at = models.DateTimeField(null=True)
    ends_at = models.DateTimeField(null=True)

    class Meta:
        db_table = "plus_free_trials"
        constraints = [
            models.UniqueConstraint(fields=["user"], condition=models.Q(status__in=["reserved", "started"]),
                                    name="plus_trial_user_once"),
            models.UniqueConstraint(fields=["card_fingerprint_digest"], condition=models.Q(status__in=["reserved", "started"]),
                                    name="plus_trial_card_once"),
            models.CheckConstraint(condition=~models.Q(status__in=["reserved", "started"]) | (
                ~models.Q(card_fingerprint_digest="") & ~models.Q(consent_version="") &
                models.Q(consented_at__isnull=False, agreed_trial_ends_at__gt=models.F("consented_at"),
                         agreed_trial_ends_at__isnull=False)), name="plus_trial_consent"),
            models.CheckConstraint(condition=~models.Q(status="started") | models.Q(
                started_at__isnull=False, ends_at__isnull=False, ends_at__gt=models.F("started_at"),
                ends_at=models.F("agreed_trial_ends_at")), name="plus_trial_period"),
        ]


class CreditPurchaseRefund(models.Model):
    stripe_refund_id = models.CharField(max_length=255, primary_key=True)
    purchase = models.ForeignKey(CreditPurchase, models.PROTECT, related_name="refunds")
    amount = models.PositiveIntegerField()
    currency = models.CharField(max_length=3)
    status = models.CharField(max_length=32)

    class Meta:
        db_table = "credit_purchase_refunds"
