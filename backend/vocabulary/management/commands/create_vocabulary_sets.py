from unicodedata import normalize

from django.core.management.base import BaseCommand, CommandError
from django.db import DatabaseError, connection, transaction

from question_bank.models import Vocabulary
from vocabulary.models import VocabularySet, VocabularySetItem
from vocabulary.services import LEVELS, split_words


class Command(BaseCommand):
    help = "Arrange each level in Korean alphabetical order across sets of up to 20, keeping existing set numbers."

    def add_arguments(self, parser):
        parser.add_argument("--check", action="store_true", help="Preview additions and reordering without writing data.")

    def handle(self, *args, **options):
        try:
            with transaction.atomic():
                with connection.cursor() as cursor:
                    cursor.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ")
                    if options["check"]:
                        cursor.execute("SET TRANSACTION READ ONLY")
                    else:
                        cursor.execute("LOCK TABLE vocabulary_sets, vocabulary_set_items IN SHARE ROW EXCLUSIVE MODE")
                words_by_level = {level: {} for level in LEVELS}
                for word_id, level, korean in Vocabulary.objects.values_list("vocabulary_id", "topik_level", "korean"):
                    if level not in words_by_level:
                        raise CommandError("Source vocabulary contains an unsupported level.")
                    words_by_level[level][word_id] = normalize("NFC", korean)
                current_items = {}
                groups_by_level = {level: [] for level in LEVELS}
                for group in VocabularySet.objects.prefetch_related("items"):
                    groups_by_level[group.topik_level].append(group)
                    items = list(group.items.all())
                    if not 1 <= len(items) <= 20 or [item.position for item in items] != list(range(1, len(items) + 1)):
                        raise CommandError("Existing set membership is incomplete; no sets were changed.")
                    for item in items:
                        if item.vocabulary_id not in words_by_level[group.topik_level]:
                            raise CommandError("An assigned word is missing or its source level changed; no sets were changed.")
                        current_items[item.vocabulary_id] = item
                for level, words in words_by_level.items():
                    self.register_level(level, words, groups_by_level[level], current_items, options["check"])
        except DatabaseError:
            raise CommandError("Vocabulary database unavailable. Apply migrations and check the source schema, then retry.") from None

    def register_level(self, level, words, groups, current_items, check):
        ordered_ids = sorted(words, key=lambda word_id: (words[word_id], word_id))
        batches = split_words(ordered_ids, minimum_sets=len(groups))
        last_number = groups[-1].set_number if groups else 0
        new_groups = [
            VocabularySet(topik_level=level, set_number=last_number + offset)
            for offset in range(1, len(batches) - len(groups) + 1)
        ]
        if not check:
            VocabularySet.objects.bulk_create(new_groups)
        changes = []
        moved_ids = []
        for group, word_ids in zip(groups + new_groups, batches):
            for position, word_id in enumerate(word_ids, start=1):
                item = current_items.get(word_id)
                if item is None:
                    item = VocabularySetItem(vocabulary_id=word_id)
                elif item.set_id == group.pk and item.position == position:
                    continue
                else:
                    moved_ids.append(item.pk)
                item.set = group
                item.position = position
                changes.append(item)

        if not check and changes:
            # Free the old positions together so swaps respect the unique set/position constraint.
            VocabularySetItem.objects.filter(pk__in=moved_ids).delete()
            VocabularySetItem.objects.bulk_create(changes)
        add, move = ("would add", "would move") if check else ("added", "moved")
        self.stdout.write(
            f"Level {level}: {add} {len(new_groups)} sets / {len(changes) - len(moved_ids)} words, "
            f"{move} {len(moved_ids)} existing words."
        )
