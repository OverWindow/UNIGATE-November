#!/bin/bash
set -eu
cd /app/backend
python manage.py migrate --noinput
python manage.py collectstatic --noinput
set -- gunicorn -c /app/backend/deploy/gunicorn.conf.py config.wsgi:application
if [[ ${DB_BACKUP_SCHEDULE_ENABLED:-0} != 1 ]]; then
    exec "$@"
fi

"$@" &
web_pid=$!
supercronic -no-reap -passthrough-logs deploy/backup.cron &
cron_pid=$!
# Shut down both children when the container stops or either process exits.
trap 'kill -TERM "$web_pid" "$cron_pid" 2>/dev/null || true; wait' EXIT
trap 'exit 0' TERM INT QUIT
wait -n
