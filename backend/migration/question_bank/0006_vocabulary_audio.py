from django.db import migrations, models


BASE_FIELDS = (
    "vocabulary_id", "korean", "part_of_speech", "english", "vietnamese", "japanese",
    "example_korean", "example_english", "topik_level",
)
AUDIO_TYPES = {
    "audio_storage_bucket": "text", "audio_storage_path": "text", "audio_file_sha256": "text",
    "audio_byte_size": "integer", "audio_duration_ms": "integer", "audio_source_hash": "text",
    "audio_generation_config": "jsonb", "audio_created_at": "timestamp with time zone",
}

# Match Hub 014 exactly; its transfer checks column order and constraint definitions.
UPGRADE_SQL = r"""
ALTER TABLE topik_bank.vocabulary
    ADD COLUMN IF NOT EXISTS audio_storage_bucket TEXT,
    ADD COLUMN IF NOT EXISTS audio_storage_path TEXT,
    ADD COLUMN IF NOT EXISTS audio_file_sha256 TEXT,
    ADD COLUMN IF NOT EXISTS audio_byte_size INTEGER,
    ADD COLUMN IF NOT EXISTS audio_duration_ms INTEGER,
    ADD COLUMN IF NOT EXISTS audio_source_hash TEXT,
    ADD COLUMN IF NOT EXISTS audio_generation_config JSONB,
    ADD COLUMN IF NOT EXISTS audio_created_at TIMESTAMPTZ;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
        WHERE conrelid='topik_bank.vocabulary'::regclass AND conname='vocabulary_audio_complete') THEN
        ALTER TABLE topik_bank.vocabulary ADD CONSTRAINT vocabulary_audio_complete CHECK (
            num_nonnulls(audio_storage_bucket, audio_storage_path, audio_file_sha256,
                audio_byte_size, audio_duration_ms, audio_source_hash,
                audio_generation_config, audio_created_at) = 0
            OR (
                num_nonnulls(audio_storage_bucket, audio_storage_path, audio_file_sha256,
                    audio_byte_size, audio_duration_ms, audio_source_hash,
                    audio_generation_config, audio_created_at) = 8
                AND btrim(audio_storage_bucket) <> '' AND btrim(audio_storage_path) <> ''
                AND audio_file_sha256 ~ '^[a-f0-9]{64}$'
                AND audio_source_hash ~ '^[a-f0-9]{64}$'
                AND audio_byte_size > 0 AND audio_duration_ms > 0
                AND jsonb_typeof(audio_generation_config) = 'object'
            )
        );
    END IF;
END $$;
"""

EXPECTED_CONSTRAINT = " ".join("""
CHECK (((num_nonnulls(audio_storage_bucket, audio_storage_path, audio_file_sha256,
audio_byte_size, audio_duration_ms, audio_source_hash, audio_generation_config, audio_created_at) = 0)
OR ((num_nonnulls(audio_storage_bucket, audio_storage_path, audio_file_sha256,
audio_byte_size, audio_duration_ms, audio_source_hash, audio_generation_config, audio_created_at) = 8)
AND (btrim(audio_storage_bucket) <> ''::text) AND (btrim(audio_storage_path) <> ''::text)
AND (audio_file_sha256 ~ '^[a-f0-9]{64}$'::text) AND (audio_source_hash ~ '^[a-f0-9]{64}$'::text)
AND (audio_byte_size > 0) AND (audio_duration_ms > 0)
AND (jsonb_typeof(audio_generation_config) = 'object'::text))))
""".split())


def columns(cursor):
    cursor.execute("""SELECT a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attidentity,
        pg_get_expr(d.adbin,d.adrelid) FROM pg_attribute a
        LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
        WHERE a.attrelid='topik_bank.vocabulary'::regclass AND a.attnum>0 AND NOT a.attisdropped
        ORDER BY a.attnum""")
    return cursor.fetchall()


def apply_schema(apps, schema_editor):
    with schema_editor.connection.cursor() as cursor:
        cursor.execute("SELECT to_regclass('topik_bank.vocabulary')")
        # Hub provisions missing source tables, including their identity and constraints.
        if cursor.fetchone()[0] is None:
            return
        cursor.execute("LOCK TABLE topik_bank.vocabulary IN ACCESS EXCLUSIVE MODE")
        base = [(name, "bigint" if name == "vocabulary_id" else "smallint" if name == "topik_level" else "text",
                 True, "a" if name == "vocabulary_id" else "", "''::text" if name == "part_of_speech" else None)
                for name in BASE_FIELDS]
        expected = base + [(name, kind, False, "", None) for name, kind in AUDIO_TYPES.items()]
        if columns(cursor) not in (base, expected):
            raise RuntimeError("Incompatible vocabulary columns; check the Hub schema before migrating.")
        schema_editor.execute(UPGRADE_SQL, params=None)
        cursor.execute("""SELECT pg_get_constraintdef(oid),convalidated FROM pg_constraint
            WHERE conrelid='topik_bank.vocabulary'::regclass AND conname='vocabulary_audio_complete'""")
        constraint = cursor.fetchone()
        if (columns(cursor) != expected or constraint is None or not constraint[1]
                or " ".join(constraint[0].split()) != EXPECTED_CONSTRAINT):
            raise RuntimeError("Incompatible vocabulary audio constraint; check the Hub schema before migrating.")


class Migration(migrations.Migration):
    dependencies = [("question_bank", "0005_vocabulary")]

    # Reversing would delete transferred audio metadata; restore a backup instead.
    operations = [
        migrations.RunPython(apply_schema),
        migrations.SeparateDatabaseAndState(state_operations=[
            migrations.AddField(model_name="vocabulary", name="audio_storage_bucket", field=models.TextField(null=True)),
            migrations.AddField(model_name="vocabulary", name="audio_storage_path", field=models.TextField(null=True)),
            migrations.AddField(model_name="vocabulary", name="audio_file_sha256", field=models.TextField(null=True)),
            migrations.AddField(model_name="vocabulary", name="audio_byte_size", field=models.IntegerField(null=True)),
            migrations.AddField(model_name="vocabulary", name="audio_duration_ms", field=models.IntegerField(null=True)),
            migrations.AddField(model_name="vocabulary", name="audio_source_hash", field=models.TextField(null=True)),
            migrations.AddField(model_name="vocabulary", name="audio_generation_config", field=models.JSONField(null=True)),
            migrations.AddField(model_name="vocabulary", name="audio_created_at", field=models.DateTimeField(null=True)),
        ]),
    ]
