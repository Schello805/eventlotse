# Self-Hosting

Eventlotse besteht aus einer React-App und einer Node/Express-Serverbasis. Im produktiven Self-Hosting speichert der Server Daten in PostgreSQL, verwaltet Sessions, Rollen, Uploads, Auditlog und SMTP-Testmails. Ohne Server bleibt LocalStorage als Entwicklungs- und Offline-Fallback nutzbar.

## Automatische Installation auf Ubuntu 24.04

```bash
sudo apt-get update
sudo apt-get install -y git ca-certificates curl
git clone https://github.com/Schello805/eventlotse.git /tmp/eventlotse
cd /tmp/eventlotse
sudo SERVER_NAME=deine-domain.de ./scripts/install-ubuntu-24.04.sh
```

Das Script installiert Node.js, PostgreSQL und Nginx, legt Datenbank und Admin an, schreibt `/etc/eventlotse/eventlotse.env`, führt Migrationen aus, baut die App und startet den systemd-Service `eventlotse`.
Die initialen Admin-Logindaten werden bei der Installation angezeigt. Das Passwort sollte nach dem ersten Login in der Adminseite geändert werden.

## Updates

```bash
cd /opt/eventlotse
sudo ./scripts/update-ubuntu-24.04.sh
```

## Minimalbetrieb

```bash
npm ci
cp .env.example .env
npm run db:migrate
npm run build
npm run server
```

Der Node-Server liefert API und `dist/` gemeinsam aus. Für reine Frontend-Tests kann `npm run dev` weiter genutzt werden.

## Nginx-Beispiel

```nginx
server {
  listen 80;
  server_name eventlotse.example.org;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

## Backups

```bash
sudo /opt/eventlotse/scripts/backup-postgres.sh
```

## Enthaltene Produktionsbausteine

- Backend-API mit Node.js und Express
- PostgreSQL-Schema mit Migration
- Authentifizierung mit HttpOnly-Cookie
- Rollenmodell: Admin, Helfer, Künstler
- Event-spezifische Mitgliederrechte
- Admin-Konfiguration für SMTP inklusive Passwort/App-Passwort, Base URL, Benutzerverwaltung und Auditlog
- Dateiablage für Flyer, Rechnungen, Tech-Rider und Pläne
- HTML-Testmail und HTML-Einladungsmail
- Einladungslinks mit Passwort setzen
- Dateidownload und Dateilöschung
- iCal-, CSV- und PDF-Export
- manueller Erinnerungslauf für fällige Aufgaben
- Backup-Script für PostgreSQL

## Nächste Ausbaustufen

- Excel-XLSX-Export zusätzlich zum CSV-Export
- zeitgesteuerte Erinnerungen per Mail oder Push
- SMTP-Passwort verschlüsselt speichern
