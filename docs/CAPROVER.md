# Installation mit CapRover

Eventlotse läuft in CapRover als eigene App. PostgreSQL wird als zweite CapRover-App betrieben. Dadurch bleiben Datenbank, Uploads und Backups auch bei Updates und Container-Neustarts erhalten.

## 1. PostgreSQL anlegen

1. In CapRover unter **Apps > One-Click Apps/Databases** PostgreSQL 15 installieren. Das passt zur PostgreSQL-Client-Version im Eventlotse-Container.
2. Als App-Namen zum Beispiel `eventlotse-db` verwenden.
3. Diese Werte setzen:
   - `POSTGRES_DB=eventlotse`
   - `POSTGRES_USER=eventlotse`
   - `POSTGRES_PASSWORD=<langes zufälliges Passwort>`
4. Sicherstellen, dass PostgreSQL `/var/lib/postgresql/data` persistent speichert. Die One-Click-App richtet das normalerweise bereits ein.

Der interne Datenbankhost lautet bei aktuellen CapRover-Versionen `eventlotse-db`. Bei älteren Installationen funktioniert auch der Alias `srv-captain--eventlotse-db`. PostgreSQL muss und sollte nicht öffentlich erreichbar sein.

## 2. Eventlotse-App anlegen

1. Eine neue CapRover-App mit dem Namen `eventlotse` erstellen.
2. **Enable HTTPS**, **Force HTTPS** und Websocket-Unterstützung aktivieren.
3. Container-Port `3000` eintragen.
4. Unter **App Configs > Persistent Directories** anlegen:

| Pfad im Container | Zweck |
| --- | --- |
| `/app/data/uploads` | Flyer, Rechnungen, Pläne und andere Anhänge |
| `/app/data/backups` | automatische und manuelle Backup-Archive |

PostgreSQL besitzt sein eigenes persistentes Verzeichnis in der Datenbank-App.

## 3. Umgebungsvariablen

In der Eventlotse-App mindestens diese Variablen setzen:

```env
NODE_ENV=production
HOST=0.0.0.0
PORT=3000
PUBLIC_BASE_URL=https://eventlotse.example.org
COOKIE_SECURE=true
DATABASE_URL=postgres://eventlotse:DEIN_PASSWORT@eventlotse-db:5432/eventlotse
JWT_SECRET=EIN_LANGER_ZUFAELLIGER_WERT
UPLOAD_DIR=/app/data/uploads
BACKUP_DIR=/app/data/backups
BACKUP_HOUR=3
BACKUP_RETENTION_DAYS=30
ADMIN_EMAIL=info@example.org
ADMIN_PASSWORD=BITTE_NACH_DEM_ERSTEN_LOGIN_AENDERN
```

SMTP kann anschließend bequem im Adminbereich gepflegt werden. Sonderzeichen im Datenbankpasswort müssen in `DATABASE_URL` URL-kodiert sein. Ein langes alphanumerisches Passwort vermeidet Fehler beim Eintragen.

## 4. Deployment

Das Repository enthält `captain-definition` und `Dockerfile`. In CapRover kann das GitHub-Repository über **Deployment > Method 3: Deploy from Github/Bitbucket/Gitlab** verbunden werden. Alternativ funktioniert die CapRover-CLI:

```bash
caprover deploy
```

Beim Containerstart werden Datenbankmigrationen automatisch ausgeführt. Danach startet der Node-Server auf Port 3000.

## Backup und Restore

Im Adminbereich unter **Backup & Wiederherstellung** kannst du:

- ein Backup sofort erstellen,
- tägliche Backups nutzen (standardmäßig nach 03:00 Uhr),
- Backups 30 Tage, 90 Tage oder eine eigene Anzahl Tage behalten,
- Archive herunterladen oder wieder hochladen,
- Datenbank und Uploads aus einem Archiv wiederherstellen.

Vor jedem Restore erstellt Eventlotse automatisch ein Sicherheitsbackup des aktuellen Stands. CapRover-Umgebungsvariablen werden nicht aus dem Archiv wiederhergestellt.

Für echten Schutz gegen einen vollständigen Serverausfall sollten Backup-Dateien regelmäßig heruntergeladen oder zusätzlich außerhalb des CapRover-Servers gesichert werden.

## Fehlerhilfe

### `ECONNREFUSED 127.0.0.1:5432`

Dieser Fehler bedeutet nicht, dass PostgreSQL nur noch starten muss. Eventlotse hat keine wirksame `DATABASE_URL` erhalten und versucht deshalb fälschlicherweise, eine Datenbank im eigenen Container zu erreichen.

1. In CapRover die **Eventlotse-App** öffnen.
2. Unter **App Configs > Environmental Variables** `DATABASE_URL` eintragen.
3. Als Host den Namen der PostgreSQL-App verwenden, zum Beispiel `eventlotse-db`, niemals `localhost` oder `127.0.0.1`.
4. **Save & Update** anklicken und Eventlotse neu starten.

Beispiel:

```env
DATABASE_URL=postgres://eventlotse:DEIN_PASSWORT@eventlotse-db:5432/eventlotse
```

Benutzer, Passwort und Datenbankname müssen exakt den Werten der PostgreSQL-App entsprechen. Sonderzeichen im Passwort müssen URL-kodiert werden.

### Es erscheint eine Nginx-Standardseite

Das Eventlotse-Image enthält kein Nginx. Eine Nginx-Standardseite stammt daher von einer anderen oder älteren CapRover-App. Weise die gewünschte Domain unter **HTTP Settings** der Eventlotse-App zu, stelle den Container-Port auf `3000` und entferne die Domain aus der bisherigen Nginx-App.
