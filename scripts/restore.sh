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
elif [ -z "${DATABASE_URL:-}" ]; then
  echo "${ENV_FILE} fehlt. Restore abgebrochen." >&2
  exit 1
fi

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

validate_archive() {
  local archive="$1"
  while IFS= read -r entry; do
    case "$entry" in
      /*|*"../"*|"..")
        echo "Unsicherer Pfad im Backup-Archiv: $entry" >&2
        exit 1
        ;;
    esac
  done < <(tar -tzf "$archive")
  while IFS= read -r details; do
    case "$details" in
      l*|h*)
        echo "Links sind in Backup-Archiven nicht erlaubt." >&2
        exit 1
        ;;
    esac
  done < <(tar -tvzf "$archive")
}

log "Entpacke Backup."
validate_archive "$RESTORE_ARCHIVE"
tar -C "$TMP_DIR" -xzf "$RESTORE_ARCHIVE"
RESTORE_DIR="$(find "$TMP_DIR" -mindepth 1 -maxdepth 1 -type d | head -n 1)"

if [ -z "$RESTORE_DIR" ] || [ ! -f "$RESTORE_DIR/database.sql.gz" ]; then
  echo "Backup-Archiv hat nicht das erwartete Format." >&2
  exit 1
fi

log "Stelle Datenbank wieder her."
gunzip -c "$RESTORE_DIR/database.sql.gz" | psql -v ON_ERROR_STOP=1 "${DATABASE_URL:?DATABASE_URL fehlt}"

if [ -f "$RESTORE_DIR/uploads.tar.gz" ]; then
  log "Stelle Uploads wieder her."
  validate_archive "$RESTORE_DIR/uploads.tar.gz"
  RESTORE_UPLOAD_DIR="${UPLOAD_DIR:-/var/lib/eventlotse/uploads}"
  if [ -z "$RESTORE_UPLOAD_DIR" ] || [ "$RESTORE_UPLOAD_DIR" = "/" ]; then
    echo "Unsicheres Upload-Ziel. Restore abgebrochen." >&2
    exit 1
  fi
  rm -rf "$RESTORE_UPLOAD_DIR"
  mkdir -p "$(dirname "$RESTORE_UPLOAD_DIR")"
  tar -C "$(dirname "$RESTORE_UPLOAD_DIR")" -xzf "$RESTORE_DIR/uploads.tar.gz"
  chown -R www-data:www-data "$RESTORE_UPLOAD_DIR" 2>/dev/null || true
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
