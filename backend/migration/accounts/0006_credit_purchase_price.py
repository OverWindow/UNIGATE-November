from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("accounts", "0005_credit_purchases")]

    operations = [
        migrations.AddField(
            model_name="creditpurchase",
            name="stripe_price_id",
            field=models.CharField(max_length=255, null=True),
        ),
        migrations.AlterField(
            model_name="creditpurchase",
            name="amount",
            field=models.PositiveIntegerField(),
        ),
    ]
