from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0013_paid_credit_allocation"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]
    operations = [
        migrations.RemoveConstraint("creditpurchase", "one_open_plus_subscription"),
        migrations.AddConstraint("creditpurchase", models.UniqueConstraint(
            fields=["user"], condition=models.Q(subscription_state__in=("checkout", "trialing", "active", "ending", "past_due")),
            name="one_open_plus_subscription")),
        migrations.CreateModel(
            name="PlusFreeTrial",
            fields=[
                ("purchase", models.OneToOneField(to="accounts.creditpurchase", on_delete=models.PROTECT,
                    primary_key=True, serialize=False, related_name="free_trial")),
                ("user", models.ForeignKey(to=settings.AUTH_USER_MODEL, on_delete=models.PROTECT)),
                ("card_fingerprint_digest", models.CharField(max_length=64, blank=True, default="")),
                ("status", models.CharField(max_length=12, default="setup", choices=[
                    ("setup", "카드 등록 대기"), ("consent", "동의 대기"), ("reserved", "구독 생성 중"),
                    ("started", "체험 시작"), ("rejected", "중복 거절"), ("closed", "신청 종료"),
                ])),
                ("consented_at", models.DateTimeField(null=True)),
                ("consent_version", models.CharField(max_length=64, blank=True, default="")),
                ("agreed_trial_ends_at", models.DateTimeField(null=True)),
                ("started_at", models.DateTimeField(null=True)),
                ("ends_at", models.DateTimeField(null=True)),
            ],
            options={
                "db_table": "plus_free_trials",
                "constraints": [
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
                ],
            },
        ),
    ]
