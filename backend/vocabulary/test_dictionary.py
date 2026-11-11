import io
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from http.client import IncompleteRead
from threading import Event
from unittest.mock import patch
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlsplit

from django.conf import settings
from django.db import connection
from django.test import SimpleTestCase, TransactionTestCase, override_settings
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from question_bank.models import Vocabulary, VocabularyQuestion
from . import dictionary
from .dictionary import ExampleLookupError, fetch_entries, lookup_candidate
from .example_analysis import example_version, parse_selection, validate_example
from django.http import QueryDict
import json
from .models import VocabularySet, VocabularySetItem


SENTENCE = "친구가 사과를 먹었어요."
XML = '''<channel><total>1</total><item><target_code>123</target_code>
<word>먹다</word><pos>동사</pos><link>https://untrusted.invalid/</link>
<sense><definition>음식을 먹다.</definition><translation><trans_word>eat</trans_word>
<trans_dfn>To eat food.</trans_dfn></translation></sense></item></channel>'''.encode()


@override_settings(KRDICT_API_KEY="synthetic-key", CACHES={})
class DictionaryClientTests(SimpleTestCase):
    def setUp(self):
        dictionary._request_times.clear()
        dictionary._retry_at = 0.0
        dictionary._last_failure = None

    def test_language_mapping_exact_search_and_trusted_source_links(self):
        for language, expected in dictionary.LANGUAGES.items():
            with self.subTest(language=language), patch("vocabulary.dictionary.build_opener") as opener:
                opener.return_value.open.return_value = io.BytesIO(XML)
                entries = fetch_entries("먹다", 5, language)
                request = opener.return_value.open.call_args.args[0]
                query = parse_qs(urlsplit(request.full_url).query)
                self.assertEqual(query["q"], ["먹다"])
                self.assertEqual(query["trans_lang"], [expected])
                self.assertEqual(query["method"], ["exact"])
                self.assertEqual(query["pos"], ["5"])
                self.assertEqual(opener.return_value.open.call_args.kwargs["timeout"], 3)
                self.assertEqual(entries[0]["senses"][0]["translation"], "eat")
                self.assertEqual(entries[0]["sourceUrl"], "https://krdict.korean.go.kr/dicSearch/SearchView?ParaWordNo=123")

    def test_missing_translation_preserves_korean_definition(self):
        body = b"<channel><total>1</total><item><target_code>1</target_code><word>test</word><sense><definition>definition</definition></sense></item></channel>"
        entry = dictionary.parse_entries(body)[0]
        self.assertEqual(entry["senses"][0], {"definition": "definition", "translation": "", "translatedDefinition": ""})

    def test_malformed_oversized_and_entity_xml_are_not_empty_results(self):
        bodies = [b"<html>error</html>", b"not XML", b"<error><error_code>010</error_code></error>",
                  b"<channel><total>1</total></channel>", b"<channel><total>no</total></channel>",
                  b'<!DOCTYPE channel [<!ENTITY x "expanded">]><channel><total>0</total>&x;</channel>',
                  b"x" * (dictionary.MAX_RESPONSE_BYTES + 1)]
        for body in bodies:
            with self.subTest(size=len(body)), patch("vocabulary.dictionary.build_opener") as opener:
                opener.return_value.open.return_value = io.BytesIO(body)
                with self.assertRaises(ExampleLookupError) as error:
                    fetch_entries("먹다", 5, "en")
                self.assertEqual(str(error.exception), "dictionary_unavailable")

    def test_upstream_errors_are_sanitized_and_timeouts_are_distinct(self):
        for failure, status in [(TimeoutError("secret-url"), 504), (URLError(TimeoutError("secret")), 504),
                                (URLError("secret-url"), 503), (IncompleteRead(b"private"), 503),
                                (HTTPError("https://example.invalid/?key=synthetic-key", 403, "private", {}, None), 503)]:
            with self.subTest(failure=type(failure).__name__), patch("vocabulary.dictionary.build_opener") as opener:
                opener.return_value.open.side_effect = failure
                with self.assertRaises(ExampleLookupError) as error:
                    fetch_entries("먹다", 5, "en")
                self.assertEqual(error.exception.status, status)
                self.assertNotIn("secret", str(error.exception))
                self.assertNotIn("synthetic-key", str(error.exception))

    def test_success_and_empty_results_are_fetched_on_every_lookup(self):
        for entries in ([], dictionary.parse_entries(XML)):
            with self.subTest(entries=bool(entries)), patch("vocabulary.dictionary.fetch_entries", return_value=entries) as fetch:
                for language, pos in (("en", 5), ("en", 5), ("ja", 5), ("en", 6)):
                    self.assertEqual(lookup_candidate("먹다", pos, language), entries)
                    fetch.assert_called_with("먹다", pos, language)
                self.assertEqual(fetch.call_count, 4)

    def test_failure_cooldown_preserves_status_then_retries_after_expiry(self):
        with patch("vocabulary.dictionary.time.monotonic", return_value=100) as clock, \
                patch("vocabulary.dictionary.fetch_entries", return_value=[]) as fetch:
            lookup_candidate("먹다", 5, "en")
            fetch.side_effect = ExampleLookupError("dictionary_timeout", 504)
            for headword in ("보다", "가다", "먹다"):
                with self.assertRaises(ExampleLookupError) as error:
                    lookup_candidate(headword, 5, "en")
                self.assertEqual((error.exception.code, error.exception.status), ("dictionary_timeout", 504))
            self.assertEqual(fetch.call_count, 2)
            clock.return_value = 115
            fetch.side_effect = None
            self.assertEqual(lookup_candidate("먹다", 5, "en"), [])
            self.assertEqual(fetch.call_count, 3)

    def test_busy_and_rate_limited_calls_do_not_start_network_requests(self):
        with patch("vocabulary.dictionary.fetch_entries") as fetch:
            with dictionary._lookup_lock:
                with self.assertRaises(ExampleLookupError) as error:
                    lookup_candidate("먹다", 5, "en")
            self.assertEqual(error.exception.status, 429)
            dictionary._request_times.extend([time.monotonic()] * 60)
            with self.assertRaises(ExampleLookupError) as error:
                lookup_candidate("먹다", 5, "en")
            self.assertEqual(error.exception.status, 429)
            fetch.assert_not_called()

    def test_repeated_requests_count_towards_limit_and_resume_after_window(self):
        with patch("vocabulary.dictionary.time.monotonic", return_value=100) as clock, \
                patch("vocabulary.dictionary.fetch_entries", return_value=[]) as fetch:
            for _ in range(60):
                lookup_candidate("먹다", 5, "en")
            with self.assertRaises(ExampleLookupError) as error:
                lookup_candidate("먹다", 5, "en")
            self.assertEqual(error.exception.status, 429)
            self.assertEqual(fetch.call_count, 60)
            clock.return_value = 160
            self.assertEqual(lookup_candidate("먹다", 5, "en"), [])
            self.assertEqual(fetch.call_count, 61)
            self.assertEqual(len(dictionary._request_times), 1)

    def test_redirects_are_not_followed(self):
        self.assertIsNone(dictionary.NoRedirect().redirect_request(None, None, 302, "", {}, "https://other.invalid/"))


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


