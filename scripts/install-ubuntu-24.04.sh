#!/usr/bin/env bash
set -Eeuo pipefail

REPO_URL="${REPO_URL:-https://github.com/Schello805/eventlotse.git}"
APP_DIR="${APP_DIR:-/opt/eventlotse}"
WEB_ROOT="${WEB_ROOT:-/var/www/eventlotse}"
SERVER_NAME="${SERVER_NAME:-_}"
NODE_MAJOR="${NODE_MAJOR:-20}"
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

  root ${WEB_ROOT};
  index index.html;

  access_log /var/log/nginx/eventlotse.access.log;
  error_log /var/log/nginx/eventlotse.error.log;

  location / {
    try_files \$uri \$uri/ /index.html;
  }

  location ~* \.(?:css|js|png|jpg|jpeg|gif|svg|ico|webp|woff2?)\$ {
    expires 30d;
    add_header Cache-Control "public, immutable";
    try_files \$uri =404;
  }
}
NGINX

  ln -sfn "$NGINX_SITE" "$NGINX_SITE_LINK"
  rm -f /etc/nginx/sites-enabled/default
  nginx -t
  systemctl enable nginx
  systemctl reload nginx
}

main() {
  require_root

  log "Installiere Systempakete."
  apt-get update
  apt-get install -y git nginx rsync ca-certificates curl gnupg
  install_node

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
  npm run build

  log "Deploye Build nach ${WEB_ROOT}."
  install -d -m 0755 "$WEB_ROOT"
  rsync -a --delete "$APP_DIR/dist/" "$WEB_ROOT/"
  chown -R www-data:www-data "$WEB_ROOT"

  write_nginx_site

  log "Fertig. Eventlotse ist über http://${SERVER_NAME} erreichbar."
  log "Für HTTPS empfohlen: sudo apt install certbot python3-certbot-nginx && sudo certbot --nginx -d deine-domain.de"
}

main "$@"
