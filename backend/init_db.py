import os

import django
from django.db import connection
from django.db.migrations.recorder import MigrationRecorder


def main():
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
    django.setup()
    # With no migrations, migrate can skip the recorder table. / 이력이 없어도 관리 테이블만 준비합니다.
    MigrationRecorder(connection).ensure_schema()
    print("Migration history table is ready; no survey table was created.")


if __name__ == "__main__":
    main()
