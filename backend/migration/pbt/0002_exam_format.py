from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("pbt", "0001_initial")]

    operations = [
        migrations.AddField(
            model_name="exam", name="exam_format",
            field=models.CharField(choices=[("pbt", "PBT"), ("ibt", "IBT")], default="pbt", max_length=3),
        ),
        migrations.AddField(
            model_name="attempt", name="exam_format",
            field=models.CharField(choices=[("pbt", "PBT"), ("ibt", "IBT")], default="pbt", max_length=3),
        ),
        migrations.RemoveConstraint(model_name="exam", name="pbt_guest_slot_unique"),
        migrations.AddConstraint(
            model_name="exam",
            constraint=models.UniqueConstraint(fields=("exam_format", "section", "guest_slot"), name="exam_format_guest_slot_unique"),
        ),
        migrations.AddConstraint(
            model_name="exam",
            constraint=models.CheckConstraint(condition=models.Q(exam_format__in=["pbt", "ibt"]), name="exam_format_valid"),
        ),
        migrations.AddConstraint(
            model_name="attempt",
            constraint=models.CheckConstraint(condition=models.Q(exam_format__in=["pbt", "ibt"]), name="attempt_exam_format_valid"),
        ),
    ]
