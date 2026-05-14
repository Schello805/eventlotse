# Eventlotse

Eventlotse ist eine selbst hostbare Web-App für private Veranstaltungen: Events anlegen, Mithelfer per E-Mail einladen, Arbeitsbereiche wie Aufbau, Abbau, Musik, Flyer oder Catering aktivieren und die Arbeit danach in Kanban-Unteraufgaben organisieren.

Repository: https://github.com/Schello805/eventlotse

## Status

Rev. `v0.4.41` enthält neben der Frontend-App jetzt auch eine Self-Hosting-Serverbasis mit PostgreSQL, Authentifizierung, feineren Rollenrechten, CSRF-Schutz, gehärteten Datei-Uploads, SMTP-Testmail, Einladungsmail-Vorlage, Auditlog, Event-Template-Store, Backup/Restore und robusterem Update-Script. Ohne Server läuft die App weiterhin lokal im Browser.

## Funktionen

- Login mit Admin- und Helfer-Rollen im Node/PostgreSQL-Backend
- Event-Übersicht mit Event-Steckbrief, Motto, Zielgruppe, Gästezahl und Ort
- kompakter Steckbrief-Kopf mit nahem Hilfe-Icon und platzsparendem Export-Dropdown
- Arbeitsbereich-Katalog mit typischen Event-Bausteinen wie Aufbau, Abbau, Musik, Flyer, Einladungen, Technik, Catering und GEMA
- Event-Templates für wiederkehrende Abläufe wie Hochzeit, Tanzevent oder Vereinsfest, inklusive JSON-Import und JSON-Export im Adminbereich
- eigene Infrastruktur-Ansicht mit automatisch erzeugten Aufgabenpaketen, editierbarer Zeitplan und SMART-orientierte Aufgabenfelder mit Bemerkungen
- Arbeitsbereich-Karten mit Kanban-Unteraufgaben, Drag-Leiste, Status, Verantwortlichen, Deadline und Datei-Merkliste
- normalisierte PostgreSQL-Tabellen für Aktionen, Aufgaben, Infrastruktur, Zeitplan und Budget als stabile Datenbasis
- feinere Bearbeitungsrechte: Helfer bearbeiten nur verantwortete Arbeitsbereiche oder eigene Unteraufgaben
- klare Aufgaben-Akkordeons, bei denen immer nur ein Arbeitsbereich geöffnet ist
- Setup-Checkliste für Event-Ersteller und reduzierte Helferansicht „Meine Aufgaben“
- SMART-orientiertes Anlegen neuer Unteraufgaben
- Aufgaben-Benachrichtigungen per E-Mail mit direktem Link zur Aufgabe
- eventbezogene Teamverwaltung per E-Mail, Name, Funktion/Kommentar und Entfernen aus dem Event
- Account-Datenexport im Profil und Selbstlöschung für Helfer
- hübsche HTML-Einladungsmails mit Eventinfos
- Budget-Übersicht für Einnahmen und Ausgaben
- Infrastruktur-Checkliste
- Zeitplan, Programm-/Booking-Notizen, Wiki und Benachrichtigungsbereich
- JSON-Export
- Responsives Layout für Smartphone und Desktop
- Basis-Offline-Cache per Service Worker
- Footer mit Impressum, Datenschutz, Cookiehinweisen, GitHub-Link und automatisch aus `package.json` gelesener Rev.-Nummer
- Adminseite für SMTP-Konfiguration, Base URL, Template Store und Auditlog
- SMTP-Testmail direkt aus der Adminseite inklusive SMTP-Passwort/App-Passwort
- Adminbereich nur nach Admin-Login sichtbar
- optionale Admin-Einstellung, ob alle angemeldeten Nutzer oder nur Admins neue Events erstellen dürfen
- eigenes Admin-Passwort direkt in der Adminseite ändern
- Wartungsscript zum Zurücksetzen des Admin-Passworts, falls der Login nicht mehr möglich ist
- sichere Einladungslinks mit Passwort setzen
- Dateiliste mit Download und Löschen pro Event
- iCal-Export, CSV-/XLSX-Aufgabenexport und PDF-Ablaufplan
- manueller und automatischer Erinnerungslauf für fällige Aufgaben
- konfigurierbarer Erinnerungsvorlauf für bald fällige Aufgaben
- SMTP-Passwort wird verschlüsselt gespeichert
- PostgreSQL-Migrationen, Upload-Endpunkt und Backup-/Restore-Scripte
- CSRF-Schutz, Rate-Limits und Upload-Validierung gegen ausführbare Dateien und Signaturen
- automatische Node-Tests für Rechteprüfung und Upload-Sicherheit
- Echte App-Routen für Dashboard, Admin, Eventdetails und Rechtsseiten
- Validierte Formulare mit `react-hook-form` und `zod`
- Globale Suche, Event-Tabs, mobile Aufbauansicht und hilfreiche Leerzustände

