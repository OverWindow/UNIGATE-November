from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("question_bank", "0008_vocabulary_questions")]

    # Existing Hub tables: register mappings without creating or altering tables.
    operations = [
        migrations.CreateModel(
            name="WritingSet",
            fields=[
                ("set_id", models.UUIDField(primary_key=True, serialize=False)),
                ("source_key", models.TextField()),
                ("exam_format", models.TextField()),
                ("provider", models.TextField()),
                ("model", models.TextField()),
                ("created_at", models.DateTimeField()),
                ("updated_at", models.DateTimeField()),
            ],
            options={"managed": False, "db_table": '"topik_bank"."writing_sets"'},
        ),
        migrations.CreateModel(
            name="WritingQuestion",
            fields=[
                ("pk", models.CompositePrimaryKey("set_id", "type_slot", blank=True, editable=False, primary_key=True, serialize=False)),
                ("set_id", models.UUIDField()),
                ("type_slot", models.SmallIntegerField()),
                ("source_generated_id", models.BigIntegerField()),
                ("content_json", models.JSONField()),
            ],
            options={"managed": False, "db_table": '"topik_bank"."writing_questions"'},
        ),
    ]
