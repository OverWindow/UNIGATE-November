#!/bin/sh
set -eu
: "${BACKEND_ORIGIN:?Set BACKEND_ORIGIN}"
PUBLIC_SCHEME="${PUBLIC_SCHEME:-http}"
export PUBLIC_SCHEME
case "$PUBLIC_SCHEME" in http|https) ;; *) echo "Invalid PUBLIC_SCHEME" >&2; exit 1 ;; esac
# Disallow paths, whitespace and Nginx configuration injection.
printf '%s' "$BACKEND_ORIGIN" | grep -Eq '^https?://[a-zA-Z0-9._-]+(:[0-9]+)?$' || exit 1
envsubst '${BACKEND_ORIGIN} ${PUBLIC_SCHEME}' < /etc/nginx/nginx.conf.template > /tmp/unigate-nginx.conf
nginx -t -c /tmp/unigate-nginx.conf
exec nginx -c /tmp/unigate-nginx.conf -g 'daemon off;'
