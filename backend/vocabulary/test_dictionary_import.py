import io
from collections import Counter
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import Mock, patch

from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import DatabaseError
from django.test import SimpleTestCase, TestCase

from .dictionary_import import HEADERS, TRANSLATION_LANGUAGES, parse_row, read_senses
from .models import KoreanDictionarySense


COMMAND = "vocabulary.management.commands.import_korean_dictionary"


def source_row(**overrides):
    return dict.fromkeys(HEADERS, "") | {
        "표제어": "가다", "동형어 번호": "1", "구분": "단어", "품사": "동사",
        "뜻풀이": "한 곳에서 다른 곳으로 장소를 이동하다.", "용례": "<구> 학교에 가다.",
        "영어 대역어": "go", "영어 대역어 뜻풀이": "Move from one place to another.",
    } | overrides


def records():
    orders = Counter()
    return [
        parse_row(source_row(), "1.xls", 2, orders),
        parse_row(source_row(**{"뜻풀이": "어떤 단체나 기관에 소속되다."}), "1.xls", 3, orders),
    ]


class DictionaryImportParsingTests(SimpleTestCase):
    def test_translations_metadata_and_identical_definitions_are_preserved(self):
        row = source_row(**{"발음": "가다", "활용": "가요", "관련어": "오다"})
        for language, name in TRANSLATION_LANGUAGES.items():
            row[f"{name} 대역어"] = language
            row[f"{name} 대역어 뜻풀이"] = f"definition-{language}"
        orders = Counter()
        first = parse_row(row, "1.xls", 2, orders)
        second = parse_row(row, "2.xls", 2, orders)
        self.assertEqual((first["sense_order"], second["sense_order"]), (1, 2))
        self.assertEqual(set(first["translations"]), set(TRANSLATION_LANGUAGES))
        self.assertEqual(first["translations"]["zh-Hans"]["translation"], "zh-Hans")
        self.assertEqual(first["metadata"], {"발음": "가다", "활용": "가요", "관련어": "오다"})
        self.assertEqual(first["examples"], "<구> 학교에 가다.")

    def test_subentries_use_their_own_fields_and_preserve_parent_metadata(self):
        for label, kind in (("속담", "proverb"), ("관용구", "idiom")):
            row = source_row(**{
                "표제어": "가난", "동형어 번호": "2", "품사": "명사", "구분": "부표제어",
                "뜻풀이": "", "용례": "", "부표제어": f"[{label}] 가난이 죄다",
                "부표제어 뜻풀이": "가난 때문에 불행을 겪는다.", "부표제어 용례": "예시.",
                "영어 부표제어 대역어": "Poverty", "영어 부표제어 대역어 뜻풀이": "Poverty is a sin.",
            })
            record = parse_row(row, "1.xls", 2, Counter())
            self.assertEqual((record["headword"], record["entry_type"]), ("가난이 죄다", kind))
            self.assertEqual((record["part_of_speech"], record["homonym_number"]), ("", 0))
            self.assertEqual(record["definition"], "가난 때문에 불행을 겪는다.")
            self.assertEqual(record["translations"]["en"]["translation"], "Poverty")
            self.assertEqual(record["metadata"]["표제어"], "가난")
            self.assertEqual(record["metadata"]["동형어 번호"], "2")
            self.assertEqual(record["metadata"]["품사"], "명사")

    def test_invalid_rows_fail_with_location(self):
        for changes in ({"표제어": ""}, {"뜻풀이": ""}, {"동형어 번호": "-1"},
                        {"동형어 번호": "32768"}, {"품사": "unknown"}, {"구분": "unknown"},
                        {"뜻풀이": "bad\x00text"}, {"부표제어": "[속담] unexpected"}):
            with self.subTest(changes=changes), self.assertRaisesMessage(CommandError, "1.xls:2:"):
                parse_row(source_row(**changes), "1.xls", 2, Counter())

    def test_xls_header_validation_and_release(self):
        book, sheet = Mock(), Mock()
        book.nsheets = 1
        book.sheet_by_index.return_value = sheet
        sheet.nrows = 2
        sheet.row_values.side_effect = [HEADERS[:-1]]
        with patch("vocabulary.dictionary_import.xlrd.open_workbook", return_value=book):
            with self.assertRaisesMessage(CommandError, "74"):
                list(read_senses([Path("1.xls")]))
        book.release_resources.assert_called_once()

    def test_check_never_connects_to_database(self):
        with TemporaryDirectory() as folder:
            Path(folder, "1.xls").touch()
            out = io.StringIO()
            with patch(f"{COMMAND}.read_senses", return_value=iter(records())):
                # SimpleTestCase rejects any database query.
                call_command("import_korean_dictionary", directory=folder, check=True, stdout=out)
            self.assertIn("No database connection or writes", out.getvalue())


