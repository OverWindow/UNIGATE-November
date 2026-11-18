from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("writing", "0001_initial")]

    operations = [
        migrations.AddField(
            model_name="evaluation",
            name="feedback_language",
            field=models.CharField(max_length=2, default="ko",
                choices=[("ko", "한국어"), ("en", "English"), ("id", "Bahasa Indonesia")]),
        ),
    ]
