from django.db import migrations, models


def backfill_answered_count(apps, schema_editor):
    Attempt = apps.get_model("pbt", "Attempt")
    AttemptItem = apps.get_model("pbt", "AttemptItem")
    alias = schema_editor.connection.alias
    items = AttemptItem.objects.using(alias).only("attempt_id", "snapshot", "selected_option", "selected_order")
    attempts = Attempt.objects.using(alias).only("pk").order_by("pk").prefetch_related(
        models.Prefetch("items", queryset=items))
    batch = []
    for attempt in attempts.iterator(chunk_size=500):
        count = 0
        for item in attempt.items.all():
            if item.snapshot.get("answerMode") == "sentence_order":
                order = item.selected_order
                answered = (isinstance(order, list) and len(order) == 4
                    and all(isinstance(value, str) for value in order) and set(order) == set("가나다라"))
            else:
                answered = item.selected_option is not None
            count += answered
        attempt.answered_count = count
        batch.append(attempt)
        if len(batch) == 500:
            Attempt.objects.using(alias).bulk_update(batch, ["answered_count"], batch_size=500)
            batch.clear()
    if batch:
        Attempt.objects.using(alias).bulk_update(batch, ["answered_count"], batch_size=500)


class Migration(migrations.Migration):
    dependencies = [("pbt", "0006_attemptitem_selected_order")]

    operations = [
        migrations.AddField(
            model_name="attempt",
            name="answered_count",
            field=models.PositiveSmallIntegerField(default=0),
        ),
        migrations.RunPython(backfill_answered_count, migrations.RunPython.noop),
    ]