class DictionaryImportDatabaseTests(TestCase):
    def setUp(self):
        self.directory = TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        Path(self.directory.name, "1.xls").touch()

    def run_import(self, rows=None, **options):
        with patch(f"{COMMAND}.read_senses", return_value=iter(rows if rows is not None else records())):
            call_command("import_korean_dictionary", directory=self.directory.name, stdout=io.StringIO(), **options)

    def test_reimport_updates_in_place_without_duplicate_rows(self):
        self.run_import()
        original = list(KoreanDictionarySense.objects.order_by("source_row").values_list("pk", flat=True))
        updated = records()
        updated[0]["definition"] = "갱신된 뜻풀이."
        self.run_import(updated)
        self.assertEqual(list(KoreanDictionarySense.objects.order_by("source_row").values_list("pk", flat=True)), original)
        self.assertEqual(KoreanDictionarySense.objects.get(source_row=2).definition, "갱신된 뜻풀이.")

    def test_source_set_or_row_count_change_never_deletes_or_duplicates_data(self):
        self.run_import()
        for rows in (records()[:1], [row | {"source_file": "renamed.xls"} for row in records()]):
            with self.assertRaisesMessage(CommandError, "Existing source"):
                self.run_import(rows)
            self.assertEqual(KoreanDictionarySense.objects.count(), 2)

    def test_parse_failure_is_detected_before_writing(self):
        def broken():
            yield records()[0]
            raise CommandError("bad row")
        with patch(f"{COMMAND}.read_senses", return_value=broken()):
            with self.assertRaisesMessage(CommandError, "bad row"):
                call_command("import_korean_dictionary", directory=self.directory.name, stdout=io.StringIO())
        self.assertFalse(KoreanDictionarySense.objects.exists())

    def test_database_failure_rolls_back_prior_batches_and_hides_details(self):
        self.run_import()
        before = list(KoreanDictionarySense.objects.order_by("source_row").values("id", "definition"))
        original = KoreanDictionarySense.objects.bulk_create
        calls = 0

        def fail_second_batch(*args, **kwargs):
            nonlocal calls
            calls += 1
            if calls == 2:
                raise DatabaseError("private-connection-details")
            return original(*args, **kwargs)

        changed = [row | {"definition": "changed"} for row in records()]
        with patch(f"{COMMAND}.BATCH_SIZE", 1), patch.object(
            KoreanDictionarySense.objects, "bulk_create", side_effect=fail_second_batch,
        ):
            with self.assertRaises(CommandError) as error:
                self.run_import(changed)
        self.assertNotIn("private", str(error.exception))
        self.assertEqual(list(KoreanDictionarySense.objects.order_by("source_row").values("id", "definition")), before)

    def test_natural_part_order_keeps_senses_across_file_boundaries(self):
        Path(self.directory.name, "10.xls").touch()
        Path(self.directory.name, "2.xls").touch()
        orders = Counter()

        def split_export(paths):
            self.assertEqual([p.name for p in paths], ["1.xls", "2.xls", "10.xls"])
            for path in paths:
                yield parse_row(source_row(), path.name, 2, orders)
        with patch(f"{COMMAND}.read_senses", side_effect=split_export):
            call_command("import_korean_dictionary", directory=self.directory.name, stdout=io.StringIO())
        self.assertEqual(list(KoreanDictionarySense.objects.order_by("sense_order").values_list("sense_order", flat=True)),
                         [1, 2, 3])
