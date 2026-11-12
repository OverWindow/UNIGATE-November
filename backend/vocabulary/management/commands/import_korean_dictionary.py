import json
import re
from collections import Counter
from itertools import islice
from pathlib import Path
from tempfile import TemporaryFile

from django.core.management.base import BaseCommand, CommandError
from django.db import DatabaseError, connection, transaction

from vocabulary.dictionary_import import TRANSLATION_LANGUAGES, read_senses
from vocabulary.models import KoreanDictionarySense


BATCH_SIZE = 500
LOCK_TIMEOUT_MS = 8000
UPDATE_FIELDS = [
    "headword", "homonym_number", "part_of_speech", "entry_type", "sense_order",
    "definition", "translations", "examples", "metadata",
]


class Command(BaseCommand):
    help = "Validate/import a complete Korean Basic Dictionary XLS export without external API calls."
    requires_system_checks = []

    def add_arguments(self, parser):
        parser.add_argument("--directory", required=True, type=Path, help="Directory containing all export XLS parts.")
        parser.add_argument("--check", action="store_true", help="Validate files only; never connect to the database.")

    def report(self, message):
        self.stdout.write(message)
        self.stdout.flush()

    def handle(self, *args, **options):
        directory = Path(options["directory"])
        if not directory.is_dir():
            raise CommandError("The input directory does not exist.")
        paths = sorted(
            (path for path in directory.iterdir() if path.is_file() and path.suffix.lower() == ".xls"),
            key=lambda path: [int(part) if part.isdigit() else part for part in re.split(r"(\d+)", path.name.casefold())],
        )
        if not paths or len({path.name.casefold() for path in paths}) != len(paths):
            raise CommandError("Provide XLS files with distinct filenames in one directory.")
        counts, types, missing = Counter(), Counter(), Counter()
        self.report(f"Validating {len(paths)} XLS files on this computer before database access.")
        # Stage validated records on disk, so parsing errors cannot leave a partial import.
        with TemporaryFile(mode="w+t", encoding="utf-8") as staged:
            for record in read_senses(paths, progress=self.report):
                counts[record["source_file"]] += 1
                types[record["entry_type"]] += 1
                for language in TRANSLATION_LANGUAGES:
                    if not all(record["translations"][language].values()):
                        missing[language] += 1
                staged.write(json.dumps(record, ensure_ascii=False) + "\n")
            if not types["word"]:
                raise CommandError("The export must contain word entries.")
            total = sum(counts.values())
            self.report(f"Validated {total:,} senses; types: {dict(types)}")
            self.report(f"Incomplete translation pairs: {dict(missing)}")
            if options["check"]:
                self.report("Check complete. No database connection or writes.")
                return
            staged.seek(0)
            stage = "connecting to the database"
            committing = False
            self.report("Connecting to the configured database...")
            try:
                with transaction.atomic():
                    if connection.vendor == "postgresql":
                        stage = "acquiring the dictionary table lock"
                        self.report(f"Waiting for dictionary table lock (timeout: {LOCK_TIMEOUT_MS / 1000:g}s)...")
                        with connection.cursor() as cursor:
                            cursor.execute("SELECT set_config('lock_timeout', %s, true)", [f"{LOCK_TIMEOUT_MS}ms"])
                            cursor.execute("LOCK TABLE korean_dictionary_senses IN SHARE ROW EXCLUSIVE MODE")
                    stage = "checking existing source rows"
                    self.report("Checking existing source rows...")
                    existing = set(KoreanDictionarySense.objects.values_list("source_file", "source_row"))
                    expected = {(filename, row) for filename, count in counts.items() for row in range(2, count + 2)}
                    if existing and existing != expected:
                        raise CommandError(
                            "Existing source filenames/rows differ from this export. "
                            "No data changed. Use the same complete export; replacing snapshots requires a separate review."
                        )
                    records = (KoreanDictionarySense(**json.loads(line)) for line in staged)
                    transferred = 0
                    self.report(f"Transferring {total:,} rows in batches of {BATCH_SIZE}. No batch commits; all rows commit together.")
                    while batch := list(islice(records, BATCH_SIZE)):
                        stage = f"transferring rows {transferred + 1:,}-{transferred + len(batch):,} of {total:,}"
                        KoreanDictionarySense.objects.bulk_create(
                            batch, batch_size=BATCH_SIZE, update_conflicts=True,
                            update_fields=UPDATE_FIELDS, unique_fields=["source_file", "source_row"],
                        )
                        transferred += len(batch)
                        self.report(f"Transferred {transferred:,}/{total:,} rows ({transferred / total:.1%}); pending final commit.")
                    stage = "committing the import"
                    self.report(f"Committing all {total:,} rows...")
                    committing = True
            except DatabaseError as error:
                if committing:
                    raise CommandError(
                        "Dictionary import commit could not be confirmed. Check the target dictionary before retrying; "
                        "do not assume rollback."
                    ) from None
                if getattr(error.__cause__, "sqlstate", None) == "55P03":
                    reason = "Database lock wait timed out; wait for the other import or migration to finish, then retry."
                else:
                    reason = "Check database connectivity, permissions and migrations, then retry."
                raise CommandError(f"Dictionary import failed during {stage}. No changes were committed. {reason}") from None
        self.report(self.style.SUCCESS(
            f"Imported and committed {total:,} senses. Existing source row IDs preserved; no rows deleted."
        ))
