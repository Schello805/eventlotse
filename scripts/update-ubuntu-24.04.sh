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
NGINX_SITE="/etc/nginx/sites-available/eventlotse"
NGINX_SITE_LINK="/etc/nginx/sites-enabled/eventlotse"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/eventlotse}"
SKIP_BACKUP="${SKIP_BACKUP:-false}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-30}"

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
  apt-get install -y postgresql postgresql-client openssl sudo curl gzip
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

set_env_value() {
  local key="$1"
  local value="${2:-}"
  if grep -q "^${key}=" "$ENV_FILE"; then
    sed -i "s|^${key}=.*|${key}=$(quote_env_value "$value")|" "$ENV_FILE"
  else
    write_env_line "$key" "$value" >> "$ENV_FILE"
  fi
}

public_base_url_for_server_name() {
  if [ -n "${PUBLIC_BASE_URL_OVERRIDE:-}" ]; then
    printf '%s\n' "$PUBLIC_BASE_URL_OVERRIDE"
    return
  fi

  if [ "$SERVER_NAME" = "_" ]; then
    printf 'http://_\n'
    return
  fi

  if [ -f "/etc/letsencrypt/live/${SERVER_NAME}/fullchain.pem" ] && [ -f "/etc/letsencrypt/live/${SERVER_NAME}/privkey.pem" ]; then
    printf 'https://%s\n' "$SERVER_NAME"
  else
    printf 'http://%s\n' "$SERVER_NAME"
  fi
}

