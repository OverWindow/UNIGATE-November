import csv
import os
from pathlib import Path
import tempfile
from zoneinfo import ZoneInfo

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import DatabaseError
from django.utils import timezone

from surveys.models import SurveyResponse


COLUMNS = ("id", "email", "age", "education_type", "desired_university", "created_at")
SEOUL = ZoneInfo("Asia/Seoul")


def spreadsheet_text(value):
    if value is None:
        return ""
    text = str(value)
    # Treat formula-like user input as text; the database value stays unchanged.
    probe = text.lstrip("\ufeff \t\r\n\v\f")
    if text.startswith(("\t", "\r", "\n")) or probe.startswith(tuple("=+-@＝＋－＠")):
        return "'" + text
    return text


class Command(BaseCommand):
    help = "Export survey responses to an Excel-friendly UTF-8 BOM CSV (read-only database access)."
    requires_system_checks = []

    def add_arguments(self, parser):
        parser.add_argument("--output", help="CSV destination; relative paths use the caller's working directory.")
        parser.add_argument("--overwrite", action="store_true", help="Replace an existing CSV only after export succeeds.")

    def handle(self, *args, **options):
        stamp = timezone.now().astimezone(SEOUL).strftime("%Y%m%d_%H%M%S_%f")
        default = Path(settings.BASE_DIR).parent / "exports" / f"survey_responses_{stamp}.csv"
        temporary = None
        try:
            output = Path(options["output"]).expanduser().resolve() if options["output"] else default.resolve()
            if output.suffix.lower() != ".csv":
                raise CommandError("Output must have a .csv extension.")
            if output.exists() and not options["overwrite"]:
                raise CommandError("Output already exists. Choose another path or pass --overwrite.")
            if output.is_dir():
                raise CommandError("Output must be a CSV file, not a directory.")
            output.parent.mkdir(parents=True, exist_ok=True)
            count = 0
            with tempfile.NamedTemporaryFile(
                mode="w", encoding="utf-8-sig", newline="", prefix=".survey-export-",
                suffix=".tmp", dir=output.parent, delete=False,
            ) as stream:
                temporary = Path(stream.name)
                writer = csv.writer(stream, quoting=csv.QUOTE_ALL)
                writer.writerow(COLUMNS)
                rows = SurveyResponse.objects.order_by("id").values_list(*COLUMNS).iterator(chunk_size=2000)
                for pk, email, age, education, university, created in rows:
                    writer.writerow((pk, spreadsheet_text(email), age, spreadsheet_text(education),
                                     spreadsheet_text(university), created.astimezone(SEOUL).isoformat()))
                    count += 1
                stream.flush()
                os.fsync(stream.fileno())

            # Publish a complete file atomically; a concurrent export cannot be overwritten accidentally.
            if options["overwrite"]:
                os.replace(temporary, output)
            else:
                try:
                    if os.name == "nt":
                        os.rename(temporary, output)
                    else:
                        os.link(temporary, output)
                except FileExistsError:
                    raise CommandError("Output already exists. Choose another path or pass --overwrite.") from None
        except (OSError, DatabaseError, UnicodeError, ValueError):
            raise CommandError("Export failed. Check the output location, file permissions, and database availability.") from None
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)

        self.stdout.write(self.style.SUCCESS(f"Exported {count} row(s): {output}"))
