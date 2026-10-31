#!/bin/sh
set -eu
cd /app/backend
python /app/deploy/prepare_database.py
case "${1:-combined}" in
  combined) exec supervisord -c /app/deploy/supervisord.conf ;;
  backend) exec gunicorn -c /app/deploy/gunicorn.conf.py config.wsgi:application ;;
  *) echo "Unknown runtime mode" >&2; exit 1 ;;
esac
