from django.core.management.base import BaseCommand, CommandError
from django.db import DatabaseError, connection, transaction
from django.db.models import Max

from pbt.bank import BankNotReady, load_set
from pbt.formats import EXAM_FORMATS
from pbt.models import Exam
from question_bank.models import QuestionSet


class Command(BaseCommand):
    help = "Register complete PBT and IBT sets; preserve existing titles, publication and guest slots."

    def add_arguments(self, parser):
        parser.add_argument("--check", action="store_true", help="Read-only readiness check.")
        parser.add_argument("--exam-format", choices=tuple(EXAM_FORMATS), help="Only process this format (default: both).")

    def handle(self, *args, **options):
        formats = [options["exam_format"]] if options["exam_format"] else EXAM_FORMATS
        try:
            with transaction.atomic():
                with connection.cursor() as cursor:
                    if options["check"]:
                        cursor.execute("SET TRANSACTION READ ONLY")
                    else:
                        # Serialize registrations so concurrent runs cannot reuse guest slots.
                        cursor.execute("LOCK TABLE pbt_exams IN SHARE ROW EXCLUSIVE MODE")
                for exam_format in formats:
                    for section in ("reading", "listening"):
                        exams = Exam.objects.filter(exam_format=exam_format, section=section)
                        number = exams.aggregate(n=Max("display_order"))["n"] or 0
                        slots = set(exams.filter(guest_slot__isnull=False).values_list("guest_slot", flat=True))
                        ready = 0
                        for source in QuestionSet.objects.filter(exam_format=exam_format, section=section).order_by("created_at", "set_id"):
                            try:
                                load_set(source.pk, section, exam_format)
                            except BankNotReady as exc:
                                self.stdout.write(f"{exam_format} {section} {source.pk}: not ready ({exc})")
                                continue
                            ready += 1
                            if options["check"] or Exam.objects.filter(source_set_id=source.pk).exists():
                                continue
                            number += 1
                            slot = next((s for s in range(1, 4) if s not in slots), None)
                            if slot:
                                slots.add(slot)
                            Exam.objects.create(source_set_id=source.pk, exam_format=exam_format, section=section,
                                                title=f"TOPIK II {exam_format.upper()} {number}",
                                                display_order=number, guest_slot=slot, is_published=True)
                        self.stdout.write(f"{exam_format} {section}: {ready} complete sets")
        except DatabaseError:
            raise CommandError("Exam database unavailable. Apply migrations and check the Hub schema.") from None
