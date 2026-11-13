"""Verify vocabulary transfers against frozen Hub 012/014/015 in the disposable test DB."""
import io
import json

from django.core.management import call_command
from django.db import IntegrityError, connection, transaction
from django.db.migrations.exceptions import IrreversibleError
from django.db.migrations.loader import MigrationLoader
from django.test import TransactionTestCase
from django.utils import timezone

from vocabulary.models import VocabularySet, VocabularySetItem
from ..models import Vocabulary


BASE_SCHEMA = """
CREATE TABLE topik_bank.vocabulary (
    vocabulary_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    korean TEXT NOT NULL CHECK (btrim(korean) <> ''),
    part_of_speech TEXT NOT NULL DEFAULT '',
    english TEXT NOT NULL CHECK (btrim(english) <> ''),
    vietnamese TEXT NOT NULL CHECK (btrim(vietnamese) <> ''),
    japanese TEXT NOT NULL CHECK (btrim(japanese) <> ''),
    example_korean TEXT NOT NULL CHECK (btrim(example_korean) <> ''),
    example_english TEXT NOT NULL CHECK (btrim(example_english) <> ''),
    topik_level SMALLINT NOT NULL CHECK (topik_level BETWEEN 3 AND 6),
    UNIQUE (korean, part_of_speech)
);
"""
HUB_AUDIO_SCHEMA = r"""
ALTER TABLE topik_bank.vocabulary
    ADD COLUMN audio_storage_bucket TEXT,
    ADD COLUMN audio_storage_path TEXT,
    ADD COLUMN audio_file_sha256 TEXT,
    ADD COLUMN audio_byte_size INTEGER,
    ADD COLUMN audio_duration_ms INTEGER,
    ADD COLUMN audio_source_hash TEXT,
    ADD COLUMN audio_generation_config JSONB,
    ADD COLUMN audio_created_at TIMESTAMPTZ;
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
"""
MIGRATION = "0006_vocabulary_audio"
LANGUAGE_MIGRATION = "0007_vocabulary_languages"
HUB_LANGUAGE_SCHEMA = """
ALTER TABLE topik_bank.vocabulary
    ADD COLUMN IF NOT EXISTS chinese_simplified TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS indonesian TEXT NOT NULL DEFAULT '';
"""


class VocabularyMigrationTestCase(TransactionTestCase):
    migration_name = MIGRATION

    def setUp(self):
        self.addCleanup(self.drop_bank)
        self.loader = MigrationLoader(connection)
        self.word_model = self.loader.project_state(
            ("question_bank", self.migration_name)).apps.get_model("question_bank", "Vocabulary")

    def execute(self, sql, params=None):
        with connection.cursor() as cursor:
            cursor.execute(sql, params)
            return cursor.fetchall() if cursor.description else None

    def drop_bank(self):
        self.execute("DROP SCHEMA IF EXISTS topik_bank CASCADE")

    def legacy(self):
        self.execute("CREATE SCHEMA topik_bank")
        self.execute(BASE_SCHEMA)
        self.execute("""INSERT INTO topik_bank.vocabulary
            (korean,english,vietnamese,japanese,example_korean,example_english,topik_level)
            VALUES ('시험단어','test','test','test','시험 예문','Test example',3)""")

    def apply_migration(self, name=None):
        name = name or self.migration_name
        migration = self.loader.get_migration("question_bank", name)
        state = self.loader.project_state(("question_bank", name), at_end=False)
        with connection.schema_editor(atomic=migration.atomic) as editor:
            return migration.apply(state, editor)

    def rows(self):
        return [json.loads(row[0]) for row in self.execute(
            "SELECT to_jsonb(v) FROM topik_bank.vocabulary v ORDER BY vocabulary_id")]

    def schema(self, table="topik_bank.vocabulary"):
        queries = (
            """SELECT a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attidentity,
                pg_get_expr(d.adbin,d.adrelid) FROM pg_attribute a
                LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
                WHERE a.attrelid=%s::regclass AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum""",
            """SELECT pg_get_constraintdef(oid),convalidated FROM pg_constraint
                WHERE conrelid=%s::regclass AND contype <> 'n' ORDER BY 1""",
            """SELECT substring(pg_get_indexdef(indexrelid) from ' USING (.*)'),indisvalid,indisready
                FROM pg_index WHERE indrelid=%s::regclass ORDER BY 1""",
            """SELECT seqincrement,seqmin,seqmax,seqcache,seqcycle FROM pg_sequence
                WHERE seqrelid=pg_get_serial_sequence(%s,'vocabulary_id')::regclass""",
        )
        return [self.execute(query, [table]) for query in queries]

    def sequence(self):
        return self.execute("SELECT last_value,is_called FROM topik_bank.vocabulary_vocabulary_id_seq")

    def audio(self):
        return {
            "audio_storage_bucket": "synthetic-bucket", "audio_storage_path": "media/vocabulary-audio/test.mp3",
            "audio_file_sha256": "a" * 64, "audio_byte_size": 1024, "audio_duration_ms": 1000,
            "audio_source_hash": "b" * 64, "audio_generation_config": {"voice": "synthetic"},
            "audio_created_at": timezone.now(),
        }


