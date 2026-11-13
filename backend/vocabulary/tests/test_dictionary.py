import json
import uuid
from unittest.mock import patch

from django.db import DatabaseError, connection
from django.http import QueryDict
from django.test import RequestFactory, SimpleTestCase, TestCase, TransactionTestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from question_bank.models import Vocabulary, VocabularyQuestion
from .. import dictionary
from ..dictionary import ExampleLookupError, lookup_candidate, lookup_meaning
from ..example_analysis import example_version, parse_selection, validate_example
from ..models import KoreanDictionarySense, VocabularySet, VocabularySetItem


SENTENCE = "친구가 사과를 먹었어요."


def add_sense(**overrides):
    row = KoreanDictionarySense.objects.count() + 2
    return KoreanDictionarySense.objects.create(
        **{"headword": "먹다", "homonym_number": 0, "part_of_speech": "동사", "entry_type": "word",
           "sense_order": 1, "definition": "음식을 먹다.", "translations": {
               language: {"translation": f"eat-{language}", "translatedDefinition": f"To eat-{language}."}
               for language in dictionary.LANGUAGES
           }, "source_file": "fixture.xls", "source_row": row, **overrides},
    )


class DictionaryLookupTests(TestCase):
    def test_lookup_is_read_only_and_uses_all_five_languages_without_http(self):
        sense = add_sense()
        with patch("urllib.request.OpenerDirector.open", side_effect=AssertionError("No HTTP")):
            for language in dictionary.LANGUAGES:
                with self.subTest(language=language), CaptureQueriesContext(connection) as queries:
                    result = lookup_meaning([("먹다", 5)], language)
                    self.assertEqual(result[0]["id"], str(sense.pk))
                    self.assertEqual(result[0]["senses"][0]["translation"], f"eat-{language}")
                    self.assertEqual(result[0]["sourceUrl"], dictionary.SOURCE_URL)
                self.assertTrue(all(q["sql"].lstrip().upper().startswith("SELECT") for q in queries))

    def test_homonyms_and_senses_are_ordered_then_limited(self):
        for homonym in (4, 2, 3, 1):
            for order in (4, 2, 3, 1):
                add_sense(homonym_number=homonym, sense_order=order, definition=f"{homonym}:{order}")
        result = lookup_candidate("먹다", 5, "en")
        self.assertEqual([[s["definition"] for s in entry["senses"]] for entry in result],
                         [[f"{h}:{s}" for s in (1, 2, 3)] for h in (1, 2, 3)])

    def test_exact_word_and_pos_filter_excludes_phrases_and_subentries(self):
        for overrides in ({"headword": "잘먹다"}, {"part_of_speech": "명사"},
                          {"entry_type": "phrase"}, {"entry_type": "idiom", "part_of_speech": ""}):
            add_sense(**overrides)
        expected = add_sense()
        self.assertEqual([e["id"] for e in lookup_candidate("먹다", 5, "en")], [str(expected.pk)])
        auxiliary = add_sense(headword="보다", part_of_speech="보조 동사")
        add_sense(headword="보다", part_of_speech="동사")
        self.assertEqual(lookup_candidate("보다", 12, "en")[0]["id"], str(auxiliary.pk))

    def test_missing_translation_preserves_definition_and_partial_translation(self):
        add_sense(translations={"id": {"translation": "", "translatedDefinition": "Definisi."}})
        self.assertEqual(lookup_candidate("먹다", 5, "ja")[0]["senses"][0],
                         {"definition": "음식을 먹다.", "translation": "", "translatedDefinition": ""})
        self.assertEqual(lookup_candidate("먹다", 5, "id")[0]["senses"][0]["translatedDefinition"], "Definisi.")

    def test_candidate_order_deduplication_limit_and_no_match(self):
        for word in ("먹다", "보다", "가다"):
            add_sense(headword=word)
        result = lookup_meaning([("보다", 5), ("먹다", 5), ("보다", 5)], "en")
        self.assertEqual([e["headword"] for e in result], ["보다", "먹다"])
        self.assertEqual(lookup_meaning([("없는단어", 1)], "en"), [])

    def test_empty_or_unavailable_dictionary_is_not_a_successful_empty_search(self):
        with self.assertRaises(ExampleLookupError) as error:
            lookup_meaning([("먹다", 5)], "en")
        self.assertEqual(error.exception.code, "dictionary_disabled")
        with patch.object(KoreanDictionarySense.objects, "filter", side_effect=DatabaseError("private")):
            with self.assertRaises(ExampleLookupError) as error:
                lookup_meaning([("먹다", 5)], "en")
        self.assertEqual((error.exception.code, error.exception.status), ("dictionary_unavailable", 503))

    def test_view_keeps_selection_validation_and_returns_db_senses(self):
        from ..example_views import example_meaning
        add_sense()
        params = {"start": "8", "end": "12", "surface": "먹었어요",
                  "candidates": json.dumps([["먹다", 5]]), "version": example_version(SENTENCE), "lang": "en"}
        factory = RequestFactory()
        with patch("vocabulary.example_views.source_example", return_value=SENTENCE):
            result = example_meaning(factory.get("/", params), 100)
            self.assertEqual(result.status_code, 200)
            self.assertEqual(json.loads(result.content)["entries"][0]["senses"][0]["translation"], "eat-en")
            self.assertEqual(result["Cache-Control"], "no-store")
            self.assertFalse(result.cookies)
            for change, status in (({"surface": "다른단어"}, 400), ({"version": "0" * 64}, 409)):
                with patch("vocabulary.example_views.lookup_meaning") as lookup:
                    result = example_meaning(factory.get("/", params | change), 100)
                    self.assertEqual(result.status_code, status)
                    lookup.assert_not_called()


