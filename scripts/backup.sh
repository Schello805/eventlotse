#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/opt/eventlotse}"
ENV_FILE="${ENV_FILE:-/etc/eventlotse/eventlotse.env}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/eventlotse}"
KEEP_DAYS="${KEEP_DAYS:-14}"

log() {
  printf '\n[Eventlotse] %s\n' "$1"
}

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
else
  echo "Keine Eventlotse-Umgebung gefunden. ENV_FILE oder APP_DIR prüfen." >&2
  exit 1
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
TARGET_DIR="${BACKUP_DIR}/eventlotse-${STAMP}"
ARCHIVE="${TARGET_DIR}.tar.gz"

install -d -m 0750 "$BACKUP_DIR"
install -d -m 0700 "$TARGET_DIR"

log "Sichere PostgreSQL-Datenbank."
pg_dump "${DATABASE_URL:?DATABASE_URL fehlt}" | gzip > "${TARGET_DIR}/database.sql.gz"

log "Sichere Uploads und Konfiguration."
if [ -d "${UPLOAD_DIR:-/var/lib/eventlotse/uploads}" ]; then
  tar -C "$(dirname "${UPLOAD_DIR:-/var/lib/eventlotse/uploads}")" -czf "${TARGET_DIR}/uploads.tar.gz" "$(basename "${UPLOAD_DIR:-/var/lib/eventlotse/uploads}")"
fi
cp "$ENV_FILE" "${TARGET_DIR}/eventlotse.env"
chmod 0600 "${TARGET_DIR}/eventlotse.env"

log "Erstelle Backup-Archiv."
tar -C "$BACKUP_DIR" -czf "$ARCHIVE" "$(basename "$TARGET_DIR")"
rm -rf "$TARGET_DIR"
chmod 0600 "$ARCHIVE"

find "$BACKUP_DIR" -type f -name 'eventlotse-*.tar.gz' -mtime "+$KEEP_DAYS" -delete
printf '[Eventlotse] Backup erstellt: %s\n' "$ARCHIVE"
