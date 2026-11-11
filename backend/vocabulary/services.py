import re

from django.conf import settings
from django.db import DatabaseError, transaction

from question_bank.models import Vocabulary, VocabularyQuestion


LEVELS = (3, 4, 5, 6)
PAGE_SIZE = 24


class VocabularyUnavailable(Exception):
    pass


def audio_url(word):
    if not settings.CLOUDFRONT_BASE_URL or not (word.audio_storage_bucket or "").strip():
        return None
    checksum = word.audio_file_sha256 or ""
    if not re.fullmatch(r"[a-f0-9]{64}", checksum):
        return None
    # Hub uses immutable, content-addressed MP3 paths for vocabulary audio.
    path = f"media/vocabulary-audio/{checksum}.mp3"
    if word.audio_storage_path != path:
        return None
    return f"{settings.CLOUDFRONT_BASE_URL}/{path}"


def split_words(word_ids):
    """Balance once at registration; never recalculate existing membership."""
    if not word_ids:
        return []
    count = (len(word_ids) + 19) // 20
    size, extra = divmod(len(word_ids), count)
    groups, offset = [], 0
    for index in range(count):
        end = offset + size + (index < extra)
        groups.append(word_ids[offset:end])
        offset = end
    return groups


def source_words(sets, *, include_details=False):
    entries = [(group, list(group.items.all())) for group in sets]
    fields = ("vocabulary_id", "korean", "topik_level")
    if include_details:
        fields += ("part_of_speech", "english", "vietnamese", "japanese", "chinese_simplified", "indonesian",
                   "example_korean", "example_english", "audio_storage_bucket", "audio_storage_path", "audio_file_sha256")
    words = Vocabulary.objects.only(*fields).in_bulk([item.vocabulary_id for _, items in entries for item in items])
    for group, items in entries:
        if not 1 <= len(items) <= 20 or [item.position for item in items] != list(range(1, len(items) + 1)):
            raise VocabularyUnavailable
        for item in items:
            word = words.get(item.vocabulary_id)
            if word is None or word.topik_level != group.topik_level:
                raise VocabularyUnavailable
    return words


def quiz_word_ids(words):
    try:
        # An unavailable question bank must not prevent word study.
        with transaction.atomic():
            return set(VocabularyQuestion.objects.filter(
                vocabulary_id__in=words, question_type="sentence_blank",
            ).values_list("vocabulary_id", flat=True).distinct())
    except DatabaseError:
        return None


def validate_question(question):
    if (not question.instruction.strip() or not question.stem.strip() or not question.explanation.strip()
            or not isinstance(question.choices, list) or len(question.choices) != 4
            or any(not isinstance(choice, str) or not choice.strip() for choice in question.choices)
            or not 1 <= question.correct_answer <= 4):
        raise VocabularyUnavailable


def word_meanings(word):
    return {"en": word.english, "vi": word.vietnamese, "ja": word.japanese,
            "zh-Hans": word.chinese_simplified, "id": word.indonesian}


def set_summary(group, words, quiz_words):
    items = list(group.items.all())
    return {
        "id": str(group.pk), "level": group.topik_level, "number": group.set_number,
        "wordCount": len(items), "preview": [words[item.vocabulary_id].korean for item in items[:3]],
        "quizQuestionCount": (sum(item.vocabulary_id in quiz_words for item in items)
                              if quiz_words is not None else None),
    }
