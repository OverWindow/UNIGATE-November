from django.db import migrations, models


# Keep IDs, history and current-link priority identical to Hub 011.
UPGRADE_SQL = r"""
LOCK TABLE topik_bank.items, topik_bank.tts_audio_assets,
    topik_bank.item_audio_bindings, topik_bank.question_set_item_audio_bindings
    IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE legacy_item_audio ON COMMIT DROP AS
    SELECT * FROM topik_bank.item_audio_bindings;
CREATE TEMP TABLE legacy_set_audio ON COMMIT DROP AS
    SELECT b.*, i.item_id, i.content_hash
    FROM topik_bank.question_set_item_audio_bindings b
    LEFT JOIN topik_bank.items i USING (set_id, position);

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM legacy_set_audio WHERE item_id IS NULL) THEN
        RAISE EXCEPTION 'An audio binding has no matching item; migration cancelled.';
    END IF;
END $$;

ALTER TABLE topik_bank.item_audio_bindings
    ADD COLUMN binding_id UUID,
    ADD COLUMN origin_set_id UUID,
    ADD COLUMN origin_position SMALLINT,
    DROP CONSTRAINT item_audio_bindings_pkey;
ALTER TABLE topik_bank.item_audio_bindings ALTER COLUMN content_hash DROP NOT NULL;
DROP INDEX topik_bank.item_audio_current_hash_idx;

UPDATE topik_bank.item_audio_bindings SET
    binding_id=md5('item_audio:' || item_id::text || ':' || content_hash || ':' || audio_asset_id::text)::uuid,
    is_current=false;
ALTER TABLE topik_bank.item_audio_bindings
    ALTER COLUMN binding_id SET DEFAULT gen_random_uuid(),
    ALTER COLUMN binding_id SET NOT NULL,
    ADD PRIMARY KEY (binding_id);

INSERT INTO topik_bank.item_audio_bindings
    (binding_id,item_id,content_hash,audio_asset_id,source_hash,is_current,created_at,origin_set_id,origin_position)
SELECT md5('set_audio:' || b.set_id::text || ':' || b.position::text || ':' || b.audio_asset_id::text)::uuid,
    b.item_id, CASE WHEN b.is_current AND a.deleted_at IS NULL THEN b.content_hash END,
    b.audio_asset_id,b.source_hash,b.is_current AND a.deleted_at IS NULL,b.created_at,b.set_id,b.position
FROM legacy_set_audio b JOIN topik_bank.tts_audio_assets a USING (audio_asset_id);

UPDATE topik_bank.item_audio_bindings b SET is_current=true
FROM legacy_item_audio old, topik_bank.items i, topik_bank.tts_audio_assets a
WHERE b.origin_set_id IS NULL AND b.item_id=old.item_id
    AND b.content_hash=old.content_hash AND b.audio_asset_id=old.audio_asset_id
    AND i.item_id=b.item_id AND i.content_hash=b.content_hash
    AND a.audio_asset_id=b.audio_asset_id AND a.deleted_at IS NULL AND old.is_current
    AND NOT EXISTS (SELECT 1 FROM topik_bank.item_audio_bindings current
                    WHERE current.item_id=b.item_id AND current.is_current);

ALTER TABLE topik_bank.item_audio_bindings
    ADD CONSTRAINT item_audio_current_hash_check CHECK (NOT is_current OR content_hash IS NOT NULL),
    ADD CONSTRAINT item_audio_origin_check CHECK ((origin_set_id IS NULL) = (origin_position IS NULL)),
    ADD CONSTRAINT item_audio_origin_position_check CHECK (origin_position > 0);
CREATE UNIQUE INDEX item_audio_current_idx ON topik_bank.item_audio_bindings(item_id) WHERE is_current;
CREATE INDEX item_audio_item_idx ON topik_bank.item_audio_bindings(item_id);
CREATE INDEX item_audio_asset_idx ON topik_bank.item_audio_bindings(audio_asset_id,is_current);

DO $$ BEGIN
    IF (SELECT count(*) FROM topik_bank.item_audio_bindings) <>
       (SELECT count(*) FROM legacy_item_audio) + (SELECT count(*) FROM legacy_set_audio)
    OR EXISTS (
        SELECT item_id,content_hash,audio_asset_id,source_hash,created_at FROM legacy_item_audio
        EXCEPT ALL
        SELECT item_id,content_hash,audio_asset_id,source_hash,created_at
        FROM topik_bank.item_audio_bindings WHERE origin_set_id IS NULL
    ) OR EXISTS (
        SELECT item_id,audio_asset_id,source_hash,created_at,set_id,position FROM legacy_set_audio
        EXCEPT ALL
        SELECT item_id,audio_asset_id,source_hash,created_at,origin_set_id,origin_position
        FROM topik_bank.item_audio_bindings WHERE origin_set_id IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'Audio binding history verification failed; migration cancelled.';
    END IF;
END $$;

-- RESTRICT rolls back the migration if external objects still depend on this table.
DROP TABLE topik_bank.question_set_item_audio_bindings;
"""


