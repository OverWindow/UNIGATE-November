import re
import time
from collections import deque
from http.client import HTTPException
from threading import Lock
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import HTTPRedirectHandler, Request, build_opener

from defusedxml import ElementTree
from defusedxml.common import DefusedXmlException
from django.conf import settings
from django.views.decorators.debug import sensitive_variables


LANGUAGES = {"en": "1", "ja": "2", "vi": "7", "id": "9", "zh-Hans": "11"}
ENDPOINT = "https://krdict.korean.go.kr/api/search"
MAX_RESPONSE_BYTES = 1_048_576
_lookup_lock = Lock()
_request_times = deque()
_retry_at = 0.0
_last_failure = None


class ExampleLookupError(Exception):
    def __init__(self, code, status=503):
        self.code = code
        self.status = status
        super().__init__(code)


def ensure_configured():
    if not settings.KRDICT_API_KEY:
        raise ExampleLookupError("dictionary_disabled")


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def parse_entries(body):
    root = ElementTree.fromstring(body, forbid_dtd=True)
    if root.tag != "channel" or not re.fullmatch(r"\d+", root.findtext("total", "")):
        raise ExampleLookupError("dictionary_unavailable")
    entries = []
    for item in root.findall("item")[:3]:
        identifier = item.findtext("target_code", "")
        headword = item.findtext("word", "").strip()
        if not re.fullmatch(r"\d{1,18}", identifier) or not headword:
            raise ExampleLookupError("dictionary_unavailable")
        senses = []
        for sense in item.findall("sense")[:3]:
            definition = sense.findtext("definition", "").strip()
            if not definition:
                continue
            translation = sense.find("translation")
            senses.append({
                "definition": definition[:2000],
                "translation": (translation.findtext("trans_word", "").strip()[:500]
                                if translation is not None else ""),
                "translatedDefinition": (translation.findtext("trans_dfn", "").strip()[:2000]
                                          if translation is not None else ""),
            })
        if not senses:
            raise ExampleLookupError("dictionary_unavailable")
        entries.append({
            "id": identifier, "headword": headword[:100],
            "partOfSpeech": item.findtext("pos", "")[:50], "senses": senses,
            "sourceUrl": f"https://krdict.korean.go.kr/dicSearch/SearchView?ParaWordNo={identifier}",
        })
    if int(root.findtext("total")) > 0 and not entries:
        raise ExampleLookupError("dictionary_unavailable")
    return entries


@sensitive_variables()
def fetch_entries(headword, part_of_speech, language):
    query = urlencode({
        "key": settings.KRDICT_API_KEY, "q": headword, "num": 10,
        "part": "word", "advanced": "y", "target": 1, "method": "exact",
        "type1": "word", "pos": part_of_speech,
        "translated": "y", "trans_lang": LANGUAGES[language],
    })
    request = Request(f"{ENDPOINT}?{query}", headers={"Accept": "application/xml"})
    try:
        with build_opener(NoRedirect()).open(request, timeout=3) as response:
            body = response.read(MAX_RESPONSE_BYTES + 1)
        if len(body) > MAX_RESPONSE_BYTES:
            raise ExampleLookupError("dictionary_unavailable")
        return parse_entries(body)
    except HTTPError as error:
        error.close()
        raise ExampleLookupError("dictionary_unavailable") from None
    except TimeoutError:
        raise ExampleLookupError("dictionary_timeout", 504) from None
    except URLError as error:
        code = "dictionary_timeout" if isinstance(error.reason, TimeoutError) else "dictionary_unavailable"
        raise ExampleLookupError(code, 504 if code == "dictionary_timeout" else 503) from None
    except (OSError, HTTPException, ValueError, ElementTree.ParseError, DefusedXmlException):
        # Upstream URLs and exceptions can contain the API key.
        raise ExampleLookupError("dictionary_unavailable") from None


def lookup_candidate(headword, part_of_speech, language):
    global _retry_at, _last_failure
    ensure_configured()
    # Leave the other Gunicorn request thread available to ordinary study/quiz requests.
    if not _lookup_lock.acquire(blocking=False):
        raise ExampleLookupError("too_many_requests", 429)
    try:
        now = time.monotonic()
        if _last_failure is not None and now < _retry_at:
            raise ExampleLookupError(*_last_failure)
        while _request_times and _request_times[0] <= now - 60:
            _request_times.popleft()
        if len(_request_times) >= 60:
            raise ExampleLookupError("too_many_requests", 429)
        _request_times.append(now)
        try:
            entries = fetch_entries(headword, part_of_speech, language)
        except ExampleLookupError as error:
            _last_failure = (error.code, error.status)
            _retry_at = time.monotonic() + 15
            raise
        _last_failure = None
        return entries
    finally:
        _lookup_lock.release()


def lookup_meaning(candidates, language):
    entries = {}
    for headword, part_of_speech in candidates[:3]:
        for entry in lookup_candidate(headword, part_of_speech, language):
            entries.setdefault(entry["id"], entry)
        if len(entries) >= 3:
            break
    return list(entries.values())[:3]
