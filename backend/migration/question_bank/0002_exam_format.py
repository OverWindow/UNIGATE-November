from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("question_bank", "0001_initial")]

    # Record model state; 0003 applies the consumer database schema.
    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name=name,
                    name="exam_format",
                    field=models.TextField(default="pbt", choices=[("pbt", "PBT"), ("ibt", "IBT")]),
                )
                for name in ("questionset", "item")
            ],
        ),
    ]
