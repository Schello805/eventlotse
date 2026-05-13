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
sudo /opt/eventlotse/scripts/backup.sh
```

Die Backups liegen standardmäßig unter `/var/backups/eventlotse` und enthalten:

- PostgreSQL-Dump
- Upload-Verzeichnis
- Umgebungskonfiguration aus `/etc/eventlotse/eventlotse.env`

Alte Backups werden nach `KEEP_DAYS` Tagen gelöscht, Standard ist `14`.

## Restore

1. Eventlotse kurz stoppen und sicherstellen, dass die Ziel-Datenbank leer oder bewusst überschreibbar ist:

```bash
sudo systemctl stop eventlotse
```

2. Passendes Backup-Archiv auswählen und zurückspielen:

```bash
sudo /opt/eventlotse/scripts/restore.sh /var/backups/eventlotse/eventlotse-YYYYMMDD-HHMMSS.tar.gz
```

3. Service prüfen:

```bash
sudo systemctl status eventlotse
```

Wenn du komplett auf einen neuen Server umziehst, zuerst Installation ausführen, dann Service stoppen, Restore einspielen und anschließend wieder starten. Mit `RESTORE_ENV=true` kann auch die gesicherte Umgebungskonfiguration zurückgeschrieben werden.

## Enthaltene Produktionsbausteine

- Backend-API mit Node.js und Express
- PostgreSQL-Schema mit Migration
- normalisierte Tabellen für Aktionen, Aufgaben, Infrastruktur, Zeitplan und Budget
- Authentifizierung mit HttpOnly-Cookie
- Rollenmodell: Admin und Helfer
- Event-spezifische Mitgliederrechte
- Admin-Konfiguration für SMTP inklusive Passwort/App-Passwort, Base URL, Benutzerverwaltung und Auditlog
- Dateiablage für Flyer, Rechnungen, Tech-Rider und Pläne
- HTML-Testmail und HTML-Einladungsmail
- Einladungslinks mit Passwort setzen
- Dateidownload und Dateilöschung
- iCal-, CSV-, XLSX- und PDF-Export
- manueller und automatischer Erinnerungslauf für fällige Aufgaben
- konfigurierbarer Erinnerungsvorlauf für bald fällige Aufgaben
- verschlüsselte Speicherung des SMTP-Passworts
- CSRF-Schutz für angemeldete Schreibzugriffe
- Upload-Schutz gegen ausführbare Endungen und Signaturen
- Backup-/Restore-Scripte für Datenbank, Uploads und Umgebung
- Account-Datenexport im Profil

## Nächste Ausbaustufen

- Push-Erinnerungen zusätzlich zu E-Mail
- feinere Rechte pro Aufgabenkarte
- optionale Zwei-Faktor-Anmeldung für Admins
