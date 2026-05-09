#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/opt/eventlotse}"
ENV_FILE="${ENV_FILE:-/etc/eventlotse/eventlotse.env}"
EMAIL="${1:-${ADMIN_EMAIL:-}}"
PASSWORD="${2:-}"

if [ -z "$EMAIL" ] || [ -z "$PASSWORD" ]; then
  echo "Nutzung: sudo $0 admin@example.de 'NeuesSicheresPasswort123!'" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

cd "$APP_DIR"
node scripts/reset-admin-password.mjs "$EMAIL" "$PASSWORD"
