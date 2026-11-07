from django.db import models


class VocabularySet(models.Model):
    topik_level = models.PositiveSmallIntegerField()
    set_number = models.PositiveIntegerField()

    class Meta:
        db_table = "vocabulary_sets"
        ordering = ["topik_level", "set_number"]
        constraints = [
            models.UniqueConstraint(fields=["topik_level", "set_number"], name="vocabulary_level_set_unique"),
            models.CheckConstraint(condition=models.Q(topik_level__range=(3, 6)), name="vocabulary_set_level_valid"),
            models.CheckConstraint(condition=models.Q(set_number__gte=1), name="vocabulary_set_number_valid"),
        ]


class VocabularySetItem(models.Model):
    set = models.ForeignKey(VocabularySet, models.CASCADE, related_name="items")
    # Hub owns the source lifecycle; validate these IDs without constraining its writes.
    vocabulary_id = models.PositiveBigIntegerField(unique=True)
    position = models.PositiveSmallIntegerField()

    class Meta:
        db_table = "vocabulary_set_items"
        ordering = ["position"]
        constraints = [
            models.UniqueConstraint(fields=["set", "position"], name="vocabulary_set_position_unique"),
            models.CheckConstraint(condition=models.Q(position__range=(1, 20)), name="vocabulary_position_valid"),
        ]
