from django.db import models


class KoreanDictionarySense(models.Model):
    headword = models.TextField()
    homonym_number = models.PositiveSmallIntegerField(default=0)
    part_of_speech = models.CharField(max_length=30, blank=True)
    entry_type = models.CharField(max_length=16, choices=[
        ("word", "단어"), ("phrase", "구"), ("expression", "문법 표현"),
        ("proverb", "속담"), ("idiom", "관용구"),
    ])
    sense_order = models.PositiveIntegerField()
    definition = models.TextField()
    translations = models.JSONField(default=dict)
    examples = models.TextField(blank=True)
    metadata = models.JSONField(default=dict)
    source_file = models.CharField(max_length=255)
    source_row = models.PositiveIntegerField()

    class Meta:
        db_table = "korean_dictionary_senses"
        indexes = [models.Index(fields=["headword", "part_of_speech", "entry_type"], name="krdict_lookup_idx")]
        constraints = [
            models.UniqueConstraint(fields=["source_file", "source_row"], name="krdict_source_unique"),
            models.CheckConstraint(condition=models.Q(sense_order__gte=1), name="krdict_sense_order_valid"),
            models.CheckConstraint(condition=models.Q(source_row__gte=2), name="krdict_source_row_valid"),
        ]


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
