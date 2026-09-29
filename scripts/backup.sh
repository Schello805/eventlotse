#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/opt/eventlotse}"
ENV_FILE="${ENV_FILE:-/etc/eventlotse/eventlotse.env}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/eventlotse}"
KEEP_DAYS="${KEEP_DAYS:-${BACKUP_RETENTION_DAYS:-30}}"

log() {
  printf '\n[Eventlotse] %s\n' "$1"
}

if ! [[ "$KEEP_DAYS" =~ ^[0-9]+$ ]] || [ "$KEEP_DAYS" -lt 1 ] || [ "$KEEP_DAYS" -gt 3650 ]; then
  echo "KEEP_DAYS muss zwischen 1 und 3650 liegen." >&2
  exit 1
fi

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
elif [ -z "${DATABASE_URL:-}" ]; then
  echo "Keine Eventlotse-Umgebung gefunden. ENV_FILE oder APP_DIR prüfen." >&2
  exit 1
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
TARGET_DIR="${BACKUP_DIR}/eventlotse-${STAMP}"
ARCHIVE="${TARGET_DIR}.tar.gz"

while [ -e "$TARGET_DIR" ] || [ -e "$ARCHIVE" ]; do
  sleep 1
  STAMP="$(date +%Y%m%d-%H%M%S)"
  TARGET_DIR="${BACKUP_DIR}/eventlotse-${STAMP}"
  ARCHIVE="${TARGET_DIR}.tar.gz"
done

install -d -m 0750 "$BACKUP_DIR"
install -d -m 0700 "$TARGET_DIR"

log "Sichere PostgreSQL-Datenbank."
pg_dump --clean --if-exists --no-owner --no-privileges "${DATABASE_URL:?DATABASE_URL fehlt}" | gzip > "${TARGET_DIR}/database.sql.gz"

log "Sichere Uploads und Konfiguration."
if [ -d "${UPLOAD_DIR:-/var/lib/eventlotse/uploads}" ]; then
  tar -C "$(dirname "${UPLOAD_DIR:-/var/lib/eventlotse/uploads}")" -czf "${TARGET_DIR}/uploads.tar.gz" "$(basename "${UPLOAD_DIR:-/var/lib/eventlotse/uploads}")"
fi
if [ -f "$ENV_FILE" ]; then
  cp "$ENV_FILE" "${TARGET_DIR}/eventlotse.env"
  chmod 0600 "${TARGET_DIR}/eventlotse.env"
elif [ -f "$APP_DIR/.env" ]; then
  cp "$APP_DIR/.env" "${TARGET_DIR}/eventlotse.env"
  chmod 0600 "${TARGET_DIR}/eventlotse.env"
fi
printf 'created_at=%s\nretention_days=%s\n' "$(date --iso-8601=seconds)" "$KEEP_DAYS" > "${TARGET_DIR}/metadata.txt"

log "Erstelle Backup-Archiv."
tar -C "$BACKUP_DIR" -czf "$ARCHIVE" "$(basename "$TARGET_DIR")"
rm -rf "$TARGET_DIR"
chmod 0600 "$ARCHIVE"

find "$BACKUP_DIR" -type f -name 'eventlotse-*.tar.gz' -mmin "+$((KEEP_DAYS * 1440))" -delete
printf '[Eventlotse] Backup erstellt: %s\n' "$ARCHIVE"