## Tech Stack

- React
- TypeScript
- Vite
- Node.js / Express
- PostgreSQL
- lucide-react Icons
- LocalStorage als Offline-/Fallback-Schicht, PostgreSQL im Self-Hosting-Betrieb

## Event-Templates

Admins pflegen globale Vorlagen im Adminbereich unter **Template Store**. Eine Vorlage kann Standard-Arbeitsbereiche, Unteraufgaben, Infrastruktur-Haken, Zeitplan-Punkte, Budgetposten und Wiki-Notizen enthalten. Beim Anlegen eines Events wählt ein Nutzer optional eine Vorlage aus; Eventlotse kopiert den Inhalt einmalig in das neue Event.

Wichtig: Eine Vorlage ist kein Live-Link. Änderungen im Event ändern die Vorlage nicht automatisch. Wenn ein fertiges Event später als neue Grundlage dienen soll, speichert ein Admin es im Event über **Als Vorlage speichern**. Dabei öffnet sich ein Assistent: Name, Infofeld und die zu übernehmenden Bereiche werden bewusst gewählt. Infrastruktur-Haken können einzeln ausgewählt werden; die dazugehörigen Aufgabenpakete können getrennt übernommen oder weggelassen werden. Teammitglieder, Anhänge, Kommentare, Fotos und persönliche Aufgaben-Verantwortliche bleiben ausgeschlossen.

Vorlagen lassen sich als JSON exportieren und wieder importieren. Dadurch kannst du dir eigene wiederkehrende Eventtypen bauen, zum Beispiel einen Tanzabend für deine Frau, und dieselbe Vorlage später erneut verwenden oder mit anderen Eventlotse-Installationen teilen.

## Lokal starten

```bash
npm install
npm run dev
```

Danach ist die App typischerweise unter `http://localhost:5173` erreichbar.

Backend lokal starten, wenn PostgreSQL erreichbar ist:

```bash
cp .env.example .env
npm run db:migrate
npm run dev:server
```

## Produktion bauen

```bash
npm run build
npm test
npm run test:smoke
npm run preview
```

Die statischen Produktionsdateien liegen danach in `dist/` und können auf jedem statischen Webserver ausgeliefert werden.

## Self-Hosting

### Automatische Installation auf Ubuntu 24.04

Das Installationsscript richtet auf einem Ubuntu-24.04-Server automatisch Node.js, PostgreSQL, Datenbank, Nginx, systemd-Service, Migrationen, Build und Upload-Verzeichnis ein.
Dabei werden initiale Admin-Logindaten erzeugt und am Ende der Installation angezeigt. Mit diesen Daten meldest du dich einmal an und änderst danach direkt in der Adminseite dein Passwort.

Auf dem Server ausführen:

```bash
sudo apt-get update
sudo apt-get install -y git ca-certificates curl
git clone https://github.com/Schello805/eventlotse.git /tmp/eventlotse
cd /tmp/eventlotse
sudo SERVER_NAME=deine-domain.de ./scripts/install-ubuntu-24.04.sh
```

