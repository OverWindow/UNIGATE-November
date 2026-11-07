"""Consumer mappings. Hub owns the topik_bank schema and all question writes."""
from django.db import models


class Vocabulary(models.Model):
    vocabulary_id = models.BigIntegerField(primary_key=True)
    korean = models.TextField()
    part_of_speech = models.TextField()
    english = models.TextField()
    vietnamese = models.TextField()
    japanese = models.TextField()
    example_korean = models.TextField()
    example_english = models.TextField()
    topik_level = models.SmallIntegerField()
    audio_storage_bucket = models.TextField(null=True)
    audio_storage_path = models.TextField(null=True)
    audio_file_sha256 = models.TextField(null=True)
    audio_byte_size = models.IntegerField(null=True)
    audio_duration_ms = models.IntegerField(null=True)
    audio_source_hash = models.TextField(null=True)
    audio_generation_config = models.JSONField(null=True)
    audio_created_at = models.DateTimeField(null=True)
    chinese_simplified = models.TextField(blank=True, default="", db_default="")
    indonesian = models.TextField(blank=True, default="", db_default="")

    class Meta:
        managed = False
        db_table = '"topik_bank"."vocabulary"'


class QuestionSet(models.Model):
    set_id = models.UUIDField(primary_key=True)
    exam_format = models.TextField(default="pbt", choices=[("pbt", "PBT"), ("ibt", "IBT")])
    section = models.TextField()
    generator_provider = models.TextField()
    generator_model = models.TextField()
    generator_version = models.TextField()
    created_at = models.DateTimeField()
    set_sequence = models.IntegerField()
    review_status = models.TextField()
    default_target_level = models.SmallIntegerField()
    published_at = models.DateTimeField()

    class Meta:
        managed = False
        db_table = '"topik_bank"."question_sets"'


class Item(models.Model):
    item_id = models.UUIDField(primary_key=True)
    exam_format = models.TextField(default="pbt", choices=[("pbt", "PBT"), ("ibt", "IBT")])
    source_key = models.TextField(unique=True)
    created_at = models.DateTimeField()
    section = models.TextField()
    type_slot = models.SmallIntegerField()
    item_type = models.TextField()
    primary_skill = models.TextField()
    target_level = models.SmallIntegerField()
    stem_length = models.IntegerField()
    choice_count = models.IntegerField()
    generator_provider = models.TextField()
    generator_model = models.TextField()
    generator_version = models.TextField()
    prompt_version = models.CharField(max_length=64)
    review_status = models.TextField()
    stem = models.TextField()
    choices = models.JSONField()
    correct_answer = models.SmallIntegerField(null=True)
    explanation = models.TextField()
    content_json = models.JSONField()
    source_provenance = models.JSONField()
    content_hash = models.CharField(max_length=64)
    updated_at = models.DateTimeField()
    set = models.ForeignKey(QuestionSet, models.DO_NOTHING, db_column="set_id", null=True, related_name="items")
    position = models.SmallIntegerField(null=True)

    class Meta:
        managed = False
        db_table = '"topik_bank"."items"'


class AudioAsset(models.Model):
    audio_asset_id = models.UUIDField(primary_key=True)
    source_hash = models.CharField(max_length=64)
    provider = models.TextField()
    model_name = models.TextField()
    language_code = models.TextField()
    female_voice = models.TextField()
    male_voice = models.TextField()
    mime_type = models.TextField()
    storage_bucket = models.TextField()
    storage_path = models.TextField()
    storage_url = models.TextField()
    byte_size = models.IntegerField()
    duration_ms = models.IntegerField(null=True)
    created_by = models.UUIDField(null=True)
    created_at = models.DateTimeField()
    tts_style = models.JSONField()
    deleted_at = models.DateTimeField(null=True)
    narration_version = models.TextField()
    script_snapshot = models.JSONField(null=True)
    storage_backend = models.TextField()
    file_sha256 = models.CharField(max_length=64, null=True)

    class Meta:
        managed = False
        db_table = '"topik_bank"."tts_audio_assets"'


class ItemAudioBinding(models.Model):
    binding_id = models.UUIDField(primary_key=True)
    item = models.ForeignKey(Item, models.DO_NOTHING, db_column="item_id", related_name="audio_bindings")
    content_hash = models.CharField(max_length=64, null=True)
    audio_asset = models.ForeignKey(AudioAsset, models.DO_NOTHING, db_column="audio_asset_id", related_name="item_bindings")
    source_hash = models.CharField(max_length=64)
    is_current = models.BooleanField()
    created_at = models.DateTimeField()
    origin_set_id = models.UUIDField(null=True)
    origin_position = models.SmallIntegerField(null=True)

    class Meta:
        managed = False
        db_table = '"topik_bank"."item_audio_bindings"'


class VisualAsset(models.Model):
    visual_asset_id = models.UUIDField(primary_key=True)
    item = models.ForeignKey(Item, models.DO_NOTHING, db_column="item_id", related_name="visual_assets")
    content_hash = models.CharField(max_length=64)
    option_number = models.SmallIntegerField()
    visual_role = models.TextField()
    storage_bucket = models.TextField()
    storage_path = models.TextField()
    storage_url = models.TextField()
    mime_type = models.TextField()
    byte_size = models.IntegerField()
    created_by = models.UUIDField(null=True)
    is_current = models.BooleanField()
    created_at = models.DateTimeField()
    storage_backend = models.TextField()
    file_sha256 = models.CharField(max_length=64, null=True)

    class Meta:
        managed = False
        db_table = '"topik_bank"."item_visual_assets"'
