#!/bin/sh
set -eu
cd /app/backend
python /app/backend/deploy/prepare_database.py
exec gunicorn -c /app/backend/deploy/gunicorn.conf.py config.wsgi:application
