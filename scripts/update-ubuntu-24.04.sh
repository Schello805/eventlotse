#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/opt/eventlotse}"
ENV_FILE="${ENV_FILE:-/etc/eventlotse/eventlotse.env}"
ENV_DIR="$(dirname "$ENV_FILE")"
SERVER_NAME="${SERVER_NAME:-_}"
APP_PORT="${APP_PORT:-3000}"
DB_NAME="${DB_NAME:-eventlotse}"
DB_USER="${DB_USER:-eventlotse}"
DB_PASSWORD="${DB_PASSWORD:-$(openssl rand -base64 24 | tr -d '\n')}"
JWT_SECRET="${JWT_SECRET:-$(openssl rand -base64 48 | tr -d '\n')}"
REMINDER_HOUR="${REMINDER_HOUR:-8}"
ADMIN_EMAIL="${ADMIN_EMAIL:-info@schellenberger.biz}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-$(openssl rand -base64 18 | tr -d '\n')}"
SYSTEMD_SERVICE="/etc/systemd/system/eventlotse.service"

log() {
  printf '\n[Eventlotse] %s\n' "$1"
}

quote_env_value() {
  local value="${1:-}"
  printf "'%s'" "${value//\'/\'\\\'\'}"
}

write_env_line() {
  printf '%s=%s\n' "$1" "$(quote_env_value "${2:-}")"
}

require_root() {
  if [ "$(id -u)" -ne 0 ]; then
    echo "Bitte als root ausführen, z.B. mit sudo." >&2
    exit 1
  fi
}

ensure_packages() {
  log "Prüfe Systempakete."
  apt-get update
  apt-get install -y postgresql postgresql-client openssl sudo
  systemctl enable postgresql
  systemctl start postgresql
}

ensure_env_file() {
  if [ -f "$ENV_FILE" ]; then
    return
  fi

  log "Keine ${ENV_FILE} gefunden. Lege Server-Konfiguration für bestehende Installation an."
  install -d -m 0750 "$ENV_DIR"
  {
    write_env_line NODE_ENV production
    write_env_line PORT "$APP_PORT"
    write_env_line HOST 127.0.0.1
    write_env_line PUBLIC_BASE_URL "http://${SERVER_NAME}"
    write_env_line DATABASE_URL "postgres://${DB_USER}:${DB_PASSWORD}@localhost:5432/${DB_NAME}"
    write_env_line JWT_SECRET "$JWT_SECRET"
    write_env_line COOKIE_SECURE false
    write_env_line UPLOAD_DIR /var/lib/eventlotse/uploads
    write_env_line ADMIN_EMAIL "$ADMIN_EMAIL"
    write_env_line ADMIN_PASSWORD "$ADMIN_PASSWORD"
    write_env_line REMINDER_HOUR "$REMINDER_HOUR"
    write_env_line SMTP_HOST "${SMTP_HOST:-}"
    write_env_line SMTP_PORT "${SMTP_PORT:-587}"
    write_env_line SMTP_USER "${SMTP_USER:-}"
    write_env_line SMTP_PASS "${SMTP_PASS:-}"
    write_env_line SMTP_FROM "${SMTP_FROM:-Eventlotse <${ADMIN_EMAIL}>}"
    write_env_line SMTP_SECURE "${SMTP_SECURE:-false}"
  } > "$ENV_FILE"
  chmod 0640 "$ENV_FILE"
  chown root:www-data "$ENV_FILE"
  log "Initialer Admin: ${ADMIN_EMAIL}"
  log "Initiales Passwort: ${ADMIN_PASSWORD}"
}

repair_env_file() {
  if grep -q '^SMTP_FROM=Eventlotse <' "$ENV_FILE"; then
    local current_from
    current_from="$(sed -n 's/^SMTP_FROM=//p' "$ENV_FILE" | tail -n 1)"
    log "Repariere unquoted SMTP_FROM in ${ENV_FILE}."
    sed -i "s|^SMTP_FROM=.*|SMTP_FROM=$(quote_env_value "$current_from")|" "$ENV_FILE"
  fi
}

load_env() {
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
}

database_name_from_url() {
  node -e "const url=new URL(process.env.DATABASE_URL); console.log(url.pathname.slice(1))"
}

database_user_from_url() {
  node -e "const url=new URL(process.env.DATABASE_URL); console.log(decodeURIComponent(url.username))"
}

database_password_from_url() {
  node -e "const url=new URL(process.env.DATABASE_URL); console.log(decodeURIComponent(url.password))"
}

ensure_database() {
  load_env
  local db_name db_user db_password
  db_name="$(database_name_from_url)"
  db_user="$(database_user_from_url)"
  db_password="$(database_password_from_url)"

  log "Prüfe PostgreSQL-Datenbank ${db_name}."
  sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='${db_user}'" | grep -q 1 || \
    sudo -u postgres psql -c "CREATE USER ${db_user} WITH PASSWORD '${db_password}';"
  sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='${db_name}'" | grep -q 1 || \
    sudo -u postgres createdb -O "${db_user}" "${db_name}"
}

ensure_systemd_service() {
  if [ -f "$SYSTEMD_SERVICE" ]; then
    return
  fi

  log "Lege systemd-Service für bestehende Installation an."
  cat > "$SYSTEMD_SERVICE" <<SERVICE
[Unit]
Description=Eventlotse
After=network.target postgresql.service

[Service]
Type=simple
WorkingDirectory=${APP_DIR}
EnvironmentFile=${ENV_FILE}
ExecStart=/usr/bin/npm run server
Restart=always
RestartSec=5
User=www-data
Group=www-data
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
SERVICE
  systemctl daemon-reload
  systemctl enable eventlotse
}

main() {
  require_root

  if [ ! -d "$APP_DIR/.git" ]; then
    echo "Kein Git-Repository unter ${APP_DIR} gefunden. Bitte zuerst install-ubuntu-24.04.sh ausführen." >&2
    exit 1
  fi

  ensure_packages
  ensure_env_file
  repair_env_file
  ensure_database
  install -d -m 0750 -o www-data -g www-data /var/lib/eventlotse/uploads
  ensure_systemd_service

  log "Hole neueste Version."
  git -C "$APP_DIR" pull --ff-only

  log "Installiere Abhängigkeiten und baue die App."
  cd "$APP_DIR"
  npm ci
  load_env
  npm run db:migrate
  npm run build

  chown -R www-data:www-data "$APP_DIR"

  systemctl restart eventlotse

  if command -v nginx >/dev/null 2>&1; then
    nginx -t
    systemctl reload nginx
  fi

  log "Update abgeschlossen."
}

main "$@"
