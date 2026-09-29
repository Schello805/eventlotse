#!/usr/bin/env bash
set -Eeuo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/eventlotse}"
APP_DIR="${APP_DIR:-/opt/eventlotse}"
ENV_FILE="${ENV_FILE:-/etc/eventlotse/eventlotse.env}"
KEEP_DAYS="${KEEP_DAYS:-${BACKUP_RETENTION_DAYS:-30}}"

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
elif [ -f "$APP_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$APP_DIR/.env"
  set +a
fi

mkdir -p "$BACKUP_DIR"
chmod 750 "$BACKUP_DIR"

STAMP="$(date +%Y%m%d-%H%M%S)"
pg_dump --clean --if-exists --no-owner --no-privileges "${DATABASE_URL:?DATABASE_URL fehlt}" | gzip > "$BACKUP_DIR/eventlotse-$STAMP.sql.gz"
find "$BACKUP_DIR" -type f -name 'eventlotse-*.sql.gz' -mtime "+$KEEP_DAYS" -delete

printf '[Eventlotse] Backup erstellt: %s\n' "$BACKUP_DIR/eventlotse-$STAMP.sql.gz"
