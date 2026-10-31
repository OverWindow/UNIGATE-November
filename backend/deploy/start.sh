#!/bin/sh
set -eu
cd /app/backend
python manage.py migrate --noinput
python manage.py collectstatic --noinput
exec gunicorn -c /app/backend/deploy/gunicorn.conf.py config.wsgi:application
