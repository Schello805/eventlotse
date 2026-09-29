#!/usr/bin/env sh
set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  cat >&2 <<'MESSAGE'
[Eventlotse] DATABASE_URL fehlt.
Lege in CapRover unter "App Configs > Environmental Variables" zum Beispiel Folgendes an:
DATABASE_URL=postgres://eventlotse:DEIN_PASSWORT@eventlotse-db:5432/eventlotse
Der Host muss dem Namen deiner PostgreSQL-App entsprechen. Danach "Save & Update" ausführen.
MESSAGE
  exit 1
fi

if ! database_host="$(node -e "try { process.stdout.write(new URL(process.env.DATABASE_URL).hostname) } catch { process.exit(1) }")"; then
  echo '[Eventlotse] DATABASE_URL ist ungültig. Sonderzeichen im Passwort müssen URL-kodiert werden.' >&2
  exit 1
fi

case "$database_host" in
  localhost|127.0.0.1|::1)
    cat >&2 <<'MESSAGE'
[Eventlotse] DATABASE_URL zeigt auf localhost. Das funktioniert in CapRover nicht,
weil PostgreSQL in einem separaten Container läuft. Verwende als Host den Namen
der PostgreSQL-App, zum Beispiel eventlotse-db oder srv-captain--eventlotse-db.
MESSAGE
    exit 1
    ;;
esac

mkdir -p "${UPLOAD_DIR:-/app/data/uploads}" "${BACKUP_DIR:-/app/data/backups}"
chown -R node:node "${UPLOAD_DIR:-/app/data/uploads}" "${BACKUP_DIR:-/app/data/backups}"

echo "[Eventlotse] Verwende PostgreSQL-Host: ${database_host}"

attempt=1
until gosu node npm run db:migrate; do
  if [ "$attempt" -ge 30 ]; then
    echo "Datenbankmigration nach 30 Versuchen fehlgeschlagen." >&2
    exit 1
  fi
  echo "PostgreSQL unter ${database_host} ist noch nicht bereit. Neuer Versuch in 2 Sekunden (${attempt}/30)."
  attempt=$((attempt + 1))
  sleep 2
done

exec gosu node npm run server
