from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("pbt", "0007_attempt_answered_count")]

    operations = [
        migrations.AddField(
            model_name="attempt",
            name="timed_session_token_hash",
            field=models.CharField(blank=True, default="", editable=False, max_length=64),
        ),
    ]
