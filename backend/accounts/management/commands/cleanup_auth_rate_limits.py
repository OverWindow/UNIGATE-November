from django.core.management.base import BaseCommand, CommandError
from django.db import DatabaseError

from accounts.rate_limits import cleanup_expired


class Command(BaseCommand):
    help = "Delete expired authentication rate-limit records in short batches."

    def add_arguments(self, parser):
        parser.add_argument("--batch-size", type=int, default=1000)

    def handle(self, *args, **options):
        size = options["batch_size"]
        if not 1 <= size <= 10000:
            raise CommandError("--batch-size must be between 1 and 10000.")
        total = 0
        try:
            while True:
                deleted = cleanup_expired(size)
                total += deleted
                if deleted < size:
                    break
        except DatabaseError:
            raise CommandError("Rate-limit cleanup failed; check database availability.") from None
        self.stdout.write(self.style.SUCCESS(f"Deleted {total} expired rate-limit records."))
