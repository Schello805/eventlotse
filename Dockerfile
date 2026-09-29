FROM node:20-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:20-bookworm-slim AS runtime

RUN apt-get update \
  && apt-get install -y --no-install-recommends bash ca-certificates gosu gzip postgresql-client tar \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=build /app /app
RUN chmod +x /app/docker-entrypoint.sh /app/scripts/backup.sh /app/scripts/restore.sh \
  && mkdir -p /app/data/uploads /app/data/backups \
  && chown -R node:node /app/data

ENV NODE_ENV=production \
  HOST=0.0.0.0 \
  PORT=3000 \
  UPLOAD_DIR=/app/data/uploads \
  BACKUP_DIR=/app/data/backups

EXPOSE 3000
VOLUME ["/app/data/uploads", "/app/data/backups"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

ENTRYPOINT ["/app/docker-entrypoint.sh"]
