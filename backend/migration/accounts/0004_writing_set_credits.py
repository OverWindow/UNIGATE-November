from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("accounts", "0003_creditaccount_credittransaction")]

    operations = [
        migrations.AddField(
            model_name="credittransaction", name="set_id", field=models.UUIDField(null=True),
        ),
        migrations.AlterField(
            model_name="credittransaction", name="kind",
            field=models.CharField(max_length=10, choices=[("grant", "지급"), ("reserve", "예약"),
                ("capture", "차감"), ("release", "예약 해제"), ("welcome", "신규 가입 지급"), ("unlock", "세트 열람")]),
        ),
        migrations.RemoveConstraint(model_name="credittransaction", name="credit_transaction_source"),
        migrations.AddConstraint(
            model_name="credittransaction",
            constraint=models.CheckConstraint(condition=(
                models.Q(kind="grant", evaluation__isnull=True, actor__isnull=False, set_id__isnull=True)
                | models.Q(kind__in=["reserve", "capture", "release"], evaluation__isnull=False, actor__isnull=True, set_id__isnull=True)
                | models.Q(kind="welcome", evaluation__isnull=True, actor__isnull=True, set_id__isnull=True, amount=100)
                | models.Q(kind="unlock", evaluation__isnull=True, actor__isnull=True, set_id__isnull=False, amount=100)
            ), name="credit_transaction_source"),
        ),
        migrations.AddConstraint(
            model_name="credittransaction",
            constraint=models.UniqueConstraint(fields=["account", "set_id"], condition=models.Q(kind="unlock"), name="credit_set_unlock_unique"),
        ),
        migrations.AddConstraint(
            model_name="credittransaction",
            constraint=models.UniqueConstraint(fields=["account"], condition=models.Q(kind="welcome"), name="credit_welcome_unique"),
        ),
    ]
