from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("accounts", "0006_credit_purchase_price")]

    operations = [
        migrations.AddField(
            model_name="creditaccount",
            name="stripe_customer_id",
            field=models.CharField(max_length=255, unique=True, null=True, editable=False),
        ),
    ]
