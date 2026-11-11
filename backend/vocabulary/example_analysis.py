import hashlib
import json
import re

from .dictionary import ExampleLookupError, LANGUAGES


ANALYSIS_VERSION = "4:garu-0.13.0:segments=1"
MAX_EXAMPLE_LENGTH = 2000
PARTS_OF_SPEECH = {1, 2, 3, 5, 6, 7, 8, 11, 12}


def example_version(text):
    return hashlib.sha256(f"{ANALYSIS_VERSION}\0{text}".encode()).hexdigest()


def parse_selection(params):
    invalid = ExampleLookupError("invalid_parameters", 400)
    required = {"start", "end", "surface", "candidates", "version", "lang"}
    if set(params) != required or any(len(params.getlist(key)) != 1 for key in required):
        raise invalid
    if (not re.fullmatch(r"[a-f0-9]{64}", params["version"]) or params["lang"] not in LANGUAGES
            or any(not re.fullmatch(r"0|[1-9]\d{0,3}", params[key]) for key in ("start", "end"))
            or not 0 <= int(params["start"]) < int(params["end"]) <= MAX_EXAMPLE_LENGTH
            or not 1 <= len(params["surface"]) <= MAX_EXAMPLE_LENGTH or len(params["candidates"]) > 2000):
        raise invalid
    try:
        candidates = json.loads(params["candidates"])
    except (ValueError, RecursionError):
        raise invalid from None
    if not isinstance(candidates, list) or not 1 <= len(candidates) <= 3:
        raise invalid
    validated = []
    for candidate in candidates:
        if (not isinstance(candidate, list) or len(candidate) != 2 or not isinstance(candidate[0], str)
                or not re.fullmatch(r"[\w· -]{1,100}", candidate[0]) or not re.search(r"[가-힣]", candidate[0])
                or type(candidate[1]) is not int or candidate[1] not in PARTS_OF_SPEECH):
            raise invalid
        value = tuple(candidate)
        if value in validated:
            raise invalid
        validated.append(value)
    return int(params["start"]), int(params["end"]), validated


def validate_example(text, version, start, end, surface):
    if len(text) > MAX_EXAMPLE_LENGTH:
        raise ExampleLookupError("example_unavailable")
    if example_version(text) != version:
        raise ExampleLookupError("example_changed", 409)
    if not any(match.start() == start and match.end() == end and match.group() == surface
               for match in re.finditer(r"\w+", text)):
        raise ExampleLookupError("invalid_parameters", 400)
