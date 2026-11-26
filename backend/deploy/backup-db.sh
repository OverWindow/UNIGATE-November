#!/usr/bin/env bash
set -eu
umask 077
export TZ=Asia/Seoul AWS_PAGER='' AWS_CLI_AUTO_PROMPT=off

case ${1:-} in
    daily|manual|catch-up) mode=$1 ;;
    *) echo 'Usage: backup-db.sh {daily|manual|catch-up}' >&2; exit 2 ;;
esac
[[ $# == 1 ]] || exit 2

log() {
    printf '%s db-backup mode=%s %s\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')" "$mode" "$1"
}

started=$(date '+%Y/%m/%d %H%M%S')
day=${started% *}
clock=${started#* }
if [[ $mode == catch-up && ${clock:0:2} < 03 ]]; then
    log 'skipped: daily backup is not due yet'
    exit 0
fi

for name in DB_NAME DB_USER DB_PASSWORD DB_HOST DB_PORT DB_BACKUP_S3_BUCKET; do
    if [[ -z ${!name:-} ]]; then
        log "configuration error: missing $name" >&2
        exit 2
    fi
done
if [[ -z ${AWS_REGION:-${AWS_DEFAULT_REGION:-}} ]]; then
    log 'configuration error: missing AWS region' >&2
    exit 2
fi
prefix=${DB_BACKUP_S3_PREFIX:-unigate/prod}
prefix=${prefix%/}
if [[ -z $prefix || $prefix == /* || $prefix =~ [[:cntrl:]] ]]; then
    log 'configuration error: invalid backup prefix' >&2
    exit 2
fi

key="$prefix/daily/$day/database.dump"
workdir=''
child=''
clear_temp() {
    if [[ -n $workdir ]]; then
        rm -f -- "$workdir/database.dump" "$workdir/list"
        rmdir -- "$workdir"
        workdir=''
    fi
}

cleanup() {
    if [[ -n $child ]]; then
        kill -TERM "$child" 2>/dev/null || true
        wait "$child" 2>/dev/null || true
    fi
    clear_temp
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

# Waiting on a background child lets the signal traps interrupt dumps and uploads.
run_child() {
    "$@" &
    child=$!
    local status=0
    wait "$child" || status=$?
    child=''
    return "$status"
}

check_daily() {
    already_stored=false
    if ! run_child aws s3api list-objects-v2 --bucket "$DB_BACKUP_S3_BUCKET" \
        --prefix "$key" --max-keys 1 --no-paginate --query 'Contents[0].[Key, Size]' \
        --output text >"$workdir/list" 2>/dev/null; then
        log 'failed: could not check the daily object' >&2
        return 1
    fi
    local found size
    if IFS=$'\t' read -r found size <"$workdir/list" && [[ $found == "$key" ]]; then
        if [[ ! $size =~ ^[1-9][0-9]*$ ]]; then
            log 'failed: existing daily object has invalid size' >&2
            return 1
        fi
        already_stored=true
    fi
}

backup() {
    if ! workdir=$(mktemp -d 2>/dev/null); then
        log 'failed: could not create private temporary directory' >&2
        return 1
    fi
    local dump="$workdir/database.dump" started_seconds bytes manual_time id
    # A waiting manual job uses its actual dump date after taking the common lock.
    if ! { exec 9>>/tmp/unigate-db-backup.lock; } 2>/dev/null || ! run_child flock --exclusive 9; then
        log 'failed: could not acquire backup lock' >&2
        return 1
    fi
    if [[ $mode == manual ]]; then
        manual_time=$(date '+%Y/%m/%d/%H%M%S') || return 1
        read -r id </proc/sys/kernel/random/uuid || return 1
        key="$prefix/manual/$manual_time-$id.dump"
    else
        check_daily || return 1
        if [[ $already_stored == true ]]; then
            log 'skipped: daily backup already exists'
            return 0
        fi
        if [[ $(date '+%Y/%m/%d') != "$day" ]]; then
            log 'failed: original backup day has ended' >&2
            return 1
        fi
    fi
    started_seconds=$SECONDS
    log 'starting database dump'
    if ! PGHOST="$DB_HOST" PGPORT="$DB_PORT" PGDATABASE="$DB_NAME" PGUSER="$DB_USER" \
        PGPASSWORD="$DB_PASSWORD" PGSSLMODE="${DB_SSLMODE:-prefer}" PGCONNECT_TIMEOUT=10 \
        run_child pg_dump --no-password --format=custom --file="$dump" >/dev/null 2>&1; then
        log 'failed: pg_dump' >&2
        return 1
    fi
    if ! bytes=$(stat -c '%s' -- "$dump" 2>/dev/null) || [[ ! $bytes =~ ^[1-9][0-9]*$ ]]; then
        log 'failed: missing or empty dump file' >&2
        return 1
    fi
    if ! run_child pg_restore --list "$dump" >/dev/null 2>&1; then
        log 'failed: archive contents check' >&2
        return 1
    fi
    if ! run_child aws s3 cp "$dump" "s3://$DB_BACKUP_S3_BUCKET/$key" \
        --checksum-algorithm CRC32 --only-show-errors >/dev/null 2>&1; then
        log 'failed: S3 upload' >&2
        return 1
    fi
    log "completed: archive uploaded bytes=$bytes elapsed_seconds=$(( SECONDS - started_seconds ))"
}

delays=(0)
[[ $mode != daily ]] || delays+=(600 1800)
for delay in "${delays[@]}"; do
    if (( delay )); then
        log "retrying in $delay seconds"
        run_child sleep "$delay"
    fi
    if backup; then
        exit 0
    fi
    exec 9>&-
    clear_temp
done
exit 1
