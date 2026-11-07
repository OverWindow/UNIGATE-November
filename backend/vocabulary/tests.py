import io
from unittest.mock import patch

from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import DatabaseError, IntegrityError, connection, transaction
from django.test import SimpleTestCase, TransactionTestCase

from question_bank.models import Vocabulary
from .models import VocabularySet, VocabularySetItem
from .services import split_words


class VocabularySplitTests(SimpleTestCase):
    def test_current_level_sizes_are_balanced_without_duplicates(self):
        for count, expected_sets in ((1581, 80), (2078, 104), (2131, 107), (2468, 124)):
            ids = list(range(1, count + 1))
            groups = split_words(ids)
            self.assertEqual(len(groups), expected_sets)
            self.assertEqual([pk for group in groups for pk in group], ids)
            self.assertTrue(all(19 <= len(group) <= 20 for group in groups))

    def test_empty_and_small_sources(self):
        self.assertEqual(split_words([]), [])
        self.assertEqual(split_words([42]), [[42]])
        self.assertEqual([len(group) for group in split_words(list(range(21)))], [11, 10])


class VocabularyTests(TransactionTestCase):
    def setUp(self):
        with connection.cursor() as cursor:
            cursor.execute("CREATE SCHEMA topik_bank")
        with connection.schema_editor() as editor:
            editor.create_model(Vocabulary)
        self.add_words(3, 41)
        self.add_words(4, 20)

    def tearDown(self):
        with connection.schema_editor() as editor:
            editor.delete_model(Vocabulary)
        with connection.cursor() as cursor:
            cursor.execute("DROP SCHEMA topik_bank")

    def add_words(self, level, count, start=1):
        Vocabulary.objects.bulk_create([Vocabulary(
            vocabulary_id=level * 10000 + number, korean=f"테스트{number}", part_of_speech="명사" if number != 1 else "",
            english=f"test {number}", vietnamese=f"thử {number}", japanese=f"テスト{number}",
            chinese_simplified=f"测试{number}", indonesian=f"ujian {number}",
            example_korean="한국어 예문입니다.", example_english="An example sentence.", topik_level=level,
        ) for number in range(start, start + count)])

    def register(self, check=False):
        output = io.StringIO()
        call_command("create_vocabulary_sets", check=check, stdout=output)
        return output.getvalue()

    def test_check_is_read_only_and_registration_is_stable(self):
        source_before = list(Vocabulary.objects.order_by("pk").values())
        self.assertIn("would add 3 sets / 41 words", self.register(check=True))
        self.assertFalse(VocabularySet.objects.exists())
        self.assertFalse(VocabularySetItem.objects.exists())
        self.register()
        self.assertEqual(VocabularySet.objects.count(), 4)
        self.assertEqual(VocabularySetItem.objects.count(), 61)
        memberships = list(VocabularySetItem.objects.order_by("pk").values())
        self.register()
        self.assertEqual(list(VocabularySetItem.objects.order_by("pk").values()), memberships)
        self.assertEqual(list(Vocabulary.objects.order_by("pk").values()), source_before)
        self.assertFalse(Vocabulary._meta.managed)
        self.add_words(3, 21, start=42)
        self.register()
        self.assertEqual(list(VocabularySetItem.objects.order_by("pk").values())[:61], memberships)
        self.assertEqual(VocabularySet.objects.filter(topik_level=3).count(), 5)

    def test_missing_or_reclassified_source_stops_registration(self):
        self.register()
        before = list(VocabularySetItem.objects.order_by("pk").values())
        self.add_words(4, 1, start=21)
        Vocabulary.objects.filter(pk=30001).update(topik_level=5)
        for check in (True, False):
            with self.assertRaisesMessage(CommandError, "source level changed"):
                self.register(check=check)
        self.assertEqual(list(VocabularySetItem.objects.order_by("pk").values()), before)

    def test_empty_existing_set_is_not_silently_rebuilt(self):
        VocabularySet.objects.create(topik_level=3, set_number=1)
        with self.assertRaisesMessage(CommandError, "incomplete"):
            self.register()
        self.assertFalse(VocabularySetItem.objects.exists())

    def test_anonymous_catalog_and_detail_are_read_only(self):
        self.register()
        levels = self.client.get("/api/vocabulary/levels/")
        self.assertEqual(levels.status_code, 200)
        self.assertEqual(levels.json()["levels"], [
            {"level": 3, "wordCount": 41, "setCount": 3}, {"level": 4, "wordCount": 20, "setCount": 1},
            {"level": 5, "wordCount": 0, "setCount": 0}, {"level": 6, "wordCount": 0, "setCount": 0},
        ])
        catalog = self.client.get("/api/vocabulary/sets/?level=3&page=1")
        self.assertNotIn("sessionid", catalog.cookies)
        group = catalog.json()["sets"][0]
        self.assertEqual((group["number"], group["wordCount"]), (1, 14))
        self.assertEqual(group["preview"], ["테스트1", "테스트2", "테스트3"])
        path = f"/api/vocabulary/sets/{group['id']}/"
        detail = self.client.get(path)
        self.assertEqual(detail.status_code, 200)
        data = detail.json()
        self.assertEqual(data["catalogPage"], 1)
        self.assertEqual(data["words"][0], {
            "id": "30001", "position": 1, "korean": "테스트1", "partOfSpeech": "",
            "meanings": {"en": "test 1", "vi": "thử 1", "ja": "テスト1", "zh-Hans": "测试1", "id": "ujian 1"},
            "exampleKorean": "한국어 예문입니다.", "exampleEnglish": "An example sentence.",
        })
        self.assertEqual(self.client.get(path).json(), data)
        self.assertNotIn("progress", data)
        for endpoint in ("/api/vocabulary/levels/", "/api/vocabulary/sets/", path):
            for method in (self.client.post, self.client.put, self.client.delete):
                self.assertEqual(method(endpoint).status_code, 405)
        self.assertEqual(self.client.put(path + "progress/").status_code, 404)

    def test_untranslated_meanings_remain_empty_without_changing_source(self):
        self.register()
        group = VocabularySet.objects.filter(topik_level=3).first()
        Vocabulary.objects.filter(pk=30001).update(chinese_simplified="", indonesian="")
        before = list(Vocabulary.objects.order_by("pk").values())
        result = self.client.get(f"/api/vocabulary/sets/{group.pk}/")
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()["words"][0]["meanings"], {
            "en": "test 1", "vi": "thử 1", "ja": "テスト1", "zh-Hans": "", "id": "",
        })
        self.assertEqual(list(Vocabulary.objects.order_by("pk").values()), before)

    def test_pagination_and_invalid_parameters(self):
        self.add_words(6, 481)
        self.register()
        first = self.client.get("/api/vocabulary/sets/?level=6").json()
        last = self.client.get("/api/vocabulary/sets/?level=6&page=2").json()
        self.assertEqual((len(first["sets"]), len(last["sets"]), first["totalSets"]), (24, 1, 25))
        self.assertEqual(last["sets"][0]["number"], 25)
        detail = self.client.get(f"/api/vocabulary/sets/{last['sets'][0]['id']}/").json()
        self.assertEqual(detail["catalogPage"], 2)
        for query in ("level=2", "level=x", "page=0", "page=-1", "page=x", "page=1000001"):
            self.assertEqual(self.client.get("/api/vocabulary/sets/?" + query).status_code, 400)
        self.assertEqual(self.client.get("/api/vocabulary/sets/?level=6&page=3").status_code, 404)
        self.assertEqual(self.client.get("/api/vocabulary/sets/99999999999999999999/").status_code, 404)
        self.assertEqual(self.client.get("/api/vocabulary/sets/?level=5").json()["sets"], [])

    def test_source_columns_are_limited_without_per_word_queries(self):
        self.add_words(6, 480)
        self.register()
        group = VocabularySet.objects.filter(topik_level=6).first()
        catalog_fields = {"vocabulary_id", "korean", "topik_level"}
        detail_fields = catalog_fields | {
            "part_of_speech", "english", "vietnamese", "japanese", "chinese_simplified", "indonesian",
            "example_korean", "example_english",
        }
        for path, expected_fields, result_key, count in (
            ("/api/vocabulary/sets/?level=4", catalog_fields, "sets", 1),
            ("/api/vocabulary/sets/?level=6", catalog_fields, "sets", 24),
            (f"/api/vocabulary/sets/{group.pk}/", detail_fields, "words", 20),
        ):
            with self.subTest(path=path):
                with self.assertNumQueries(4) as queries:
                    result = self.client.get(path)
                self.assertEqual(result.status_code, 200)
                self.assertEqual(len(result.json()[result_key]), count)
                source_queries = [query["sql"] for query in queries
                                  if 'FROM "topik_bank"."vocabulary"' in query["sql"]]
                self.assertEqual(len(source_queries), 1)
                selected = source_queries[0].split(" FROM ", 1)[0]
                self.assertEqual({field.name for field in Vocabulary._meta.concrete_fields
                                  if f'."{field.column}"' in selected}, expected_fields)

    def test_source_removal_reports_unavailable_instead_of_partial_set(self):
        self.register()
        group = VocabularySet.objects.filter(topik_level=3).first()
        Vocabulary.objects.filter(pk=group.items.last().vocabulary_id).delete()
        for path in (f"/api/vocabulary/sets/{group.pk}/", "/api/vocabulary/sets/?level=3"):
            result = self.client.get(path)
            self.assertEqual(result.status_code, 503)
            self.assertEqual(result.json(), {"error": "vocabulary_unavailable"})

    def test_source_level_change_outside_preview_reports_unavailable(self):
        self.register()
        group = VocabularySet.objects.filter(topik_level=3).first()
        Vocabulary.objects.filter(pk=group.items.last().vocabulary_id).update(topik_level=5)
        for path in (f"/api/vocabulary/sets/{group.pk}/", "/api/vocabulary/sets/?level=3"):
            result = self.client.get(path)
            self.assertEqual(result.status_code, 503)
            self.assertEqual(result.json(), {"error": "vocabulary_unavailable"})

    def test_database_failure_has_a_safe_response(self):
        with patch("vocabulary.views.VocabularySet.objects.order_by", side_effect=DatabaseError("sensitive connection detail")):
            result = self.client.get("/api/vocabulary/levels/")
        self.assertEqual(result.status_code, 503)
        self.assertEqual(result.json(), {"error": "vocabulary_unavailable"})

    def test_constraints_prevent_duplicate_membership_and_invalid_positions(self):
        self.register()
        group = VocabularySet.objects.first()
        for fields in (
            {"vocabulary_id": 30001, "position": 20},
            {"vocabulary_id": 999999, "position": 1},
            {"vocabulary_id": 999999, "position": 21},
        ):
            with self.assertRaises(IntegrityError), transaction.atomic():
                VocabularySetItem.objects.create(set=group, **fields)
