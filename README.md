# Eventlotse

Eventlotse ist eine selbst hostbare Web-App für private Veranstaltungen: Events anlegen, Mithelfer per E-Mail einladen, Aktionen wie Aufbau, Abbau, Musik, Flyer oder Catering aktivieren und die Arbeit danach in Kanban-Unteraufgaben organisieren.

Repository: https://github.com/Schello805/EventStack

## Status

Rev. `v0.4.0` ist eine lauffähige Frontend-Version mit lokaler Browser-Speicherung, App-Routing, validierten Formularen und verbesserten Arbeitsansichten. Sie eignet sich zum Testen des Workflows und als Basis für die nächsten Ausbaustufen mit echter Authentifizierung, Datenbank und Benachrichtigungen.

## Funktionen

- Admin-Login-Demo mit Rollen: Admin, Helfer, Act
- Event-Übersicht mit Event-Steckbrief, Motto, Zielgruppe, Gästezahl und Ort
- Aktionskatalog mit typischen Event-Bausteinen wie Aufbau, Abbau, Musik, Flyer, Einladungen, Technik, Catering und GEMA
- Aktionskarten mit Kanban-Unteraufgaben, Status, Verantwortlichen, Deadline und Datei-Merkliste
- Teamverwaltung per E-Mail
- Budget-Übersicht für Einnahmen und Ausgaben
- Infrastruktur-Checkliste
- Runsheet, Act-Notizen, Wiki und Benachrichtigungsbereich
- JSON-Export
- Responsives Layout für Smartphone und Desktop
- Basis-Offline-Cache per Service Worker
- Footer mit Impressum, Datenschutz, Cookiehinweisen, GitHub-Link und automatisch aus `package.json` gelesener Rev.-Nummer
- Adminseite für SMTP-Konfiguration, Base URL, Benutzerverwaltung, Passwort-Reset, Deaktivierung, Löschen und Auditlog
- Echte App-Routen für Dashboard, Admin, Eventdetails und Rechtsseiten
- Validierte Formulare mit `react-hook-form` und `zod`
- Globale Suche, Event-Tabs, mobile Aufbauansicht, Leerzustände und Undo beim Benutzerlöschen

## Tech Stack

- React
- TypeScript
- Vite
- lucide-react Icons
- Browser LocalStorage für die erste Persistenzschicht

## Lokal starten

```bash
npm install
npm run dev
```

Danach ist die App typischerweise unter `http://localhost:5173` erreichbar.

## Produktion bauen

```bash
npm run build
npm run preview
```

Die statischen Produktionsdateien liegen danach in `dist/` und können auf jedem statischen Webserver ausgeliefert werden.

## Self-Hosting

### Automatische Installation auf Ubuntu 24.04

Das Installationsscript richtet auf einem Ubuntu-24.04-Server automatisch Node.js, Nginx, Build und Deployment ein.

Auf dem Server ausführen:

```bash
sudo apt-get update
sudo apt-get install -y git ca-certificates curl
git clone https://github.com/Schello805/EventStack.git /tmp/eventlotse
cd /tmp/eventlotse
sudo SERVER_NAME=deine-domain.de ./scripts/install-ubuntu-24.04.sh
```

Wenn du noch keine Domain gesetzt hast, kannst du `SERVER_NAME=_` verwenden:

```bash
sudo SERVER_NAME=_ ./scripts/install-ubuntu-24.04.sh
```

Standardpfade:

- Repository: `/opt/eventlotse`
- Webroot: `/var/www/eventlotse`
- Nginx-Site: `/etc/nginx/sites-available/eventlotse`

Optionale Variablen:

```bash
sudo \
  REPO_URL=https://github.com/Schello805/EventStack.git \
  APP_DIR=/opt/eventlotse \
  WEB_ROOT=/var/www/eventlotse \
  SERVER_NAME=deine-domain.de \
  ./scripts/install-ubuntu-24.04.sh
```

### Updates auf Ubuntu 24.04

Nach einer neuen Version auf GitHub:

```bash
cd /opt/eventlotse
sudo ./scripts/update-ubuntu-24.04.sh
```

Oder mit eigenen Pfaden:

```bash
sudo APP_DIR=/opt/eventlotse WEB_ROOT=/var/www/eventlotse ./scripts/update-ubuntu-24.04.sh
```

### HTTPS aktivieren

Nach erfolgreicher Installation kannst du HTTPS mit Certbot aktivieren:

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d deine-domain.de
```

### Manuelles Deployment

Eine einfache manuelle Variante ist Nginx, Caddy oder ein beliebiger Static-File-Host:

```bash
npm ci
npm run build
```

Dann `dist/` als Webroot konfigurieren. Für echten Mehrbenutzerbetrieb sollten als nächstes Backend, Datenbank, Authentifizierung, Mailversand und Backups ergänzt werden. Siehe [docs/SELF_HOSTING.md](docs/SELF_HOSTING.md).

## Lizenz

Dieses Projekt ist quelloffen einsehbar und frei für private, nicht kommerzielle Nutzung. Kommerzielle Nutzung ist nicht erlaubt. Die Lizenz ist `PolyForm-Noncommercial-1.0.0`; siehe [LICENSE](LICENSE).

Wichtig: Nicht-kommerzielle Einschränkungen entsprechen nicht der strengen OSI-Definition von Open Source. Das Projekt ist daher praktisch "source-available for non-commercial use".

## Dokumente

- [Self-Hosting](docs/SELF_HOSTING.md)
- [Roadmap](docs/ROADMAP.md)
- [Rechtliche Vorlagen](docs/LEGAL.md)
- [Security Policy](SECURITY.md)
- [Contributing](CONTRIBUTING.md)