class ExampleSelectionTests(SimpleTestCase):
    def params(self, **overrides):
        params = QueryDict("", mutable=True)
        params.update({"start": "8", "end": "12", "surface": "먹었어요",
                       "candidates": json.dumps([["먹다", 5]]),
                       "version": example_version(SENTENCE), "lang": "en", **overrides})
        return params

    def test_selection_validation_and_unicode_positions(self):
        self.assertEqual(parse_selection(self.params()), (8, 12, [("먹다", 5)]))
        text = "😀 친구가 사과를 먹었어요."
        validate_example(text, example_version(text), 10, 14, "먹었어요")

    def test_malformed_candidates_are_rejected(self):
        for value in [None, {}, [], [["먹다", True]], [["먹다", 99]], [["먹다", 5]] * 4,
                      [["먹다", 5]] * 2, [["x" * 101, 5]], [["https://bad.invalid", 5]],
                      [["먹다\n", 5]], [["먹다"]], [5], [["먹다", 5, 1]]]:
            with self.subTest(value=value), self.assertRaises(ExampleLookupError):
                parse_selection(self.params(candidates=json.dumps(value)))
        for value in ["not-json", "[" * 1100, "x" * 2001]:
            with self.assertRaises(ExampleLookupError):
                parse_selection(self.params(candidates=value))

    def test_duplicate_fields_partial_words_and_wrong_surface_are_rejected(self):
        params = self.params()
        params.appendlist("start", "8")
        with self.assertRaises(ExampleLookupError):
            parse_selection(params)
        for start, end, surface in [(8, 10, "먹었"), (7, 12, " 먹었어요"), (8, 12, "다른단어")]:
            with self.assertRaises(ExampleLookupError):
                validate_example(SENTENCE, example_version(SENTENCE), start, end, surface)


