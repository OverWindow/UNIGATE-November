#!/bin/sh
set -eu
cd /app/backend
python manage.py migrate --noinput
python manage.py collectstatic --noinput
set -- gunicorn -c /app/backend/deploy/gunicorn.conf.py config.wsgi:application
if [ "${DB_BACKUP_SCHEDULE_ENABLED:-0}" = 1 ]; then
    exec tini -- python deploy/serve_with_backups.py "$@"
fi
exec "$@"