def validate_unified_schema(cursor):
    cursor.execute("""SELECT column_name, udt_name, character_maximum_length, is_nullable
        FROM information_schema.columns
        WHERE table_schema='topik_bank' AND table_name='item_audio_bindings'""")
    columns = {name: (kind, length, nullable) for name, kind, length, nullable in cursor.fetchall()}
    expected = {
        "binding_id": ("uuid", None, "NO"),
        "item_id": ("uuid", None, "NO"),
        "content_hash": ("bpchar", 64, "YES"),
        "audio_asset_id": ("uuid", None, "NO"),
        "source_hash": ("bpchar", 64, "NO"),
        "is_current": ("bool", None, "NO"),
        "created_at": ("timestamptz", None, "NO"),
        "origin_set_id": ("uuid", None, "YES"),
        "origin_position": ("int2", None, "YES"),
    }
    cursor.execute("""SELECT pg_get_constraintdef(oid) FROM pg_constraint
        WHERE conrelid='topik_bank.item_audio_bindings'::regclass AND convalidated""")
    constraints = {row[0] for row in cursor.fetchall()}
    required_constraints = {
        "PRIMARY KEY (binding_id)",
        "FOREIGN KEY (item_id) REFERENCES topik_bank.items(item_id)",
        "FOREIGN KEY (audio_asset_id) REFERENCES topik_bank.tts_audio_assets(audio_asset_id)",
        "CHECK (((NOT is_current) OR (content_hash IS NOT NULL)))",
        "CHECK (((origin_set_id IS NULL) = (origin_position IS NULL)))",
        "CHECK ((origin_position > 0))",
    }
    cursor.execute("""SELECT indisunique, pg_get_indexdef(indexrelid) FROM pg_index
        WHERE indrelid='topik_bank.item_audio_bindings'::regclass AND indisvalid AND indisready""")
    indexes = {(unique, definition.split(" USING ", 1)[1]) for unique, definition in cursor.fetchall()}
    required_indexes = {
        (True, "btree (item_id) WHERE is_current"),
        (False, "btree (item_id)"),
        (False, "btree (audio_asset_id, is_current)"),
    }
    if (any(columns.get(name) != definition for name, definition in expected.items())
            or not required_constraints.issubset(constraints) or not required_indexes.issubset(indexes)):
        raise RuntimeError("Incomplete Hub 011 audio schema; verify columns, constraints and indexes before retrying.")


def apply_schema(apps, schema_editor):
    with schema_editor.connection.cursor() as cursor:
        cursor.execute("SELECT table_name FROM information_schema.tables "
                       "WHERE table_schema='topik_bank' AND table_type='BASE TABLE'")
        tables = {row[0] for row in cursor.fetchall()}
        # Empty banks are initialized by Hub, including all constraints and views.
        if not tables:
            return
        required = {"question_sets", "items", "tts_audio_assets", "item_audio_bindings", "item_visual_assets"}
        if not required.issubset(tables):
            raise RuntimeError("Incomplete topik_bank schema; check Hub initialization before migrating.")
        if "question_set_item_audio_bindings" in tables:
            cursor.execute("""SELECT column_name FROM information_schema.columns
                WHERE table_schema='topik_bank' AND table_name='item_audio_bindings'
                AND column_name IN ('binding_id', 'origin_set_id', 'origin_position')""")
            if cursor.fetchall():
                raise RuntimeError("Mixed legacy and Hub 011 audio schema; restore a consistent schema before retrying.")
            schema_editor.execute(UPGRADE_SQL, params=None)
        validate_unified_schema(cursor)


class Migration(migrations.Migration):
    dependencies = [("question_bank", "0003_apply_exam_format_schema")]

    # History conversion is irreversible; rollback requires a pre-migration backup.
    operations = [
        migrations.RunPython(apply_schema),
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.RemoveField(model_name="itemaudiobinding", name="pk"),
                migrations.AddField(model_name="itemaudiobinding", name="binding_id",
                                    field=models.UUIDField(primary_key=True, serialize=False)),
                migrations.AlterField(model_name="itemaudiobinding", name="content_hash",
                                      field=models.CharField(max_length=64, null=True)),
                migrations.AddField(model_name="itemaudiobinding", name="origin_set_id", field=models.UUIDField(null=True)),
                migrations.AddField(model_name="itemaudiobinding", name="origin_position", field=models.SmallIntegerField(null=True)),
                migrations.DeleteModel(name="SetItemAudioBinding"),
            ],
        ),
    ]
