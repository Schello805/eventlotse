#!/usr/bin/env bash
set -Eeuo pipefail

REPO_URL="${REPO_URL:-https://github.com/Schello805/eventlotse.git}"
APP_DIR="${APP_DIR:-/opt/eventlotse}"
SERVER_NAME="${SERVER_NAME:-_}"
NODE_MAJOR="${NODE_MAJOR:-20}"
APP_PORT="${APP_PORT:-3000}"
DB_NAME="${DB_NAME:-eventlotse}"
DB_USER="${DB_USER:-eventlotse}"
DB_PASSWORD="${DB_PASSWORD:-$(openssl rand -base64 24 | tr -d '\n')}"
JWT_SECRET="${JWT_SECRET:-$(openssl rand -base64 48 | tr -d '\n')}"
ADMIN_EMAIL="${ADMIN_EMAIL:-info@schellenberger.biz}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-$(openssl rand -base64 18 | tr -d '\n')}"
ENV_DIR="/etc/eventlotse"
ENV_FILE="${ENV_DIR}/eventlotse.env"
SYSTEMD_SERVICE="/etc/systemd/system/eventlotse.service"
NGINX_SITE="/etc/nginx/sites-available/eventlotse"
NGINX_SITE_LINK="/etc/nginx/sites-enabled/eventlotse"

log() {
  printf '\n[Eventlotse] %s\n' "$1"
}

require_root() {
  if [ "$(id -u)" -ne 0 ]; then
    echo "Bitte als root ausführen, z.B. mit sudo." >&2
    exit 1
  fi
}

install_node() {
  if command -v node >/dev/null 2>&1; then
    local current_major
    current_major="$(node --version | sed 's/^v//' | cut -d. -f1)"
    if [ "$current_major" -ge "$NODE_MAJOR" ]; then
      log "Node.js $(node --version) ist bereits installiert."
      return
    fi
  fi

  log "Installiere Node.js ${NODE_MAJOR}.x über NodeSource."
  apt-get update
  apt-get install -y ca-certificates curl gnupg
  install -d -m 0755 /etc/apt/keyrings
  curl -fsSL "https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key" | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
  apt-get update
  apt-get install -y nodejs
}

write_nginx_site() {
  log "Schreibe Nginx-Konfiguration für ${SERVER_NAME}."
  cat > "$NGINX_SITE" <<NGINX
server {
  listen 80;
  listen [::]:80;
  server_name ${SERVER_NAME};

  access_log /var/log/nginx/eventlotse.access.log;
  error_log /var/log/nginx/eventlotse.error.log;

  location / {
    proxy_pass http://127.0.0.1:${APP_PORT};
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }
}
NGINX

  ln -sfn "$NGINX_SITE" "$NGINX_SITE_LINK"
  rm -f /etc/nginx/sites-enabled/default
  nginx -t
  systemctl enable nginx
  systemctl reload nginx
}

setup_postgres() {
  log "Installiere und konfiguriere PostgreSQL."
  apt-get install -y postgresql postgresql-client
  systemctl enable postgresql
  systemctl start postgresql

  sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1 || \
    sudo -u postgres psql -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASSWORD}';"
  sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1 || \
    sudo -u postgres createdb -O "${DB_USER}" "${DB_NAME}"
}

write_env_file() {
  log "Schreibe Umgebungskonfiguration nach ${ENV_FILE}."
  install -d -m 0750 "$ENV_DIR"
  cat > "$ENV_FILE" <<ENV
NODE_ENV=production
PORT=${APP_PORT}
HOST=127.0.0.1
PUBLIC_BASE_URL=http://${SERVER_NAME}
DATABASE_URL=postgres://${DB_USER}:${DB_PASSWORD}@localhost:5432/${DB_NAME}
JWT_SECRET=${JWT_SECRET}
COOKIE_SECURE=false
UPLOAD_DIR=/var/lib/eventlotse/uploads
ADMIN_EMAIL=${ADMIN_EMAIL}
ADMIN_PASSWORD=${ADMIN_PASSWORD}
SMTP_HOST=${SMTP_HOST:-}
SMTP_PORT=${SMTP_PORT:-587}
SMTP_USER=${SMTP_USER:-}
SMTP_PASS=${SMTP_PASS:-}
SMTP_FROM=${SMTP_FROM:-Eventlotse <${ADMIN_EMAIL}>}
SMTP_SECURE=${SMTP_SECURE:-false}
ENV
  chmod 0640 "$ENV_FILE"
  chown root:www-data "$ENV_FILE"
  install -d -m 0750 -o www-data -g www-data /var/lib/eventlotse/uploads
}

write_systemd_service() {
  log "Schreibe systemd-Service."
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

  chown -R www-data:www-data "$APP_DIR"
  systemctl daemon-reload
  systemctl enable eventlotse
  systemctl restart eventlotse
}

main() {
  require_root

  log "Installiere Systempakete."
  apt-get update
  apt-get install -y git nginx ca-certificates curl gnupg openssl sudo
  install_node
  setup_postgres

  if [ ! -d "$APP_DIR/.git" ]; then
    log "Klone Repository nach ${APP_DIR}."
    rm -rf "$APP_DIR"
    git clone "$REPO_URL" "$APP_DIR"
  else
    log "Repository existiert bereits. Aktualisiere ${APP_DIR}."
    git -C "$APP_DIR" pull --ff-only
  fi

  log "Installiere Abhängigkeiten und baue die App."
  cd "$APP_DIR"
  npm ci
  write_env_file
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
  npm run db:migrate
  npm run build

  write_systemd_service
  write_nginx_site

  log "Fertig. Eventlotse ist über http://${SERVER_NAME} erreichbar."
  log "Initialer Admin: ${ADMIN_EMAIL}"
  log "Initiales Passwort: ${ADMIN_PASSWORD}"
  log "Für HTTPS empfohlen: sudo apt install certbot python3-certbot-nginx && sudo certbot --nginx -d deine-domain.de"
}

main "$@"
