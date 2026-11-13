"""Exercise Hub schema upgrades only in Django's disposable PostgreSQL test DB."""
import hashlib
import io
import json
import uuid

from django.core.management import call_command
from django.db import DatabaseError, IntegrityError, connection, transaction
from django.db.migrations.loader import MigrationLoader
from django.db.migrations.exceptions import IrreversibleError
from django.test import TransactionTestCase
from django.utils import timezone

from pbt.models import Attempt, AttemptItem, Exam
from ..models import AudioAsset, Item, ItemAudioBinding, QuestionSet, VisualAsset


# Frozen Hub consumer schema before 010/011; no sibling checkout is needed by tests.
LEGACY_SCHEMA = r"""
-- Empty consumer databases only. Authoring/deployment history is not transferred.
CREATE SCHEMA IF NOT EXISTS topik_bank;

CREATE TABLE topik_bank.question_sets (
    set_id UUID PRIMARY KEY,
    section TEXT NOT NULL CHECK (section IN ('reading','listening','writing')),
    generator_provider TEXT NOT NULL, generator_model TEXT NOT NULL, generator_version TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    set_sequence INTEGER NOT NULL CHECK (set_sequence >= 1),
    review_status TEXT NOT NULL DEFAULT 'reviewed'
        CHECK (review_status IN ('pending_review','reviewed','pilot','active','retired')),
    default_target_level SMALLINT NOT NULL CHECK (default_target_level BETWEEN 1 AND 6),
    published_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (section,generator_provider,generator_model,generator_version,set_sequence)
);
CREATE TABLE topik_bank.items (
    item_id UUID PRIMARY KEY, source_key TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    section TEXT NOT NULL CHECK (section IN ('reading','listening','writing')),
    type_slot SMALLINT NOT NULL CHECK (type_slot BETWEEN 1 AND 50), item_type TEXT NOT NULL,
    primary_skill TEXT NOT NULL CHECK (btrim(primary_skill) <> ''),
    target_level SMALLINT NOT NULL CHECK (target_level BETWEEN 1 AND 6),
    stem_length INTEGER NOT NULL CHECK (stem_length >= 0),
    choice_count INTEGER NOT NULL CHECK (choice_count >= 0),
    generator_provider TEXT NOT NULL, generator_model TEXT NOT NULL, generator_version TEXT NOT NULL,
    prompt_version CHAR(64) NOT NULL,
    review_status TEXT NOT NULL DEFAULT 'reviewed'
        CHECK (review_status IN ('pending_review','reviewed','pilot','active','retired')),
    stem TEXT NOT NULL, choices JSONB NOT NULL, correct_answer SMALLINT,
    explanation TEXT NOT NULL DEFAULT '', content_json JSONB NOT NULL,
    source_provenance JSONB NOT NULL, content_hash CHAR(64) NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    set_id UUID REFERENCES topik_bank.question_sets(set_id),
    position SMALLINT CHECK (position BETWEEN 1 AND 50),
    UNIQUE (set_id,position), CHECK ((set_id IS NULL) = (position IS NULL))
);
CREATE INDEX items_lookup_idx ON topik_bank.items(section,item_type,target_level,review_status);
CREATE INDEX items_slot_idx ON topik_bank.items(section,generator_version,type_slot);

CREATE TABLE topik_bank.tts_audio_assets (
    audio_asset_id UUID PRIMARY KEY, source_hash CHAR(64) NOT NULL,
    provider TEXT NOT NULL DEFAULT 'google_cloud_tts', model_name TEXT NOT NULL,
    language_code TEXT NOT NULL DEFAULT 'ko-KR', female_voice TEXT NOT NULL, male_voice TEXT NOT NULL,
    mime_type TEXT NOT NULL DEFAULT 'audio/mpeg', storage_bucket TEXT NOT NULL,
    storage_path TEXT NOT NULL, storage_url TEXT NOT NULL,
    byte_size INTEGER NOT NULL CHECK (byte_size > 0), duration_ms INTEGER,
    created_by UUID, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    tts_style JSONB NOT NULL DEFAULT '{"stylePrompt":"","speakingRate":1}', deleted_at TIMESTAMPTZ,
    narration_version TEXT NOT NULL DEFAULT 'dialogue_v1'
        CHECK (narration_version IN ('dialogue_v1','exam_track_v2','exam_track_v3','exam_track_v4')),
    script_snapshot JSONB,
    CHECK (narration_version = 'dialogue_v1' OR script_snapshot IS NOT NULL),
    UNIQUE (source_hash,model_name,female_voice,male_voice),
    storage_backend TEXT NOT NULL DEFAULT 'local' CHECK (storage_backend IN ('local','supabase','s3')),
    file_sha256 CHAR(64) CHECK (file_sha256 ~ '^[a-f0-9]{64}$')
);
CREATE TABLE topik_bank.item_audio_bindings (
  item_id UUID NOT NULL REFERENCES topik_bank.items(item_id), content_hash CHAR(64) NOT NULL,
  audio_asset_id UUID NOT NULL REFERENCES topik_bank.tts_audio_assets(audio_asset_id),
  source_hash CHAR(64) NOT NULL, is_current BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(item_id,content_hash,audio_asset_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS item_audio_current_hash_idx
  ON topik_bank.item_audio_bindings(item_id,content_hash) WHERE is_current;
CREATE TABLE IF NOT EXISTS topik_bank.question_set_item_audio_bindings (
  set_id UUID NOT NULL, position SMALLINT NOT NULL CHECK(position>0),
  audio_asset_id UUID NOT NULL REFERENCES topik_bank.tts_audio_assets(audio_asset_id),
  source_hash CHAR(64) NOT NULL, is_current BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(set_id,position,audio_asset_id),
  FOREIGN KEY(set_id,position) REFERENCES topik_bank.items(set_id,position)
);
CREATE UNIQUE INDEX IF NOT EXISTS question_set_item_audio_current_idx
  ON topik_bank.question_set_item_audio_bindings(set_id,position) WHERE is_current;
CREATE INDEX IF NOT EXISTS question_set_item_audio_asset_idx
  ON topik_bank.question_set_item_audio_bindings(audio_asset_id,is_current);
CREATE TABLE topik_bank.item_visual_assets (
    visual_asset_id UUID PRIMARY KEY, item_id UUID NOT NULL REFERENCES topik_bank.items(item_id),
    content_hash CHAR(64) NOT NULL, option_number SMALLINT NOT NULL CHECK (option_number BETWEEN 1 AND 4),
    visual_role TEXT NOT NULL DEFAULT 'choice' CHECK (visual_role IN ('choice','material')),
    storage_bucket TEXT NOT NULL, storage_path TEXT NOT NULL, storage_url TEXT NOT NULL,
    mime_type TEXT NOT NULL, byte_size INTEGER NOT NULL CHECK (byte_size > 0), created_by UUID,
    is_current BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    storage_backend TEXT NOT NULL DEFAULT 'local' CHECK (storage_backend IN ('local','supabase','s3')),
    file_sha256 CHAR(64) CHECK (file_sha256 ~ '^[a-f0-9]{64}$')
);
CREATE UNIQUE INDEX item_visual_current_hash_idx ON topik_bank.item_visual_assets(item_id,content_hash,visual_role,option_number) WHERE is_current;

CREATE VIEW topik_bank.current_items AS SELECT i.created_at AS item_created_at,i.* FROM topik_bank.items i;
CREATE VIEW topik_bank.current_set_contents AS
SELECT s.set_id,s.section AS set_section,s.generator_provider AS set_generator_provider,
       s.generator_model AS set_generator_model,s.generator_version AS set_generator_version,
       s.review_status AS set_review_status,s.default_target_level,s.published_at,
       i.position,i.source_key,i.item_id,i.content_hash,i.type_slot,i.item_type,i.primary_skill,
       i.target_level,i.review_status AS item_review_status,i.stem,i.choices,i.correct_answer,
       i.explanation,i.content_json,i.source_provenance,s.set_sequence
FROM topik_bank.question_sets s JOIN topik_bank.items i ON i.set_id=s.set_id;

"""

