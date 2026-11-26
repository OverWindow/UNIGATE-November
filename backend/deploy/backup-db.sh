#!/usr/bin/env bash
set -eu
umask 077
export TZ=Asia/Seoul

case "$#:${1:-}" in
    1:daily|1:manual) mode=$1 ;;
    *) echo 'Usage: backup-db.sh {daily|manual}' >&2; exit 2 ;;
esac

log() {
    printf '%s db-backup mode=%s %s\n' "$(date -Is)" "$mode" "$1"
}

export PGDATABASE="${DB_NAME:?}" PGUSER="${DB_USER:?}" PGPASSWORD="${DB_PASSWORD:?}"
export PGHOST="${DB_HOST:?}" PGPORT="${DB_PORT:?}" PGSSLMODE="${DB_SSLMODE:-prefer}" PGCONNECT_TIMEOUT=10
bucket=${DB_BACKUP_S3_BUCKET:?}
prefix=${DB_BACKUP_S3_PREFIX:-unigate/prod}
prefix=${prefix%/}
if [[ -z $prefix || $prefix == /* || $prefix =~ [[:cntrl:]] ]]; then
    log 'failed: invalid backup prefix' >&2
    exit 2
fi

# One dump at a time in the single backend container.
exec 9>>/tmp/unigate-db-backup.lock
flock --exclusive 9
if [[ $mode == daily ]]; then
    key="$prefix/daily/$(date +%Y/%m/%d)/database.dump"
else
    read -r id </proc/sys/kernel/random/uuid
    key="$prefix/manual/$(date +%Y/%m/%d/%H%M%S)-$id.dump"
fi

dump=$(mktemp)
trap 'rm -f -- "$dump"' EXIT
trap 'exit 1' HUP INT TERM
log 'starting database dump'
if ! pg_dump --no-password --format=custom --file="$dump" >/dev/null 2>&1 || [[ ! -s $dump ]]; then
    log 'failed: pg_dump' >&2
    exit 1
fi
if ! aws s3 cp "$dump" "s3://$bucket/$key" --only-show-errors >/dev/null 2>&1; then
    log 'failed: S3 upload' >&2
    exit 1
fi
log "completed: archive uploaded bytes=$(stat -c %s "$dump")"
