import codecs
import csv
from datetime import datetime, timezone as dt_timezone
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
from unittest import skipUnless
from unittest.mock import patch

from django.conf import settings
from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import DatabaseError
from django.test import TestCase, SimpleTestCase, override_settings

from .models import SurveyResponse


HEADER = ["id", "email", "age", "education_type", "desired_university", "created_at"]


class ExportFilesMixin:
    def setUp(self):
        super().setUp()
        root = Path(settings.BASE_DIR).parent / "exports"
        root.mkdir(exist_ok=True)
        temporary = tempfile.TemporaryDirectory(prefix="export-test-", dir=root)
        self.folder = Path(temporary.name).resolve()
        assert self.folder.is_relative_to(root.resolve())
        self.addCleanup(temporary.cleanup)
        self.output = self.folder / "한글 폴더" / "responses.csv"

    def read_csv(self, path=None):
        with (path or self.output).open(encoding="utf-8-sig", newline="") as stream:
            return list(csv.reader(stream))


class ExportSurveysTests(ExportFilesMixin, TestCase):
    def create_response(self, **overrides):
        values = dict(email="export-test@example.com", age=20, education_type="universitas")
        values.update(overrides)
        return SurveyResponse.objects.create(**values)

    def export(self, **kwargs):
        stdout = io.StringIO()
        call_command("export_surveys", output=str(self.output), stdout=stdout, **kwargs)
        return stdout.getvalue()

    def test_round_trip_bom_order_nulls_and_korean_time(self):
        timestamp = datetime(2026, 10, 30, 18, 4, 5, tzinfo=dt_timezone.utc)
        first = self.create_response(created_at=timestamp)
        second = self.create_response(desired_university='서울대학교, "국제학부"\n한국어 과정', created_at=timestamp)
        before = list(SurveyResponse.objects.values())
        stdout = self.export()
        self.assertTrue(self.output.read_bytes().startswith(codecs.BOM_UTF8))
        rows = self.read_csv()
        self.assertEqual(rows[0], HEADER)
        self.assertEqual([row[0] for row in rows[1:]], [str(first.pk), str(second.pk)])
        self.assertEqual(rows[1][4], "")
        self.assertEqual(rows[2][4], '서울대학교, "국제학부"\n한국어 과정')
        self.assertEqual(rows[1][5], "2026-10-31T03:04:05+09:00")
        self.assertEqual(rows[1][1:4], ["export-test@example.com", "20", "universitas"])
        self.assertEqual(list(SurveyResponse.objects.values()), before)
        self.assertIn("Exported 2 row(s)", stdout)
        self.assertNotIn("export-test@example.com", stdout)

    def test_empty_table_exports_header(self):
        self.assertIn("Exported 0 row(s)", self.export())
        self.assertEqual(self.read_csv(), [HEADER])

    def test_spreadsheet_formulas_are_neutralized_without_changing_db(self):
        dangerous = ['=1+1', '+1+1', '-1+1', '@SUM(1)', '＝1+1', '＋1', '－1', '＠SUM(1)',
                     '  =1', '\t=1', '\r=1', '\n=1', '\ufeff=1', '=1,"x"\n=2']
        for text in dangerous:
            row = self.create_response()
            # Legacy or bulk-written input must be safe too, including leading whitespace.
            SurveyResponse.objects.filter(pk=row.pk).update(desired_university=text)
        email_row = self.create_response(email="+test@example.com")
        self.export()
        rows = self.read_csv()[1:]
        self.assertEqual([row[4] for row in rows[:-1]], ["'" + text for text in dangerous])
        self.assertEqual(rows[-1][1], "'+test@example.com")
        self.assertEqual(SurveyResponse.objects.get(pk=email_row.pk).email, "+test@example.com")

    def test_existing_file_requires_explicit_overwrite(self):
        self.output.parent.mkdir()
        self.output.write_bytes(b"keep original")
        with self.assertRaisesMessage(CommandError, "already exists"):
            self.export()
        self.assertEqual(self.output.read_bytes(), b"keep original")
        self.export(overwrite=True)
        self.assertEqual(self.read_csv(), [HEADER])

    def test_failed_export_preserves_original_and_removes_temporary_file(self):
        self.output.parent.mkdir()
        self.output.write_bytes(b"keep original")

        def interrupted_rows(*args, **kwargs):
            yield (1, "private@example.com", 20, "universitas", None,
                   datetime(2026, 1, 1, tzinfo=dt_timezone.utc))
            raise DatabaseError("private@example.com")

        with patch("django.db.models.query.QuerySet.iterator", interrupted_rows):
            with self.assertRaises(CommandError) as caught:
                self.export(overwrite=True)
        self.assertNotIn("private@example.com", str(caught.exception))
        self.assertEqual(self.output.read_bytes(), b"keep original")
        self.assertEqual(list(self.output.parent.iterdir()), [self.output])

    def test_concurrent_file_creation_is_not_overwritten(self):
        def competing_export(source, destination):
            Path(destination).write_bytes(b"another export")
            raise FileExistsError()

        publish = "rename" if os.name == "nt" else "link"
        with patch(f"surveys.management.commands.export_surveys.os.{publish}", side_effect=competing_export):
            with self.assertRaisesMessage(CommandError, "already exists"):
                self.export()
        self.assertEqual(self.output.read_bytes(), b"another export")
        self.assertEqual(list(self.output.parent.iterdir()), [self.output])

    def test_default_filename_uses_project_exports_and_korean_date(self):
        now = datetime(2026, 10, 30, 18, 4, 5, 123456, tzinfo=dt_timezone.utc)
        with override_settings(BASE_DIR=self.folder / "backend"), patch(
            "surveys.management.commands.export_surveys.timezone.now", return_value=now
        ):
            call_command("export_surveys", stdout=io.StringIO())
        expected = self.folder / "exports" / "survey_responses_20261031_030405_123456.csv"
        self.assertEqual(self.read_csv(expected), [HEADER])

    def test_rejects_non_csv_path(self):
        with self.assertRaisesMessage(CommandError, ".csv extension"):
            call_command("export_surveys", output=str(self.folder / "db.sqlite3"))
        self.assertFalse((self.folder / "db.sqlite3").exists())

    def test_missing_database_is_not_created(self):
        missing = self.folder / "missing.sqlite3"
        from django.db import connection
        with patch.dict(connection.settings_dict, NAME=str(missing)), patch.object(
            connection, "is_in_memory_db", return_value=False
        ):
            with self.assertRaisesMessage(CommandError, "does not exist"):
                self.export()
        self.assertFalse(missing.exists())
        self.assertFalse(self.output.exists())

    def test_export_spans_multiple_chunks(self):
        SurveyResponse.objects.bulk_create([
            SurveyResponse(email="chunk@example.com", age=20, education_type="other")
            for _ in range(2005)
        ])
        self.export()
        rows = self.read_csv()[1:]
        ids = [int(row[0]) for row in rows]
        self.assertEqual(len(ids), 2005)
        self.assertEqual(ids, sorted(set(ids)))