FORMAT_MIGRATION = "0003_apply_exam_format_schema"
AUDIO_MIGRATION = "0004_item_audio_only"


class ItemAudioMigrationTests(TransactionTestCase):
    def setUp(self):
        self.addCleanup(self.drop_bank)

    def drop_bank(self):
        with connection.cursor() as cursor:
            cursor.execute("DROP SCHEMA IF EXISTS topik_bank CASCADE")

    def apply_migration(self, name):
        loader = MigrationLoader(connection)
        migration = loader.get_migration("question_bank", name)
        state = loader.project_state(("question_bank", name), at_end=False)
        with connection.schema_editor(atomic=migration.atomic) as editor:
            return migration.apply(state, editor)

    def rows(self, table):
        with connection.cursor() as cursor:
            cursor.execute(f"SELECT to_jsonb(t) FROM {table} t")
            return sorted((row[0] for row in cursor.fetchall()), key=lambda row: json.dumps(row, sort_keys=True))

    def schema(self):
        with connection.cursor() as cursor:
            result = []
            for query in (
                "SELECT table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='topik_bank' ORDER BY 1,2",
                "SELECT conrelid::regclass::text,conname,pg_get_constraintdef(oid) FROM pg_constraint WHERE connamespace=to_regnamespace('topik_bank') ORDER BY 1,2",
                "SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='topik_bank' ORDER BY 1,2",
                "SELECT viewname,definition FROM pg_views WHERE schemaname='topik_bank' ORDER BY 1",
            ):
                cursor.execute(query)
                result.append(cursor.fetchall())
            return result

    def legacy(self):
        with connection.cursor() as cursor:
            cursor.execute(LEGACY_SCHEMA)
        self.apply_migration(FORMAT_MIGRATION)
        now = timezone.now()
        self.source = QuestionSet.objects.create(
            set_id=uuid.uuid4(), section="listening", generator_provider="synthetic",
            generator_model="synthetic", generator_version="synthetic", created_at=now,
            set_sequence=1, review_status="reviewed", default_target_level=4, published_at=now)
        self.items = {}
        for position in range(1, 7):
            self.items[position] = Item.objects.create(
                item_id=uuid.uuid4(), source_key=f"synthetic-{position}", created_at=now, updated_at=now,
                section="listening", type_slot=position, item_type="content_match", primary_skill="listening",
                target_level=4, stem_length=1, choice_count=4, generator_provider="synthetic",
                generator_model="synthetic", generator_version="synthetic", prompt_version="a" * 64,
                review_status="reviewed", stem="synthetic", choices=["a", "b", "c", "d"], correct_answer=2,
                explanation="synthetic", content_json={}, source_provenance={}, content_hash="b" * 64,
                set=None if position == 5 else self.source, position=None if position == 5 else position)
        self.assets = []
        for n in range(3):
            self.assets.append(AudioAsset.objects.create(
                audio_asset_id=uuid.uuid4(), source_hash=str(n) * 64, provider="synthetic", model_name="synthetic",
                language_code="ko", female_voice="", male_voice="", mime_type="audio/mpeg",
                storage_bucket="", storage_path="", storage_url=f"https://example.invalid/{n}.mp3", byte_size=1,
                created_at=now, tts_style={}, narration_version="dialogue_v1", storage_backend="s3",
                deleted_at=now if n == 2 else None))
        VisualAsset.objects.create(
            visual_asset_id=uuid.uuid4(), item=self.items[1], content_hash="b" * 64, option_number=1,
            visual_role="choice", storage_bucket="", storage_path="", storage_url="https://example.invalid/1.png",
            mime_type="image/png", byte_size=1, is_current=True, created_at=now, storage_backend="s3")
        self.expected = []
        with connection.cursor() as cursor:
            for position, content_hash, current, expected_current in (
                (1, "b" * 64, True, False), (2, "b" * 64, True, False),
                (3, "b" * 64, True, True), (5, "b" * 64, True, True),
                (1, "d" * 64, True, False), (1, "e" * 64, False, False),
            ):
                item_id, asset_id = self.items[position].pk, self.assets[0].pk
                cursor.execute("""INSERT INTO topik_bank.item_audio_bindings
                    (item_id,content_hash,audio_asset_id,source_hash,is_current,created_at)
                    VALUES (%s,%s,%s,%s,%s,%s)""", [item_id, content_hash, asset_id, "a" * 64, current, now])
                key = f"item_audio:{item_id}:{content_hash}:{asset_id}"
                self.expected.append(dict(
                    binding_id=uuid.UUID(hashlib.md5(key.encode()).hexdigest()), item_id=item_id,
                    content_hash=content_hash, audio_asset_id=asset_id, source_hash="a" * 64,
                    is_current=expected_current, created_at=now, origin_set_id=None, origin_position=None))
            for position, asset_index, current, expected_current in (
                (1, 1, True, True), (1, 0, False, False), (2, 0, True, True), (6, 2, True, False),
            ):
                asset_id = self.assets[asset_index].pk
                cursor.execute("""INSERT INTO topik_bank.question_set_item_audio_bindings
                    (set_id,position,audio_asset_id,source_hash,is_current,created_at) VALUES (%s,%s,%s,%s,%s,%s)""",
                    [self.source.pk, position, asset_id, "c" * 64, current, now])
                key = f"set_audio:{self.source.pk}:{position}:{asset_id}"
                self.expected.append(dict(
                    binding_id=uuid.UUID(hashlib.md5(key.encode()).hexdigest()), item_id=self.items[position].pk,
                    content_hash="b" * 64 if expected_current else None, audio_asset_id=asset_id,
                    source_hash="c" * 64, is_current=expected_current, created_at=now,
                    origin_set_id=self.source.pk, origin_position=position))
        exam = Exam.objects.create(source_set_id=self.source.pk, title="Synthetic", section="listening", display_order=1)
        attempt = Attempt.objects.create(
            exam=exam, guest_id=uuid.uuid4(), title="Synthetic", section="listening", mode="practice", started_at=now)
        AttemptItem.objects.create(
            attempt=attempt, position=1, source_item_id=self.items[1].pk,
            snapshot={"audioUrl": "https://example.invalid/original.mp3"}, correct_answer=2, selected_option=1)
        return self.snapshot()

    def snapshot(self):
        return {
            "schema": self.schema(),
            "rows": {table: self.rows(table) for table in (
                "topik_bank.question_sets", "topik_bank.items", "topik_bank.tts_audio_assets",
                "topik_bank.item_visual_assets", "topik_bank.item_audio_bindings",
                "topik_bank.question_set_item_audio_bindings", "pbt_exams", "pbt_attempts", "pbt_attempt_items",
            )},
        }

    def test_preserves_all_history_content_media_and_attempts(self):
        before = self.legacy()
        state = self.apply_migration(AUDIO_MIGRATION)
        fields = list(self.expected[0])
        actual = list(ItemAudioBinding.objects.values(*fields))
        self.assertCountEqual(actual, self.expected)
        self.assertEqual(sum(row["is_current"] for row in actual), 4)
        for table, rows in before["rows"].items():
            if table not in ("topik_bank.item_audio_bindings", "topik_bank.question_set_item_audio_bindings"):
                self.assertEqual(self.rows(table), rows, table)
        with connection.cursor() as cursor:
            cursor.execute("SELECT to_regclass('topik_bank.question_set_item_audio_bindings')")
            self.assertIsNone(cursor.fetchone()[0])
            cursor.execute("SELECT to_regclass('topik_bank.schema_migrations')")
            self.assertIsNone(cursor.fetchone()[0])
        model = state.apps.get_model("question_bank", "ItemAudioBinding")
        self.assertFalse(model._meta.managed)
        self.assertEqual(model._meta.pk.name, "binding_id")
        with self.assertRaises(LookupError):
            state.apps.get_model("question_bank", "SetItemAudioBinding")
        out = io.StringIO()
        call_command("inspect_question_bank", stdout=out)
        self.assertEqual(len(json.loads(out.getvalue())["counts"]), 5)

    def test_already_migrated_bank_and_0003_reentry_preserve_schema_and_rows(self):
        self.legacy()
        self.apply_migration(AUDIO_MIGRATION)
        before = self.schema(), self.rows("topik_bank.item_audio_bindings")
        self.apply_migration(FORMAT_MIGRATION)
        self.apply_migration(AUDIO_MIGRATION)
        self.assertEqual((self.schema(), self.rows("topik_bank.item_audio_bindings")), before)

    def test_empty_database_is_left_for_hub_initialization(self):
        self.apply_migration(FORMAT_MIGRATION)
        self.apply_migration(AUDIO_MIGRATION)
        with connection.cursor() as cursor:
            cursor.execute("SELECT to_regclass('topik_bank.items')")
            self.assertIsNone(cursor.fetchone()[0])

    def test_partial_bank_fails_without_changes(self):
        with connection.cursor() as cursor:
            cursor.execute("CREATE SCHEMA topik_bank")
            cursor.execute("CREATE TABLE topik_bank.items(item_id uuid PRIMARY KEY)")
        before = self.schema()
        for name in (FORMAT_MIGRATION, AUDIO_MIGRATION):
            with self.subTest(name=name), self.assertRaisesRegex(RuntimeError, "Incomplete"):
                self.apply_migration(name)
            self.assertEqual(self.schema(), before)

    def test_mixed_audio_schema_is_rejected_without_changes(self):
        self.legacy()
        with connection.cursor() as cursor:
            cursor.execute("ALTER TABLE topik_bank.item_audio_bindings ADD COLUMN binding_id uuid")
        before = self.snapshot()
        with self.assertRaisesRegex(RuntimeError, "Mixed"):
            self.apply_migration(AUDIO_MIGRATION)
        self.assertEqual(self.snapshot(), before)

    def test_missing_legacy_table_does_not_hide_old_audio_schema(self):
        self.legacy()
        with connection.cursor() as cursor:
            cursor.execute("DROP TABLE topik_bank.question_set_item_audio_bindings")
        before = self.schema(), self.rows("topik_bank.item_audio_bindings")
        with self.assertRaisesRegex(RuntimeError, "Incomplete Hub 011"):
            self.apply_migration(AUDIO_MIGRATION)
        self.assertEqual((self.schema(), self.rows("topik_bank.item_audio_bindings")), before)

    def test_missing_current_uniqueness_index_is_rejected(self):
        self.legacy()
        self.apply_migration(AUDIO_MIGRATION)
        with connection.cursor() as cursor:
            cursor.execute("DROP INDEX topik_bank.item_audio_current_idx")
        before = self.schema(), self.rows("topik_bank.item_audio_bindings")
        with self.assertRaisesRegex(RuntimeError, "Incomplete Hub 011"):
            self.apply_migration(AUDIO_MIGRATION)
        self.assertEqual((self.schema(), self.rows("topik_bank.item_audio_bindings")), before)

    def test_dependent_view_rolls_back_entire_conversion(self):
        self.legacy()
        with connection.cursor() as cursor:
            cursor.execute("""CREATE VIEW topik_bank.synthetic_audio_dependency AS
                SELECT * FROM topik_bank.question_set_item_audio_bindings""")
        before = self.snapshot()
        with self.assertRaises(DatabaseError):
            self.apply_migration(AUDIO_MIGRATION)
        self.assertEqual(self.snapshot(), before)

    def test_history_verification_failure_rolls_back(self):
        self.legacy()
        with connection.cursor() as cursor:
            cursor.execute("""CREATE FUNCTION topik_bank.synthetic_skip_audio() RETURNS trigger
                LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;
                CREATE TRIGGER synthetic_skip_audio BEFORE INSERT ON topik_bank.item_audio_bindings
                FOR EACH ROW EXECUTE FUNCTION topik_bank.synthetic_skip_audio();""")
        before = self.snapshot()
        with self.assertRaisesRegex(DatabaseError, "history verification failed"):
            self.apply_migration(AUDIO_MIGRATION)
        self.assertEqual(self.snapshot(), before)

    def test_orphan_set_binding_cancels_without_losing_history(self):
        self.legacy()
        with connection.cursor() as cursor:
            cursor.execute("""SELECT conname FROM pg_constraint
                WHERE conrelid='topik_bank.question_set_item_audio_bindings'::regclass
                AND confrelid='topik_bank.items'::regclass""")
            name = cursor.fetchone()[0]
            cursor.execute("ALTER TABLE topik_bank.question_set_item_audio_bindings DROP CONSTRAINT " + connection.ops.quote_name(name))
            cursor.execute("""INSERT INTO topik_bank.question_set_item_audio_bindings
                (set_id,position,audio_asset_id,source_hash) VALUES (%s,50,%s,%s)""",
                [self.source.pk, self.assets[0].pk, "f" * 64])
        before = self.snapshot()
        with self.assertRaisesRegex(DatabaseError, "no matching item"):
            self.apply_migration(AUDIO_MIGRATION)
        self.assertEqual(self.snapshot(), before)

    def test_current_link_and_origin_constraints(self):
        self.legacy()
        self.apply_migration(AUDIO_MIGRATION)
        current = ItemAudioBinding.objects.get(item_id=self.items[3].pk, is_current=True)
        with self.assertRaises(IntegrityError), transaction.atomic():
            ItemAudioBinding.objects.create(
                binding_id=uuid.uuid4(), item=current.item, content_hash="f" * 64,
                audio_asset=current.audio_asset, source_hash="a" * 64, is_current=True, created_at=timezone.now())
        for changes in (
            {"content_hash": None}, {"origin_set_id": self.source.pk},
            {"origin_position": 1}, {"origin_set_id": self.source.pk, "origin_position": 0},
        ):
            with self.subTest(changes=changes), self.assertRaises(IntegrityError), transaction.atomic():
                ItemAudioBinding.objects.filter(pk=current.pk).update(**changes)
        # Multiple unknown historical hashes for the same item/audio remain distinct.
        historical = [
            ItemAudioBinding(binding_id=uuid.uuid4(), item=current.item, audio_asset=current.audio_asset,
                             content_hash=None, source_hash="a" * 64, is_current=False, created_at=timezone.now())
            for _ in range(2)
        ]
        ItemAudioBinding.objects.bulk_create(historical)
        self.assertEqual(ItemAudioBinding.objects.filter(pk__in=[row.pk for row in historical]).count(), 2)

    def test_reverse_requires_backup_instead_of_discarding_history(self):
        self.legacy()
        self.apply_migration(AUDIO_MIGRATION)
        before = self.schema(), self.rows("topik_bank.item_audio_bindings")
        loader = MigrationLoader(connection)
        migration = loader.get_migration("question_bank", AUDIO_MIGRATION)
        state = loader.project_state(("question_bank", AUDIO_MIGRATION), at_end=False)
        with self.assertRaises(IrreversibleError), connection.schema_editor() as editor:
            migration.unapply(state, editor)
        self.assertEqual((self.schema(), self.rows("topik_bank.item_audio_bindings")), before)

