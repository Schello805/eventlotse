# Security Policy

## Supported Versions

Aktuell wird die neueste Version auf `main` gepflegt.

## Melden von Sicherheitsproblemen

Bitte keine Sicherheitslücken öffentlich als Issue posten. Melde sie direkt an den Projektbetreiber unter info@schellenberger.biz.

## Hinweise für Self-Hosting

- HTTPS aktivieren.
- Regelmäßige Backups mit `scripts/backup.sh` einrichten und Restore gelegentlich testen.
- Admin-Zugänge mit starken Passwörtern schützen.
- Datei-Uploads werden serverseitig nach Endung und ausführbarer Signatur geprüft. Trotzdem sollten Uploads nicht öffentlich ausgeliefert werden.
- E-Mail-Benachrichtigungen nur über vertrauenswürdige SMTP-Zugänge senden.
- `PUBLIC_BASE_URL` und `COOKIE_SECURE=true` bei HTTPS korrekt setzen.
- Das Auditlog regelmäßig prüfen, besonders nach Admin-Änderungen.

## Aktuelle Schutzmaßnahmen

- HttpOnly-Session-Cookie für Login.
- Separater CSRF-Token für angemeldete Schreibzugriffe.
- Origin-Prüfung für mutierende Requests.
- Rate-Limits für API, Login und Uploads.
- Event-spezifische Rechteprüfung für Helfer.
- Blockliste und Signaturprüfung gegen ausführbare Uploads.
- SMTP-Passwort wird verschlüsselt in den Einstellungen gespeichert.
