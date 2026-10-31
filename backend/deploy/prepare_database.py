import os
from pathlib import Path
import sqlite3
import sys
import tempfile
from datetime import datetime, timezone

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")


def main():
    import django
    django.setup()
    from django.conf import settings
    from django.core.management import call_command
    from django.db import connection
    from django.db.migrations.executor import MigrationExecutor

    path = Path(settings.DATABASES["default"]["NAME"])
    # A real mount is mandatory: never silently create an ephemeral production DB.
    if not path.parent.is_dir() or not os.path.ismount(path.parent):
        raise RuntimeError("Mount persistent storage at /app/backend/data before starting.")
    with tempfile.TemporaryFile(dir=path.parent):
        pass
    existed = path.exists()
    executor = MigrationExecutor(connection)
    if executor.migration_plan(executor.loader.graph.leaf_nodes()):
        if existed:
            backups = path.parent / "backups"
            backups.mkdir(exist_ok=True)
            stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
            target = backups / f"before-migrate-{stamp}.sqlite3"
            with sqlite3.connect(path.resolve().as_uri() + "?mode=ro", uri=True) as source:
                with sqlite3.connect(target) as dest:
                    source.backup(dest)
                    if dest.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                        raise RuntimeError("Backup integrity check failed")
            print("Pre-migration backup completed.", flush=True)
        call_command("migrate", interactive=False)
    call_command("check")
    connection.close()


if __name__ == "__main__":
    main()
