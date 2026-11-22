from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("accounts", "0010_recurring_plus")]

    operations = [
        migrations.AddField(
            model_name="creditpurchase",
            name="credited_months",
            field=models.PositiveSmallIntegerField(null=True),
        ),
        migrations.RemoveConstraint(model_name="creditpurchase", name="credit_purchase_fulfillment"),
        migrations.AddConstraint(
            model_name="creditpurchase",
            constraint=models.CheckConstraint(condition=(
                (models.Q(status="fulfilled", transaction__isnull=False) &
                 (models.Q(stripe_session_id__isnull=False) | models.Q(stripe_invoice_id__isnull=False, plan_months__isnull=False)))
                | models.Q(status="fulfilled", stripe_invoice_id__isnull=False, plan_months__isnull=False,
                           transaction__isnull=True, credited_months__isnull=False, credited_months=0)
                | models.Q(status__in=["pending", "expired"], transaction__isnull=True)
            ), name="credit_purchase_fulfillment"),
        ),
    ]