class ExampleAPITests(TransactionTestCase):
    def setUp(self):
        add_sense()
        with connection.cursor() as cursor:
            cursor.execute("CREATE SCHEMA topik_bank")
        with connection.schema_editor() as editor:
            editor.create_model(Vocabulary)
            editor.create_model(VocabularyQuestion)
        self.word = Vocabulary.objects.create(
            vocabulary_id=100, korean="먹다", part_of_speech="동사", topik_level=3,
            english="eat", vietnamese="", japanese="", example_korean=SENTENCE, example_english="My friend ate an apple.",
        )
        self.group = VocabularySet.objects.create(topik_level=3, set_number=1)
        VocabularySetItem.objects.create(set=self.group, vocabulary_id=self.word.pk, position=1)
        self.question = VocabularyQuestion.objects.create(
            question_id=1, vocabulary_id=self.word.pk, question_type="sentence_blank", position=1, instruction="Choose.",
            stem="친구가 사과를 (   ).", choices=["먹었어요", "읽었어요", "갔어요", "잤어요"],
            correct_answer=1, accepted_answers=["먹었어요"], explanation="먹다.", provider="synthetic", model="synthetic",
            generation_id=uuid.uuid4(), source_hash="a" * 64, created_at=timezone.now(), updated_at=timezone.now(),
        )

    def tearDown(self):
        with connection.schema_editor() as editor:
            editor.delete_model(VocabularyQuestion)
            editor.delete_model(Vocabulary)
        with connection.cursor() as cursor:
            cursor.execute("DROP SCHEMA topik_bank")

    def meaning(self, word_id=100, **overrides):
        return self.client.get(f"/api/vocabulary/words/{word_id}/example-meaning/", {
            "start": "8", "end": "12", "surface": "먹었어요", "candidates": json.dumps([["먹다", 5]]),
            "version": example_version(SENTENCE), "lang": "en", **overrides,
        })

    def test_endpoints_are_read_only_and_only_lookup_calls_the_dictionary(self):
        with CaptureQueriesContext(connection) as queries:
            meaning = self.meaning()
            self.assertEqual(meaning.status_code, 200)
            self.assertEqual(meaning.json()["surface"], "먹었어요")
            self.assertEqual(meaning.json()["entries"][0]["senses"][0]["translation"], "eat-en")
        self.assertTrue(all(query["sql"].lstrip().upper().startswith("SELECT") for query in queries))
        self.assertEqual(meaning["Cache-Control"], "no-store")
        self.assertFalse(meaning.cookies)

    def test_membership_level_and_missing_ids_are_checked(self):
        self.assertEqual(self.meaning(word_id=999).status_code, 404)
        self.assertEqual(self.meaning(word_id=2**63).status_code, 404)
        Vocabulary.objects.filter(pk=100).update(topik_level=4)
        self.assertEqual(self.meaning().status_code, 404)
        Vocabulary.objects.filter(pk=100).update(topik_level=3)
        VocabularySetItem.objects.all().delete()
        self.assertEqual(self.meaning().status_code, 404)

    def test_invalid_selection_and_changed_example_never_call_dictionary(self):
        with patch("vocabulary.example_views.lookup_meaning") as lookup:
            for invalid in ({"start": "-1"}, {"end": "9999"}, {"lang": "xx"}, {"version": "invalid"}, {"surface": "다른단어"}):
                with self.subTest(invalid=invalid):
                    self.assertEqual(self.meaning(**invalid).status_code, 400)
            Vocabulary.objects.filter(pk=100).update(example_korean="예문이 바뀌었어요.")
            self.assertEqual(self.meaning().status_code, 409)
            lookup.assert_not_called()

    def test_old_analysis_version_is_rejected(self):
        with patch("vocabulary.example_analysis.ANALYSIS_VERSION", "previous-analyzer-version"):
            old_version = example_version(SENTENCE)
        with patch("vocabulary.example_views.lookup_meaning") as lookup:
            self.assertEqual(self.meaning(version=old_version).status_code, 409)
            lookup.assert_not_called()

    def test_disabled_lookup_does_not_affect_study_and_quiz(self):
        KoreanDictionarySense.objects.all().delete()
        self.assertEqual(self.meaning().json(), {"error": "dictionary_disabled"})
        self.assert_study_and_quiz()

    def assert_study_and_quiz(self):
        path = f"/api/vocabulary/sets/{self.group.pk}/"
        self.assertEqual(self.client.get(path).json()["words"][0]["exampleKorean"], SENTENCE)
        questions = self.client.get(path + "questions/").json()["questions"]
        self.assertEqual(len(questions), 1)
        result = self.client.post(path + f"questions/{self.question.pk}/check/", {
            "selectedOption": 1, "version": questions[0]["version"],
        }, content_type="application/json")
        self.assertEqual(result.status_code, 200)
        self.assertTrue(result.json()["isCorrect"])

    def test_dictionary_failure_does_not_affect_study_or_quiz(self):
        with patch("vocabulary.dictionary.lookup_candidate", side_effect=DatabaseError("private")):
            result = self.meaning()
            self.assertEqual(result.status_code, 503)
            self.assertEqual(result.json(), {"error": "dictionary_unavailable"})
            self.assert_study_and_quiz()

    def test_post_is_rejected_and_no_results_are_successful(self):
        self.assertEqual(self.client.post("/api/vocabulary/words/100/example-meaning/").status_code, 405)
        self.assertEqual(self.meaning(candidates=json.dumps([["없는단어", 1]])).json(),
                         {"surface": "먹었어요", "entries": []})
