from django.db import migrations


# Hub 010 schema changes run only through Django's migration transaction.
UPGRADE_SQL = r"""
ALTER TABLE topik_bank.items ADD COLUMN IF NOT EXISTS exam_format TEXT NOT NULL DEFAULT 'pbt';
ALTER TABLE topik_bank.question_sets ADD COLUMN IF NOT EXISTS exam_format TEXT NOT NULL DEFAULT 'pbt';

DO $$
DECLARE constraint_row RECORD;
BEGIN
    FOR constraint_row IN
        SELECT conname FROM pg_constraint
        WHERE conrelid='topik_bank.question_sets'::regclass AND contype='u'
          AND pg_get_constraintdef(oid)='UNIQUE (section, generator_provider, generator_model, generator_version, set_sequence)'
    LOOP
        EXECUTE format('ALTER TABLE topik_bank.question_sets DROP CONSTRAINT %I', constraint_row.conname);
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='topik_bank.question_sets'::regclass AND conname='question_sets_exam_sequence_key') THEN
        ALTER TABLE topik_bank.question_sets ADD CONSTRAINT question_sets_exam_sequence_key
            UNIQUE (exam_format,section,generator_provider,generator_model,generator_version,set_sequence);
        ALTER TABLE topik_bank.question_sets ADD CONSTRAINT question_sets_exam_id_key UNIQUE (set_id,exam_format);
        ALTER TABLE topik_bank.question_sets ADD CONSTRAINT question_sets_exam_format_check CHECK (exam_format IN ('pbt','ibt'));
        ALTER TABLE topik_bank.items ADD CONSTRAINT items_exam_format_check CHECK (exam_format IN ('pbt','ibt'));
        ALTER TABLE topik_bank.items ADD CONSTRAINT items_ibt_slots_check
            CHECK (exam_format <> 'ibt' OR (type_slot BETWEEN 1 AND 30 AND (position IS NULL OR position BETWEEN 1 AND 30)));
        ALTER TABLE topik_bank.items ADD CONSTRAINT items_set_exam_fk
            FOREIGN KEY (set_id,exam_format) REFERENCES topik_bank.question_sets(set_id,exam_format);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS items_exam_lookup_idx ON topik_bank.items(exam_format,section,item_type,target_level,review_status);

CREATE OR REPLACE VIEW topik_bank.current_items AS SELECT i.created_at AS item_created_at,i.* FROM topik_bank.items i;
CREATE OR REPLACE VIEW topik_bank.current_set_contents AS
SELECT s.set_id,s.section AS set_section,s.generator_provider AS set_generator_provider,
       s.generator_model AS set_generator_model,s.generator_version AS set_generator_version,
       s.review_status AS set_review_status,s.default_target_level,s.published_at,
       i.position,i.source_key,i.item_id,i.content_hash,i.type_slot,i.item_type,i.primary_skill,
       i.target_level,i.review_status AS item_review_status,i.stem,i.choices,i.correct_answer,
       i.explanation,i.content_json,i.source_provenance,s.set_sequence,
       s.exam_format AS set_exam_format,i.exam_format
FROM topik_bank.question_sets s JOIN topik_bank.items i ON i.set_id=s.set_id;
"""


def apply_schema(apps, schema_editor):
    with schema_editor.connection.cursor() as cursor:
        cursor.execute("SELECT table_name FROM information_schema.tables "
                       "WHERE table_schema='topik_bank' AND table_type='BASE TABLE'")
        tables = {row[0] for row in cursor.fetchall()}
    # Hub 011 consumers no longer have question_set_item_audio_bindings.
    required = {"question_sets", "items", "tts_audio_assets", "item_audio_bindings", "item_visual_assets"}
    # A fresh database receives the current consumer schema from Hub initialization.
    if not tables:
        return
    if not required.issubset(tables):
        raise RuntimeError("Incomplete topik_bank schema; check Hub initialization before migrating.")
    # Preserve PostgreSQL format() tokens such as %I; there are no bind parameters.
    schema_editor.execute(UPGRADE_SQL, params=None)


class Migration(migrations.Migration):
    dependencies = [("question_bank", "0002_exam_format")]

    operations = [migrations.RunPython(apply_schema)]
