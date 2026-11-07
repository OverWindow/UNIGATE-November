from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("pbt", "0005_pbt_listening_passage_timing")]

    operations = [
        migrations.AddField(
            model_name="attemptitem",
            name="selected_order",
            field=models.JSONField(null=True, blank=True),
        ),
    ]
