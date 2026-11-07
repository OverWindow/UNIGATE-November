from datetime import timedelta

from django.db import migrations, models


def remove_active_deadlines(apps, schema_editor):
    apps.get_model("pbt", "Attempt").objects.using(schema_editor.connection.alias).filter(
        exam_format="pbt", section="listening", mode="timed", status="in_progress",
    ).update(expires_at=None)


def restore_deadlines(apps, schema_editor):
    # Submitted attempts created under the new rule also need a deadline on rollback.
    apps.get_model("pbt", "Attempt").objects.using(schema_editor.connection.alias).filter(
        exam_format="pbt", section="listening", mode="timed", expires_at__isnull=True,
    ).update(expires_at=models.F("started_at") + timedelta(minutes=60))


class Migration(migrations.Migration):
    dependencies = [("pbt", "0004_ibt_listening_passage_timing")]

    operations = [
        migrations.RemoveConstraint(model_name="attempt", name="pbt_attempt_deadline"),
        migrations.AddConstraint(
            model_name="attempt",
            constraint=models.CheckConstraint(
                condition=(models.Q(mode="practice", expires_at__isnull=True)
                           | models.Q(mode="timed", expires_at__isnull=False)
                           | models.Q(mode="timed", section="listening")),
                name="pbt_attempt_deadline",
            ),
        ),
        migrations.RunPython(remove_active_deadlines, restore_deadlines),
    ]
