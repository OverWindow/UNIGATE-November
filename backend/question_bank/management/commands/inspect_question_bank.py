import json
import uuid

from django.core.management.base import BaseCommand, CommandError
from django.db import DatabaseError, connection, transaction
from django.db.models import Count

from question_bank.models import AudioAsset, Item, ItemAudioBinding, QuestionSet, VisualAsset


class Command(BaseCommand):
    help = "Read Hub question-bank counts and set membership without modifying data."

    def add_arguments(self, parser):
        parser.add_argument("--set-id", type=uuid.UUID, help="Inspect one set UUID.")

    def handle(self, *args, **options):
        try:
            with transaction.atomic():
                with connection.cursor() as cursor:
                    cursor.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
                models = (QuestionSet, Item, AudioAsset, ItemAudioBinding, VisualAsset)
                counts = {m._meta.db_table: m.objects.count() for m in models}
                sets = QuestionSet.objects.all()
                if options["set_id"]:
                    sets = sets.filter(pk=options["set_id"])
                    if not sets.exists():
                        raise CommandError("The requested set does not exist.")
                entries = list(sets.annotate(item_count=Count("items")).order_by("exam_format", "section", "generator_version", "set_sequence")
                               .values("set_id", "exam_format", "section", "set_sequence", "review_status", "item_count"))
                # Exercise the complete mappings, including audio history and media joins.
                item = Item.objects.select_related("set").first()
                if item:
                    list(item.audio_bindings.select_related("audio_asset")[:1])
                    list(item.visual_assets.all()[:1])
                self.stdout.write(json.dumps({"counts": counts, "sets": entries}, ensure_ascii=False, default=str))
        except DatabaseError:
            raise CommandError("Question bank is unavailable. Initialize it from Hub and check DB permissions/schema.") from None