@skipUnless(os.name == "nt", "Windows command launcher")
class ExportLauncherTests(ExportFilesMixin, SimpleTestCase):
    def test_launcher_from_another_directory_and_exit_codes(self):
        project = Path(settings.BASE_DIR).parent
        # A minimal independent settings module keeps subprocesses away from the real database and secrets.
        module = self.folder / "export_cli_settings.py"
        module.write_text(
            "SECRET_KEY = 'synthetic-export-test'\n"
            "INSTALLED_APPS = ['surveys']\n"
            "MIGRATION_MODULES = {'surveys': 'migration.surveys'}\n"
            "USE_TZ = True\nDEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'\n"
            f"from pathlib import Path\nBASE_DIR = Path({str(self.folder / 'backend')!r})\n"
            f"DATABASES = {{'default': {{'ENGINE': 'django.db.backends.sqlite3', 'NAME': {str(self.folder / 'test.sqlite3')!r}}}}}\n",
            encoding="utf-8",
        )
        environment = os.environ.copy()
        environment.update(DJANGO_SETTINGS_MODULE="export_cli_settings", PYTHONPATH=str(self.folder), PYTHONIOENCODING="utf-8")
        migrated = subprocess.run(
            [str(Path(settings.BASE_DIR) / ".venv/Scripts/python.exe"),
             str(Path(settings.BASE_DIR) / "manage.py"), "migrate", "--noinput"],
            env=environment, capture_output=True, timeout=30,
        )
        self.assertEqual(migrated.returncode, 0, migrated.stderr.decode("utf-8", errors="replace"))
        fixture = self.folder / "synthetic.json"
        fixture.write_text(json.dumps([{
            "model": "surveys.surveyresponse", "pk": 1,
            "fields": {"email": "cli-test@example.com", "age": 21, "education_type": "politeknik",
                       "desired_university": "테스트 대학교", "created_at": "2026-10-30T18:00:00Z"},
        }], ensure_ascii=False), encoding="utf-8")
        loaded = subprocess.run(
            [str(Path(settings.BASE_DIR) / ".venv/Scripts/python.exe"),
             str(Path(settings.BASE_DIR) / "manage.py"), "loaddata", str(fixture)],
            env=environment, capture_output=True, timeout=30,
        )
        self.assertEqual(loaded.returncode, 0, loaded.stderr.decode("utf-8", errors="replace"))
        launcher = Path(settings.BASE_DIR) / "export-surveys.cmd"

        def run(*arguments):
            return subprocess.run([str(launcher), *arguments], cwd=self.folder, env=environment,
                                  capture_output=True, timeout=30)

        relative = "한글 폴더/신청 목록.csv"
        first = run("--output", relative)
        self.assertEqual(first.returncode, 0, first.stderr.decode("utf-8", errors="replace"))
        target = self.folder / relative
        self.assertEqual(self.read_csv(target), [HEADER, [
            "1", "cli-test@example.com", "21", "politeknik", "테스트 대학교", "2026-10-31T03:00:00+09:00",
        ]])
        self.assertNotEqual(run("--output", relative).returncode, 0)
        self.assertEqual(run("--output", relative, "--overwrite").returncode, 0)
        self.assertNotEqual(run("--not-a-real-option").returncode, 0)
        self.assertEqual(run().returncode, 0)
        self.assertEqual(len(list((self.folder / "exports").glob("survey_responses_*.csv"))), 1)

        for directory in (Path(settings.BASE_DIR), project):
            with self.subTest(working_directory=directory):
                target = self.folder / f"from-{directory.name}.csv"
                result = subprocess.run(
                    [str(launcher), "--output", str(target)], cwd=directory, env=environment,
                    capture_output=True, timeout=30,
                )
                self.assertEqual(result.returncode, 0, result.stderr.decode("utf-8", errors="replace"))
                self.assertEqual(self.read_csv(target)[1][1], "cli-test@example.com")