@override_settings(KRDICT_API_KEY="synthetic-key", CACHES={})
class ExampleAPITests(TransactionTestCase):
    def setUp(self):
        dictionary._request_times.clear()
        dictionary._retry_at = 0.0
        dictionary._last_failure = None
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
        with patch("vocabulary.dictionary.fetch_entries", return_value=dictionary.parse_entries(XML)) as fetch:
            with CaptureQueriesContext(connection) as queries:
                meaning = self.meaning()
                self.assertEqual(meaning.status_code, 200)
                self.assertEqual(meaning.json()["surface"], "먹었어요")
                fetch.assert_called_once_with("먹다", 5, "en")
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

    @override_settings(KRDICT_API_KEY="")
    def test_disabled_lookup_does_not_affect_study_and_quiz(self):
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
        with patch("vocabulary.dictionary.fetch_entries", side_effect=ExampleLookupError("dictionary_timeout", 504)):
            self.assertEqual(self.meaning().status_code, 504)
            self.assert_study_and_quiz()

    def test_saturated_dictionary_limit_does_not_affect_study_or_quiz(self):
        dictionary._request_times.extend([time.monotonic()] * 60)
        with patch("vocabulary.dictionary.fetch_entries") as fetch:
            result = self.meaning()
            self.assertEqual(result.status_code, 429)
            self.assertEqual(result["Retry-After"], "5")
            fetch.assert_not_called()
            self.assert_study_and_quiz()

    def test_slow_lookup_leaves_study_and_quiz_available(self):
        entered, release = Event(), Event()

        def slow_fetch(*args):
            entered.set()
            release.wait(5)
            return []

        with patch("vocabulary.dictionary.fetch_entries", side_effect=slow_fetch), ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(lookup_candidate, "먹다", 5, "en")
            try:
                self.assertTrue(entered.wait(2))
                self.assert_study_and_quiz()
                self.assertFalse(future.done())
            finally:
                release.set()
            self.assertEqual(future.result(), [])

    def test_post_is_rejected_and_no_results_are_successful(self):
        self.assertEqual(self.client.post("/api/vocabulary/words/100/example-meaning/").status_code, 405)
        with patch("vocabulary.dictionary.fetch_entries", return_value=[]):
            self.assertEqual(self.meaning().json(), {"surface": "먹었어요", "entries": []})
