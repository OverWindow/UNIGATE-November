from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("question_bank", "0007_vocabulary_languages")]

    # Hub already owns this table; only register Django's read mapping.
    operations = [
        migrations.CreateModel(
            name="VocabularyQuestion",
            fields=[
                ("question_id", models.BigIntegerField(primary_key=True, serialize=False)),
                ("vocabulary_id", models.BigIntegerField()),
                ("question_type", models.TextField()),
                ("position", models.SmallIntegerField()),
                ("instruction", models.TextField()),
                ("stem", models.TextField()),
                ("choices", models.JSONField()),
                ("correct_answer", models.SmallIntegerField()),
                ("accepted_answers", models.JSONField()),
                ("explanation", models.TextField()),
                ("provider", models.TextField()),
                ("model", models.TextField()),
                ("generation_id", models.UUIDField()),
                ("source_hash", models.TextField()),
                ("created_at", models.DateTimeField()),
                ("updated_at", models.DateTimeField()),
            ],
            options={"managed": False, "db_table": '\"topik_bank\".\"vocabulary_questions\"'},
        ),
    ]