Wenn du noch keine Domain gesetzt hast, kannst du `SERVER_NAME=_` verwenden:

```bash
sudo SERVER_NAME=_ ./scripts/install-ubuntu-24.04.sh
```

Standardpfade:

- Repository: `/opt/eventlotse`
- Konfiguration: `/etc/eventlotse/eventlotse.env`
- Uploads: `/var/lib/eventlotse/uploads`
- Nginx-Site: `/etc/nginx/sites-available/eventlotse`
- systemd-Service: `eventlotse`

Optionale Variablen:

```bash
sudo \
  REPO_URL=https://github.com/Schello805/eventlotse.git \
  APP_DIR=/opt/eventlotse \
  SERVER_NAME=deine-domain.de \
  ADMIN_EMAIL=info@schellenberger.biz \
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
sudo APP_DIR=/opt/eventlotse ./scripts/update-ubuntu-24.04.sh
```

Wenn Nginx/Links auf eine echte Domain zeigen sollen, gib die Domain beim Update mit. Das Script synchronisiert dann `PUBLIC_BASE_URL` in `/etc/eventlotse/eventlotse.env`; bei vorhandenem Let's-Encrypt-Zertifikat wird automatisch `https://...` und `COOKIE_SECURE=true` gesetzt.

```bash
sudo SERVER_NAME=eventlotse.schellenberger.biz ./scripts/update-ubuntu-24.04.sh
```

### Backups

```bash
sudo /opt/eventlotse/scripts/backup.sh
```

Restore auf einem vorbereiteten oder neuen Server:

```bash
sudo systemctl stop eventlotse
sudo /opt/eventlotse/scripts/restore.sh /var/backups/eventlotse/eventlotse-YYYYMMDD-HHMMSS.tar.gz
sudo systemctl status eventlotse
```

### Admin-Passwort zurücksetzen

Das Passwort in `/etc/eventlotse/eventlotse.env` ist nur das initiale Installationspasswort. Sobald du das Passwort in Eventlotse änderst, liegt das aktuelle Passwort als Hash in PostgreSQL und die `.env` wird nicht mehr geändert.

Falls du dich aussperrst, kannst du auf dem Server ein neues Admin-Passwort setzen:

```bash
sudo /opt/eventlotse/scripts/reset-admin-password.sh info@schellenberger.biz 'NeuesSicheresPasswort123!'
sudo systemctl restart eventlotse
```

### HTTPS aktivieren

Nach erfolgreicher Installation kannst du HTTPS mit Certbot aktivieren:

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d deine-domain.de
```

### Manuelles Deployment

Eine einfache manuelle Variante für Frontend-only ist Nginx, Caddy oder ein beliebiger Static-File-Host:

```bash
npm ci
npm run build
```

Dann `dist/` als Webroot konfigurieren. Für echten Mehrbenutzerbetrieb den Node-Server mit PostgreSQL verwenden. Siehe [docs/SELF_HOSTING.md](docs/SELF_HOSTING.md).

## Lizenz

Dieses Projekt ist quelloffen einsehbar und frei für private, nicht kommerzielle Nutzung. Kommerzielle Nutzung ist nicht erlaubt. Die Lizenz ist `PolyForm-Noncommercial-1.0.0`; siehe [LICENSE](LICENSE).

Wichtig: Nicht-kommerzielle Einschränkungen entsprechen nicht der strengen OSI-Definition von Open Source. Das Projekt ist daher praktisch "source-available for non-commercial use".

## Dokumente

- [Self-Hosting](docs/SELF_HOSTING.md)
- [Roadmap](docs/ROADMAP.md)
- [Rechtliche Vorlagen](docs/LEGAL.md)
- [Security Policy](SECURITY.md)
- [Contributing](CONTRIBUTING.md)



<img width="1730" height="781" alt="Bildschirmfoto 2026-05-08 um 18 57 12" src="https://github.com/user-attachments/assets/4d7d3949-c11a-40dd-ac89-8356622e3a5d" />