sync_public_runtime_env() {
  if [ "$SERVER_NAME" = "_" ] && [ -z "${PUBLIC_BASE_URL_OVERRIDE:-}" ]; then
    return
  fi

  local desired_url desired_secure current_url
  desired_url="$(public_base_url_for_server_name)"
  desired_secure=false
  if [[ "$desired_url" == https://* ]]; then
    desired_secure=true
  fi

  current_url="$(sed -n 's/^PUBLIC_BASE_URL=//p' "$ENV_FILE" | tail -n 1 | sed "s/^'//;s/'$//")"
  if [ "$current_url" != "$desired_url" ]; then
    log "Synchronisiere PUBLIC_BASE_URL auf ${desired_url}."
    set_env_value PUBLIC_BASE_URL "$desired_url"
  fi
  set_env_value COOKIE_SECURE "$desired_secure"
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

public_host_from_env() {
  node -e "const value=process.env.PUBLIC_BASE_URL || ''; try { console.log(new URL(value).hostname || '_') } catch { console.log('_') }"
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

backup_current_state() {
  if [ "$SKIP_BACKUP" = "true" ]; then
    log "Backup übersprungen, weil SKIP_BACKUP=true gesetzt ist."
    return
  fi

  load_env
  local stamp
  stamp="$(date +%Y%m%d-%H%M%S)"
  install -d -m 0750 "$BACKUP_DIR"
  log "Erstelle Backup unter ${BACKUP_DIR}."
  cp "$ENV_FILE" "${BACKUP_DIR}/eventlotse-${stamp}.env"
  chmod 0600 "${BACKUP_DIR}/eventlotse-${stamp}.env"
  if command -v pg_dump >/dev/null 2>&1; then
    pg_dump "$DATABASE_URL" | gzip > "${BACKUP_DIR}/eventlotse-${stamp}.sql.gz"
    chmod 0600 "${BACKUP_DIR}/eventlotse-${stamp}.sql.gz"
  fi
}

ensure_systemd_service() {
  log "Synchronisiere systemd-Service."
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

restart_and_check() {
  load_env
  local expected_version
  expected_version="$(node -p "require('${APP_DIR}/package.json').version")"
  log "Starte Eventlotse neu."
  systemctl restart eventlotse
  systemctl is-active --quiet eventlotse

  local health_url="http://${HOST:-127.0.0.1}:${PORT:-$APP_PORT}/api/health"
  log "Prüfe Healthcheck ${health_url}."
  for _ in $(seq 1 "$HEALTH_TIMEOUT"); do
    local health_response
    health_response="$(curl -fs "$health_url" 2>/dev/null || true)"
    if [[ "$health_response" == *"\"version\":\"${expected_version}\""* ]]; then
      log "Eventlotse läuft mit Version ${expected_version}."
      return
    fi
    sleep 1
  done

  echo "Eventlotse antwortet nach ${HEALTH_TIMEOUT}s nicht mit Version ${expected_version}." >&2
  journalctl -u eventlotse -n 80 --no-pager >&2 || true
  exit 1
}

verify_dist_version() {
  local expected_version
  expected_version="$(node -p "require('${APP_DIR}/package.json').version")"
  if ! grep -R "${expected_version}" "$APP_DIR/dist/assets" >/dev/null 2>&1; then
    echo "Der gebaute Frontend-Bundle enthält Version ${expected_version} nicht." >&2
    exit 1
  fi
}

write_nginx_proxy_site() {
  if ! command -v nginx >/dev/null 2>&1; then
    return
  fi

  load_env
  local public_host cert_dir
  public_host="$(public_host_from_env)"
  if [ "$public_host" = "_" ]; then
    public_host="$SERVER_NAME"
  fi
  cert_dir="/etc/letsencrypt/live/${public_host}"

  log "Synchronisiere Nginx-Proxy für ${public_host}."
  if [ -f "${cert_dir}/fullchain.pem" ] && [ -f "${cert_dir}/privkey.pem" ]; then
    cat > "$NGINX_SITE" <<NGINX
server {
  listen 80;
  listen [::]:80;
  server_name ${public_host};
  return 301 https://\$host\$request_uri;
}

server {
  listen 443 ssl http2;
  listen [::]:443 ssl http2;
  server_name ${public_host};

  ssl_certificate ${cert_dir}/fullchain.pem;
  ssl_certificate_key ${cert_dir}/privkey.pem;
  include /etc/letsencrypt/options-ssl-nginx.conf;
  ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

  access_log /var/log/nginx/eventlotse.access.log;
  error_log /var/log/nginx/eventlotse.error.log;

  location / {
    proxy_pass http://127.0.0.1:${PORT:-$APP_PORT};
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }
}
NGINX
  else
    cat > "$NGINX_SITE" <<NGINX
server {
  listen 80;
  listen [::]:80;
  server_name ${public_host};

  access_log /var/log/nginx/eventlotse.access.log;
  error_log /var/log/nginx/eventlotse.error.log;

  location / {
    proxy_pass http://127.0.0.1:${PORT:-$APP_PORT};
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }
}
NGINX
  fi

  ln -sfn "$NGINX_SITE" "$NGINX_SITE_LINK"
  rm -f /etc/nginx/sites-enabled/default
}

verify_public_version() {
  if ! command -v nginx >/dev/null 2>&1; then
    return
  fi

  load_env
  local expected_version public_url public_response
  expected_version="$(node -p "require('${APP_DIR}/package.json').version")"
  public_url="${PUBLIC_BASE_URL%/}/version.json"
  log "Prüfe öffentliche Version ${public_url}."
  public_response="$(curl -fs "$public_url" 2>/dev/null || true)"
  if [[ "$public_response" == *"\"version\":\"${expected_version}\""* ]]; then
    log "Öffentliche Domain liefert Version ${expected_version}."
    return
  fi

  echo "Die öffentliche Domain liefert noch nicht Version ${expected_version}." >&2
  echo "Antwort von ${public_url}:" >&2
  echo "$public_response" | head -n 20 >&2
  exit 1
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
  sync_public_runtime_env
  ensure_database
  load_env
  install -d -m 0750 -o www-data -g www-data "${UPLOAD_DIR:-/var/lib/eventlotse/uploads}"
  ensure_systemd_service
  backup_current_state

  log "Hole neueste Version."
  git -C "$APP_DIR" pull --ff-only

  log "Installiere Abhängigkeiten und baue die App."
  cd "$APP_DIR"
  npm ci --include=dev
  load_env
  npm run db:migrate
  npm run build
  npm test
  npm run test:smoke
  verify_dist_version
  npm prune --omit=dev

  install -d -m 0750 -o www-data -g www-data "${UPLOAD_DIR:-/var/lib/eventlotse/uploads}"
  restart_and_check

  if command -v nginx >/dev/null 2>&1; then
    write_nginx_proxy_site
    nginx -t
    systemctl reload nginx
    verify_public_version
  fi

  log "Update abgeschlossen. Aktiver Stand: $(git -C "$APP_DIR" rev-parse --short HEAD)"
}

main "$@"
