from question_bank.models import Vocabulary


LEVELS = (3, 4, 5, 6)
PAGE_SIZE = 24


class VocabularyUnavailable(Exception):
    pass


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
                   "example_korean", "example_english")
    words = Vocabulary.objects.only(*fields).in_bulk([item.vocabulary_id for _, items in entries for item in items])
    for group, items in entries:
        if not 1 <= len(items) <= 20 or [item.position for item in items] != list(range(1, len(items) + 1)):
            raise VocabularyUnavailable
        for item in items:
            word = words.get(item.vocabulary_id)
            if word is None or word.topik_level != group.topik_level:
                raise VocabularyUnavailable
    return words


def set_summary(group, words):
    items = list(group.items.all())
    return {
        "id": str(group.pk), "level": group.topik_level, "number": group.set_number,
        "wordCount": len(items), "preview": [words[item.vocabulary_id].korean for item in items[:3]],
    }
