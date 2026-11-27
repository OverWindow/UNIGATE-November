from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("accounts", "0014_plus_free_trials")]
    operations = [
        migrations.AddField(
            model_name="creditpurchase",
            name="ga_client_id",
            field=models.CharField(editable=False, max_length=41, null=True),
        ),
    ]
