import re
import unicodedata
from collections import Counter

import xlrd
from django.core.management.base import CommandError

from .dictionary import PARTS_OF_SPEECH


TRANSLATION_LANGUAGES = {
    "mn": "몽골어", "ar": "아랍어", "zh-Hans": "중국어", "vi": "베트남어",
    "th": "타이어", "id": "인도네시아어", "ru": "러시아어", "en": "영어",
    "ja": "일본어", "fr": "프랑스어", "es": "스페인어",
}
MAIN_HEADERS = [
    "표제어", "동형어 번호", "구분", "품사", "고유어 여부", "원어", "발음", "활용",
    "파생어", "☞(가 보라)", "어휘 등급", "의미 범주", "주제 및 상황 범주", "전체 참고",
    "검색용 이형태", "관련어", "의미 참고", "다중 매체 정보", "문형", "문형 참고", "뜻풀이", "용례",
]
SUB_HEADERS = [
    "부표제어", "부표제어 전체 참고", "부표제어 관련어", "부표제어 의미 참고",
    "부표제어 문형", "부표제어 문형 참고", "부표제어 뜻풀이", "부표제어 용례",
]


def translation_headers(prefix=""):
    return [f"{name} {prefix}{suffix}" for name in TRANSLATION_LANGUAGES.values()
            for suffix in ("대역어", "대역어 뜻풀이")]


HEADERS = MAIN_HEADERS + translation_headers() + SUB_HEADERS + translation_headers("부표제어 ")
ENTRY_TYPES = {"단어": "word", "구": "phrase", "문법‧표현": "expression"}


def cell_text(value):
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def parse_row(row, source_file, source_row, orders):
    def invalid(reason):
        raise CommandError(f"{source_file}:{source_row}: {reason}")

    if any("\x00" in value for value in row.values()):
        invalid("NUL characters are not supported.")
    if not row["표제어"] or not re.fullmatch(r"\d{1,5}", row["동형어 번호"]):
        invalid("Missing headword or invalid homonym number.")
    homonym = int(row["동형어 번호"])
    if homonym > 32767 or row["품사"] not in PARTS_OF_SPEECH.values():
        invalid("Invalid homonym number or part of speech.")
    subentry = row["구분"] == "부표제어"
    prefix = "부표제어 " if subentry else ""
    definition, examples = row[f"{prefix}뜻풀이"], row[f"{prefix}용례"]
    if not definition:
        invalid("Missing definition.")
    if subentry:
        match = re.fullmatch(r"\[(속담|관용구)\]\s*(.+)", row["부표제어"])
        if not match or row["뜻풀이"]:
            invalid("Invalid subentry or ambiguous main/subentry definitions.")
        entry_type = {"속담": "proverb", "관용구": "idiom"}[match[1]]
        headword = match[2].strip()
        # The XLS part of speech and homonym number describe the parent, not the idiom.
        part_of_speech, homonym_number = "", 0
        consumed = {"부표제어", f"{prefix}뜻풀이", f"{prefix}용례"}
    else:
        entry_type = ENTRY_TYPES.get(row["구분"])
        if entry_type is None or row["부표제어"] or row["부표제어 뜻풀이"]:
            invalid("Unsupported entry type or unexpected subentry data.")
        headword = row["표제어"]
        part_of_speech, homonym_number = row["품사"], homonym
        consumed = {"표제어", "동형어 번호", "구분", "품사", "뜻풀이", "용례"}
    headword = unicodedata.normalize("NFC", headword)
    translations = {}
    for language, name in TRANSLATION_LANGUAGES.items():
        word_key, definition_key = f"{name} {prefix}대역어", f"{name} {prefix}대역어 뜻풀이"
        translations[language] = {
            "translation": row[word_key], "translatedDefinition": row[definition_key],
        }
        consumed.update((word_key, definition_key))
    # Keep distinct source senses even when their Korean definitions happen to match.
    key = (headword, homonym_number, part_of_speech, entry_type)
    if subentry:
        key += (row["표제어"], homonym, row["품사"])
    orders[key] += 1
    return {
        "headword": headword, "homonym_number": homonym_number,
        "part_of_speech": part_of_speech, "entry_type": entry_type,
        "sense_order": orders[key], "definition": definition, "translations": translations,
        "examples": examples, "metadata": {k: v for k, v in row.items() if v and k not in consumed},
        "source_file": source_file, "source_row": source_row,
    }


def read_senses(paths, *, progress=None):
    orders = Counter()
    for number, path in enumerate(paths, 1):
        if progress:
            progress(f"Reading XLS {number}/{len(paths)}: {path.name}")
        try:
            book = xlrd.open_workbook(str(path), on_demand=True)
        except (OSError, xlrd.XLRDError) as error:
            raise CommandError(f"{path.name}: cannot read XLS ({type(error).__name__}).") from None
        try:
            if book.nsheets != 1:
                raise CommandError(f"{path.name}: expected exactly one worksheet.")
            sheet = book.sheet_by_index(0)
            headers = [cell_text(v) for v in sheet.row_values(0)] if sheet.nrows else []
            if len(headers) != len(HEADERS) or set(headers) != set(HEADERS):
                raise CommandError(f"{path.name}: expected the 74 Korean Basic Dictionary columns.")
            if sheet.nrows < 2:
                raise CommandError(f"{path.name}: no dictionary rows.")
            for index in range(1, sheet.nrows):
                row = dict(zip(headers, (cell_text(v) for v in sheet.row_values(index))))
                yield parse_row(row, path.name, index + 1, orders)
        finally:
            book.release_resources()
        if progress:
            progress(f"Validated XLS {number}/{len(paths)}: {path.name}; {sheet.nrows - 1:,} rows")
