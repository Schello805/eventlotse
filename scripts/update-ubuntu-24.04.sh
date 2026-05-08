#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/opt/eventlotse}"
WEB_ROOT="${WEB_ROOT:-/var/www/eventlotse}"

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
  npm run build

  log "Deploye Build nach ${WEB_ROOT}."
  install -d -m 0755 "$WEB_ROOT"
  rsync -a --delete "$APP_DIR/dist/" "$WEB_ROOT/"
  chown -R www-data:www-data "$WEB_ROOT"

  if command -v nginx >/dev/null 2>&1; then
    nginx -t
    systemctl reload nginx
  fi

  log "Update abgeschlossen."
}

main "$@"
