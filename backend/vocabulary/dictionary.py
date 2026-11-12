import unicodedata

from django.db import DatabaseError

from .models import KoreanDictionarySense


LANGUAGES = {"en", "ja", "vi", "id", "zh-Hans"}
# Keep the numeric codes already used by the browser's analysis contract.
PARTS_OF_SPEECH = {
    1: "명사", 2: "대명사", 3: "수사", 4: "조사", 5: "동사", 6: "형용사",
    7: "관형사", 8: "부사", 9: "감탄사", 10: "접사", 11: "의존 명사",
    12: "보조 동사", 13: "보조 형용사", 14: "어미", 15: "품사 없음",
}
SOURCE_URL = "https://krdict.korean.go.kr/"


class ExampleLookupError(Exception):
    def __init__(self, code, status=503):
        self.code = code
        self.status = status
        super().__init__(code)


def lookup_candidate(headword, part_of_speech, language):
    headword = unicodedata.normalize("NFC", headword)
    rows = KoreanDictionarySense.objects.filter(
        headword=headword, part_of_speech=PARTS_OF_SPEECH[part_of_speech], entry_type="word",
    ).order_by("homonym_number", "sense_order", "id").values(
        "id", "homonym_number", "part_of_speech", "definition", "translations",
    )
    entries = {}
    for row in rows:
        key = row["homonym_number"]
        if key not in entries:
            if len(entries) == 3:
                break
            entries[key] = {
                "id": str(row["id"]), "headword": headword,
                "partOfSpeech": row["part_of_speech"], "sourceUrl": SOURCE_URL, "senses": [],
            }
        senses = entries[key]["senses"]
        if len(senses) < 3:
            translation = row["translations"].get(language, {})
            senses.append({
                "definition": row["definition"][:2000],
                "translation": translation.get("translation", "")[:500],
                "translatedDefinition": translation.get("translatedDefinition", "")[:2000],
            })
    return list(entries.values())


def lookup_meaning(candidates, language):
    try:
        if not KoreanDictionarySense.objects.filter(entry_type="word").exists():
            raise ExampleLookupError("dictionary_disabled")
        entries = {}
        for headword, part_of_speech in candidates[:3]:
            for entry in lookup_candidate(headword, part_of_speech, language):
                entries.setdefault(entry["id"], entry)
            if len(entries) >= 3:
                break
        return list(entries.values())[:3]
    except DatabaseError:
        raise ExampleLookupError("dictionary_unavailable") from None
