#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/opt/eventlotse}"
ENV_FILE="${ENV_FILE:-/etc/eventlotse/eventlotse.env}"

log() {
  printf '\n[Eventlotse] %s\n' "$1"
}

require_root() {
  if [ "$(id -u)" -ne 0 ]; then
    echo "Bitte als root ausführen, z.B. mit sudo." >&2
    exit 1
  fi
}

main() {
  require_root

  if [ ! -d "$APP_DIR/.git" ]; then
    echo "Kein Git-Repository unter ${APP_DIR} gefunden. Bitte zuerst install-ubuntu-24.04.sh ausführen." >&2
    exit 1
  fi

  log "Hole neueste Version."
  git -C "$APP_DIR" pull --ff-only

  log "Installiere Abhängigkeiten und baue die App."
  cd "$APP_DIR"
  npm ci
  if [ -f "$ENV_FILE" ]; then
    set -a
    # shellcheck disable=SC1090
    . "$ENV_FILE"
    set +a
  fi
  npm run db:migrate
  npm run build

  chown -R www-data:www-data "$APP_DIR"

  if systemctl list-unit-files eventlotse.service >/dev/null 2>&1; then
    systemctl restart eventlotse
  fi

  if command -v nginx >/dev/null 2>&1; then
    nginx -t
    systemctl reload nginx
  fi

  log "Update abgeschlossen."
}

main "$@"