class VocabularyAudioMigrationTests(VocabularyMigrationTestCase):
    def test_upgrade_matches_hub_and_preserves_words_sequence_and_sets(self):
        self.legacy()
        group = VocabularySet.objects.create(topik_level=3, set_number=1)
        VocabularySetItem.objects.create(set=group, vocabulary_id=1, position=1)
        before, sequence = self.rows(), self.sequence()
        memberships = list(VocabularySetItem.objects.values())
        state = self.apply_migration()
        word = self.word_model.objects.get(pk=1)
        self.assertFalse(Vocabulary._meta.managed)
        self.assertEqual(len(state.apps.get_model("question_bank", "Vocabulary")._meta.fields), 17)
        self.assertEqual({key: getattr(word, key) for key in before[0]}, before[0])
        self.assertTrue(all(getattr(word, name) is None for name in self.audio()))
        self.assertEqual(self.sequence(), sequence)
        self.assertEqual(list(VocabularySetItem.objects.values()), memberships)
        self.execute((BASE_SCHEMA + HUB_AUDIO_SCHEMA).replace("topik_bank.vocabulary", "topik_bank.hub_expected"))
        self.assertEqual(self.schema(), self.schema("topik_bank.hub_expected"))
        call_command("create_vocabulary_sets", check=True, stdout=io.StringIO())
        call_command("create_vocabulary_sets", stdout=io.StringIO())
        self.assertEqual(list(VocabularySetItem.objects.values()), memberships)
        self.apply_migration(LANGUAGE_MIGRATION)
        for path in ("/api/vocabulary/levels/", "/api/vocabulary/sets/?level=3", f"/api/vocabulary/sets/{group.pk}/"):
            self.assertEqual(self.client.get(path).status_code, 200)

    def test_already_upgraded_schema_and_audio_survive_repeated_application(self):
        self.legacy()
        self.execute(HUB_AUDIO_SCHEMA)
        Vocabulary.objects.filter(pk=1).update(**self.audio())
        before = self.schema(), self.rows(), self.sequence()
        self.apply_migration()
        self.apply_migration()
        self.assertEqual((self.schema(), self.rows(), self.sequence()), before)
        group = VocabularySet.objects.create(topik_level=3, set_number=1)
        VocabularySetItem.objects.create(set=group, vocabulary_id=1, position=1)
        self.apply_migration(LANGUAGE_MIGRATION)
        before = self.schema(), self.rows(), self.sequence()
        result = self.client.get(f"/api/vocabulary/sets/{group.pk}/")
        self.assertEqual(result.status_code, 200)
        self.assertEqual(set(result.json()["words"][0]), {
            "id", "position", "korean", "partOfSpeech", "meanings", "exampleKorean", "exampleEnglish", "audioUrl",
        })
        self.assertEqual((self.schema(), self.rows(), self.sequence()), before)

    def test_missing_table_is_left_for_hub_initialization(self):
        self.apply_migration()
        self.assertEqual(self.execute("SELECT to_regnamespace('topik_bank')"), [(None,)])
        self.execute("CREATE SCHEMA topik_bank")
        self.apply_migration()
        self.assertEqual(self.execute("SELECT to_regclass('topik_bank.vocabulary')"), [(None,)])

    def test_incompatible_columns_or_constraint_are_rejected_without_changes(self):
        changes = (
            "ALTER TABLE topik_bank.vocabulary ADD COLUMN audio_storage_bucket TEXT",
            HUB_AUDIO_SCHEMA + "ALTER TABLE topik_bank.vocabulary ALTER COLUMN audio_byte_size TYPE BIGINT",
            HUB_AUDIO_SCHEMA + "ALTER TABLE topik_bank.vocabulary ALTER COLUMN audio_storage_bucket SET DEFAULT ''",
            HUB_AUDIO_SCHEMA + "ALTER TABLE topik_bank.vocabulary DROP CONSTRAINT vocabulary_audio_complete;"
                "ALTER TABLE topik_bank.vocabulary ADD CONSTRAINT vocabulary_audio_complete CHECK (audio_byte_size > 0)",
            HUB_AUDIO_SCHEMA.replace("    )\n);", "    )\n) NOT VALID;"),
        )
        for change in changes:
            with self.subTest(change=change):
                self.legacy()
                self.execute(change)
                before = self.schema(), self.rows(), self.sequence()
                with self.assertRaisesMessage(RuntimeError, "Incompatible vocabulary"):
                    self.apply_migration()
                self.assertEqual((self.schema(), self.rows(), self.sequence()), before)
                self.drop_bank()

    def test_constraint_accepts_complete_audio_and_rejects_partial_or_invalid_audio(self):
        self.legacy()
        self.apply_migration()
        audio = self.audio()
        invalid = [{name: None} for name in audio] + [
            {"audio_storage_bucket": " "}, {"audio_storage_path": ""},
            {"audio_file_sha256": "A" * 64}, {"audio_source_hash": "short"},
            {"audio_byte_size": 0}, {"audio_duration_ms": -1},
            {"audio_generation_config": []}, {"audio_generation_config": "scalar"},
        ]
        for changes in invalid:
            with self.subTest(changes=changes), self.assertRaises(IntegrityError), transaction.atomic():
                Vocabulary.objects.filter(pk=1).update(**(audio | changes))
        Vocabulary.objects.filter(pk=1).update(**audio)
        word = self.word_model.objects.get(pk=1)
        self.assertEqual({name: getattr(word, name) for name in audio}, audio)
        Vocabulary.objects.filter(pk=1).update(**dict.fromkeys(audio))
        self.assertIsNone(self.word_model.objects.get(pk=1).audio_storage_path)

    def test_invalid_existing_audio_rolls_back_constraint_addition(self):
        self.legacy()
        self.execute(HUB_AUDIO_SCHEMA)
        self.execute("ALTER TABLE topik_bank.vocabulary DROP CONSTRAINT vocabulary_audio_complete")
        Vocabulary.objects.filter(pk=1).update(audio_storage_bucket="incomplete")
        before = self.schema(), self.rows(), self.sequence()
        with self.assertRaises(IntegrityError):
            self.apply_migration()
        self.assertEqual((self.schema(), self.rows(), self.sequence()), before)

    def test_reverse_does_not_discard_audio(self):
        self.legacy()
        self.apply_migration()
        Vocabulary.objects.filter(pk=1).update(**self.audio())
        before = self.schema(), self.rows(), self.sequence()
        loader = MigrationLoader(connection)
        migration = loader.get_migration("question_bank", MIGRATION)
        state = loader.project_state(("question_bank", MIGRATION), at_end=False)
        with self.assertRaises(IrreversibleError), connection.schema_editor() as editor:
            migration.unapply(state, editor)
        self.assertEqual((self.schema(), self.rows(), self.sequence()), before)


