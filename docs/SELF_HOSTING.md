# Self-Hosting

Eventlotse ist aktuell eine statische React-App. Daten werden im Browser gespeichert. Für private Tests reicht das aus; für Teams mit mehreren Geräten braucht es später ein Backend.

## Automatische Installation auf Ubuntu 24.04

```bash
sudo apt-get update
sudo apt-get install -y git ca-certificates curl
git clone https://github.com/Schello805/EventStack.git /tmp/eventlotse
cd /tmp/eventlotse
sudo SERVER_NAME=deine-domain.de ./scripts/install-ubuntu-24.04.sh
```

Das Script installiert Node.js, Nginx und rsync, baut die App und deployt `dist/` nach `/var/www/eventlotse`.

## Updates

```bash
cd /opt/eventlotse
sudo ./scripts/update-ubuntu-24.04.sh
```

## Minimalbetrieb

```bash
npm ci
npm run build
```

Den Ordner `dist/` danach mit Nginx, Caddy, Apache oder einem Static-File-Host ausliefern.

## Nginx-Beispiel

```nginx
server {
  listen 80;
  server_name eventlotse.example.org;
  root /var/www/eventlotse/dist;
  index index.html;

  location / {
    try_files $uri /index.html;
  }
}
```

## Nächste Produktionsbausteine

- Backend-API, z.B. Node.js mit Fastify oder NestJS
- Datenbank, z.B. PostgreSQL
- Authentifizierung mit sicheren Sessions
- Rollenmodell: Admin, Helfer, Act
- Admin-Konfiguration für SMTP, Base URL, Benutzerverwaltung und Auditlog
- Dateiablage für Flyer, Rechnungen, Tech-Rider und Pläne
- Mail- oder Push-Benachrichtigungen
- iCal-Export für Kalender
- PDF- und Excel-Export
- Backup-Konzept
