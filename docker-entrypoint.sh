#!/usr/bin/env sh
set -eu

mkdir -p "${UPLOAD_DIR:-/app/data/uploads}" "${BACKUP_DIR:-/app/data/backups}"
chown -R node:node "${UPLOAD_DIR:-/app/data/uploads}" "${BACKUP_DIR:-/app/data/backups}"

attempt=1
until gosu node npm run db:migrate; do
  if [ "$attempt" -ge 30 ]; then
    echo "Datenbankmigration nach 30 Versuchen fehlgeschlagen." >&2
    exit 1
  fi
  echo "PostgreSQL ist noch nicht bereit. Neuer Versuch in 2 Sekunden (${attempt}/30)."
  attempt=$((attempt + 1))
  sleep 2
done

exec gosu node npm run server