class VocabularyLanguageMigrationTests(VocabularyMigrationTestCase):
    migration_name = LANGUAGE_MIGRATION

    def test_upgrade_matches_hub_and_preserves_words_audio_sequence_and_sets(self):
        self.legacy()
        self.execute(HUB_AUDIO_SCHEMA)
        Vocabulary.objects.filter(pk=1).update(**self.audio())
        group = VocabularySet.objects.create(topik_level=3, set_number=1)
        VocabularySetItem.objects.create(set=group, vocabulary_id=1, position=1)
        before, sequence = self.rows(), self.sequence()
        memberships = list(VocabularySetItem.objects.values())

        state = self.apply_migration()

        self.assertEqual(self.rows(), [before[0] | {"chinese_simplified": "", "indonesian": ""}])
        self.assertEqual(self.sequence(), sequence)
        self.assertEqual(list(VocabularySetItem.objects.values()), memberships)
        self.execute((BASE_SCHEMA + HUB_AUDIO_SCHEMA + HUB_LANGUAGE_SCHEMA).replace(
            "topik_bank.vocabulary", "topik_bank.hub_expected"))
        self.assertEqual(self.schema(), self.schema("topik_bank.hub_expected"))
        model = state.apps.get_model("question_bank", "Vocabulary")
        self.assertFalse(model._meta.managed)
        self.assertEqual(len(model._meta.fields), 19)
        for name in ("chinese_simplified", "indonesian"):
            self.assertEqual(getattr(Vocabulary.objects.get(pk=1), name), "")
            self.assertEqual(getattr(model.objects.get(pk=1), name), "")
            self.assertEqual(model._meta.get_field(name).deconstruct()[1:],
                             Vocabulary._meta.get_field(name).deconstruct()[1:])
        call_command("create_vocabulary_sets", check=True, stdout=io.StringIO())
        call_command("create_vocabulary_sets", stdout=io.StringIO())
        self.assertEqual(list(VocabularySetItem.objects.values()), memberships)
        result = self.client.get(f"/api/vocabulary/sets/{group.pk}/")
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()["words"][0]["meanings"], {
            "en": "test", "vi": "test", "ja": "test", "zh-Hans": "", "id": "",
        })

    def test_database_defaults_and_not_null_apply_to_future_rows(self):
        self.legacy()
        self.execute(HUB_AUDIO_SCHEMA)
        self.apply_migration()
        self.execute("""INSERT INTO topik_bank.vocabulary
            (korean,english,vietnamese,japanese,example_korean,example_english,topik_level)
            VALUES ('추가단어','test','test','test','시험 예문','Test example',3)""")
        word = Vocabulary.objects.get(pk=2)
        self.assertEqual((word.chinese_simplified, word.indonesian), ("", ""))
        for name in ("chinese_simplified", "indonesian"):
            with self.subTest(name=name), self.assertRaises(IntegrityError), transaction.atomic():
                Vocabulary.objects.filter(pk=1).update(**{name: None})

    def test_existing_translations_survive_both_migrations_in_either_column_order(self):
        for additions in (HUB_AUDIO_SCHEMA + HUB_LANGUAGE_SCHEMA, HUB_LANGUAGE_SCHEMA + HUB_AUDIO_SCHEMA):
            with self.subTest(additions=additions):
                self.legacy()
                self.execute(additions)
                Vocabulary.objects.filter(pk=1).update(
                    chinese_simplified="测试", indonesian="ujian", **self.audio())
                before = self.schema(), self.rows(), self.sequence()
                for _ in range(2):
                    self.apply_migration(MIGRATION)
                    self.apply_migration()
                self.assertEqual((self.schema(), self.rows(), self.sequence()), before)
                self.drop_bank()

    def test_audio_migration_accepts_language_columns_before_audio_exists(self):
        self.legacy()
        self.execute(HUB_LANGUAGE_SCHEMA)
        Vocabulary.objects.filter(pk=1).update(chinese_simplified="测试", indonesian="ujian")
        before, sequence = self.rows(), self.sequence()
        self.apply_migration(MIGRATION)
        self.apply_migration()
        self.assertEqual(self.rows(), [before[0] | dict.fromkeys(self.audio())])
        self.assertEqual(self.sequence(), sequence)

    def test_missing_table_is_left_for_hub_initialization(self):
        state = self.apply_migration()
        self.assertEqual(len(state.apps.get_model("question_bank", "Vocabulary")._meta.fields), 19)
        self.assertEqual(self.execute("SELECT to_regnamespace('topik_bank')"), [(None,)])
        self.execute("CREATE SCHEMA topik_bank")
        self.apply_migration()
        self.assertEqual(self.execute("SELECT to_regclass('topik_bank.vocabulary')"), [(None,)])

    def test_incompatible_existing_column_rolls_back_other_column_addition(self):
        for change in ("TYPE VARCHAR(100)", "DROP NOT NULL", "SET DEFAULT 'unknown'", "DROP DEFAULT"):
            with self.subTest(change=change):
                self.legacy()
                self.execute(HUB_AUDIO_SCHEMA)
                self.execute("ALTER TABLE topik_bank.vocabulary ADD COLUMN chinese_simplified TEXT NOT NULL DEFAULT ''")
                self.execute(f"ALTER TABLE topik_bank.vocabulary ALTER COLUMN chinese_simplified {change}")
                before = self.schema(), self.rows(), self.sequence()
                with self.assertRaisesMessage(RuntimeError, "Incompatible vocabulary language columns"):
                    self.apply_migration()
                self.assertEqual((self.schema(), self.rows(), self.sequence()), before)
                self.drop_bank()

    def test_compatible_partial_columns_preserve_translations(self):
        for name in ("chinese_simplified", "indonesian"):
            with self.subTest(name=name):
                self.legacy()
                self.execute(HUB_AUDIO_SCHEMA)
                self.execute(f"ALTER TABLE topik_bank.vocabulary ADD COLUMN {name} TEXT NOT NULL DEFAULT ''")
                Vocabulary.objects.filter(pk=1).update(**{name: "existing translation"})
                self.apply_migration()
                word = Vocabulary.objects.get(pk=1)
                self.assertEqual(getattr(word, name), "existing translation")
                other = "indonesian" if name == "chinese_simplified" else "chinese_simplified"
                self.assertEqual(getattr(word, other), "")
                self.drop_bank()

    def test_reverse_does_not_discard_translations(self):
        self.legacy()
        self.execute(HUB_AUDIO_SCHEMA)
        self.apply_migration()
        Vocabulary.objects.filter(pk=1).update(chinese_simplified="测试", indonesian="ujian")
        before = self.schema(), self.rows(), self.sequence()
        migration = self.loader.get_migration("question_bank", self.migration_name)
        state = self.loader.project_state(("question_bank", self.migration_name), at_end=False)
        with self.assertRaises(IrreversibleError), connection.schema_editor() as editor:
            migration.unapply(state, editor)
        self.assertEqual((self.schema(), self.rows(), self.sequence()), before)
