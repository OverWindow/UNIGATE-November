from django.core.management.base import BaseCommand, CommandError
from django.db import DatabaseError, transaction
from django.db.models import Max

from pbt.bank import BankNotReady, load_set
from pbt.models import Exam
from question_bank.models import QuestionSet


class Command(BaseCommand):
    help = "Register complete Hub sets; preserve existing titles, publication and guest slots."

    def add_arguments(self, parser):
        parser.add_argument("--check", action="store_true", help="Read-only readiness check.")

    def handle(self, *args, **options):
        try:
            with transaction.atomic():
                for section in ("reading", "listening"):
                    number = Exam.objects.filter(section=section).aggregate(n=Max("display_order"))["n"] or 0
                    slots = set(Exam.objects.filter(section=section, guest_slot__isnull=False).values_list("guest_slot", flat=True))
                    ready = 0
                    for source in QuestionSet.objects.filter(exam_format="pbt", section=section).order_by("created_at", "set_id"):
                        try:
                            load_set(source.pk, section)
                        except BankNotReady as exc:
                            self.stdout.write(f"{section} {source.pk}: not ready ({exc})")
                            continue
                        ready += 1
                        if options["check"] or Exam.objects.filter(source_set_id=source.pk).exists():
                            continue
                        number += 1
                        slot = next((s for s in range(1, 4) if s not in slots), None)
                        if slot:
                            slots.add(slot)
                        Exam.objects.create(source_set_id=source.pk, section=section, title=f"TOPIK II PBT {number}",
                                            display_order=number, guest_slot=slot, is_published=True)
                    self.stdout.write(f"{section}: {ready} complete sets")
                    if ready < 3:
                        self.stderr.write(f"{section}: fewer than 3 complete guest sets available")
        except DatabaseError:
            raise CommandError("PBT database unavailable. Apply migrations and check the Hub schema.") from None
