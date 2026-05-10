#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/opt/eventlotse}"
ENV_FILE="${ENV_FILE:-/etc/eventlotse/eventlotse.env}"
RESTORE_ARCHIVE="${1:-}"
RESTORE_ENV="${RESTORE_ENV:-false}"

log() {
  printf '\n[Eventlotse] %s\n' "$1"
}

if [ -z "$RESTORE_ARCHIVE" ] || [ ! -f "$RESTORE_ARCHIVE" ]; then
  echo "Bitte Backup-Archiv angeben, z.B. sudo ./scripts/restore.sh /var/backups/eventlotse/eventlotse-YYYYMMDD-HHMMSS.tar.gz" >&2
  exit 1
fi

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
else
  echo "${ENV_FILE} fehlt. Restore abgebrochen." >&2
  exit 1
fi

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

log "Entpacke Backup."
tar -C "$TMP_DIR" -xzf "$RESTORE_ARCHIVE"
RESTORE_DIR="$(find "$TMP_DIR" -mindepth 1 -maxdepth 1 -type d | head -n 1)"

if [ -z "$RESTORE_DIR" ] || [ ! -f "$RESTORE_DIR/database.sql.gz" ]; then
  echo "Backup-Archiv hat nicht das erwartete Format." >&2
  exit 1
fi

log "Stelle Datenbank wieder her."
gunzip -c "$RESTORE_DIR/database.sql.gz" | psql "${DATABASE_URL:?DATABASE_URL fehlt}"

if [ -f "$RESTORE_DIR/uploads.tar.gz" ]; then
  log "Stelle Uploads wieder her."
  mkdir -p "$(dirname "${UPLOAD_DIR:-/var/lib/eventlotse/uploads}")"
  tar -C "$(dirname "${UPLOAD_DIR:-/var/lib/eventlotse/uploads}")" -xzf "$RESTORE_DIR/uploads.tar.gz"
  chown -R www-data:www-data "${UPLOAD_DIR:-/var/lib/eventlotse/uploads}" 2>/dev/null || true
fi

if [ "$RESTORE_ENV" = "true" ] && [ -f "$RESTORE_DIR/eventlotse.env" ]; then
  log "Stelle Umgebungskonfiguration wieder her."
  install -d -m 0750 "$(dirname "$ENV_FILE")"
  cp "$RESTORE_DIR/eventlotse.env" "$ENV_FILE"
  chmod 0640 "$ENV_FILE"
  chown root:www-data "$ENV_FILE" 2>/dev/null || true
fi

if command -v systemctl >/dev/null 2>&1; then
  log "Starte Eventlotse neu."
  systemctl restart eventlotse || true
fi

printf '[Eventlotse] Restore abgeschlossen: %s\n' "$RESTORE_ARCHIVE"
