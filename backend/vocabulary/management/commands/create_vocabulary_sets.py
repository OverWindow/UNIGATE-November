from django.core.management.base import BaseCommand, CommandError
from django.db import DatabaseError, connection, transaction

from question_bank.models import Vocabulary
from vocabulary.models import VocabularySet, VocabularySetItem
from vocabulary.services import LEVELS, split_words


class Command(BaseCommand):
    help = "Register vocabulary in balanced sets of up to 20, preserving all existing sets."

    def add_arguments(self, parser):
        parser.add_argument("--check", action="store_true", help="Preview registration without writing data.")

    def handle(self, *args, **options):
        try:
            with transaction.atomic():
                with connection.cursor() as cursor:
                    cursor.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ")
                    if options["check"]:
                        cursor.execute("SET TRANSACTION READ ONLY")
                    else:
                        cursor.execute("LOCK TABLE vocabulary_sets, vocabulary_set_items IN SHARE ROW EXCLUSIVE MODE")
                sources = dict(Vocabulary.objects.order_by("vocabulary_id").values_list("vocabulary_id", "topik_level"))
                if any(level not in LEVELS for level in sources.values()):
                    raise CommandError("Source vocabulary contains an unsupported level.")
                assigned, last_number = set(), dict.fromkeys(LEVELS, 0)
                for group in VocabularySet.objects.prefetch_related("items"):
                    items = list(group.items.all())
                    if not 1 <= len(items) <= 20 or [item.position for item in items] != list(range(1, len(items) + 1)):
                        raise CommandError("Existing set membership is incomplete; no sets were changed.")
                    for item in items:
                        if sources.get(item.vocabulary_id) != group.topik_level:
                            raise CommandError("An assigned word is missing or its source level changed; no sets were changed.")
                        assigned.add(item.vocabulary_id)
                    last_number[group.topik_level] = max(last_number[group.topik_level], group.set_number)
                for level in LEVELS:
                    pending = [pk for pk, source_level in sources.items() if source_level == level and pk not in assigned]
                    groups = split_words(pending)
                    if not options["check"]:
                        for number, ids in enumerate(groups, start=last_number[level] + 1):
                            group = VocabularySet.objects.create(topik_level=level, set_number=number)
                            VocabularySetItem.objects.bulk_create([
                                VocabularySetItem(set=group, vocabulary_id=pk, position=position)
                                for position, pk in enumerate(ids, start=1)
                            ])
                    action = "would add" if options["check"] else "added"
                    self.stdout.write(f"Level {level}: {action} {len(groups)} sets / {len(pending)} words.")
        except DatabaseError:
            raise CommandError("Vocabulary database unavailable. Apply migrations and check the source schema, then retry.") from None
