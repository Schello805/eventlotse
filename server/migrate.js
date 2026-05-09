import bcrypt from 'bcryptjs'
import { config } from './config.js'
import { encryptSecret } from './crypto-box.js'
import { query } from './db.js'
import { appSettingsFromEnv, isPlaceholderValue, mergeAppSettings } from './settings.js'

const schema = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  name text NOT NULL DEFAULT '',
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('Admin', 'Helfer', 'Künstler')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data jsonb NOT NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS event_members (
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('Admin', 'Helfer', 'Künstler')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);

CREATE TABLE IF NOT EXISTS files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  task_id text,
  original_name text NOT NULL,
  stored_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes integer NOT NULL,
  uploaded_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invite_tokens (
  token text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id uuid REFERENCES events(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_email text NOT NULL,
  action text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_events_data_gin ON events USING gin (data);
CREATE INDEX IF NOT EXISTS idx_event_members_user ON event_members (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invite_tokens_user ON invite_tokens (user_id);
`

async function ensureAdmin() {
  const existing = await query('SELECT id FROM users WHERE role = $1 LIMIT 1', ['Admin'])
  if (existing.rowCount) return

  const passwordHash = await bcrypt.hash(config.adminPassword, 12)
  await query(
    `INSERT INTO users (email, name, password_hash, role, active)
     VALUES ($1, $2, $3, 'Admin', true)`,
    [config.adminEmail.toLowerCase(), 'Administrator', passwordHash],
  )
  console.log(`[Eventlotse] Admin angelegt: ${config.adminEmail}`)
}

async function main() {
  await query(schema)
  await ensureAdmin()
  await query(
    `INSERT INTO settings (key, value)
     VALUES ('app', $1)
     ON CONFLICT (key) DO NOTHING`,
    [JSON.stringify(appSettingsFromEnv())],
  )
  const settings = await query("SELECT value FROM settings WHERE key = 'app'")
  let value = settings.rows[0]?.value
  if (value?.smtpPass && !String(value.smtpPass).startsWith('enc:v1:') && value.smtpPass !== '********') {
    await query(
      "UPDATE settings SET value = jsonb_set(value, '{smtpPass}', to_jsonb($1::text), true), updated_at = now() WHERE key = 'app'",
      [encryptSecret(value.smtpPass)],
    )
    value = { ...value, smtpPass: encryptSecret(value.smtpPass) }
    console.log('[Eventlotse] SMTP-Passwort wurde verschlüsselt.')
  }
  const envSettings = appSettingsFromEnv()
  const shouldRefreshFromEnv = ['baseUrl', 'smtpHost', 'smtpUser', 'smtpFrom'].some(
    (key) => isPlaceholderValue(value?.[key]) && !isPlaceholderValue(envSettings[key]),
  )
  if (shouldRefreshFromEnv || (!value?.smtpPass && envSettings.smtpPass)) {
    await query(
      "UPDATE settings SET value = $1, updated_at = now() WHERE key = 'app'",
      [JSON.stringify(mergeAppSettings(value || {}))],
    )
    console.log('[Eventlotse] Einstellungen wurden mit .env-Werten ergänzt.')
  }
  console.log('[Eventlotse] Datenbank ist aktuell.')
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
