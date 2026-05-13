import bcrypt from 'bcryptjs'
import { config } from './config.js'
import { encryptSecret } from './crypto-box.js'
import { query } from './db.js'
import { syncNormalizedEvent } from './event-store.js'
import { appSettingsFromEnv, isPlaceholderValue, mergeAppSettings } from './settings.js'

const schema = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  name text NOT NULL DEFAULT '',
  profile_note text NOT NULL DEFAULT '',
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('Admin', 'Helfer')),
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
  role text NOT NULL CHECK (role IN ('Admin', 'Helfer')),
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

CREATE TABLE IF NOT EXISTS email_change_tokens (
  token text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  old_email text NOT NULL,
  new_email text NOT NULL,
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

CREATE TABLE IF NOT EXISTS event_actions (
  id text NOT NULL,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT '',
  owners jsonb NOT NULL DEFAULT '[]'::jsonb,
  deadline date,
  notes text NOT NULL DEFAULT '',
  position integer NOT NULL DEFAULT 0,
  PRIMARY KEY (event_id, id)
);

CREATE TABLE IF NOT EXISTS event_tasks (
  id text NOT NULL,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  action_id text NOT NULL,
  title text NOT NULL DEFAULT '',
  owner_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  due_date date,
  status text NOT NULL CHECK (status IN ('todo', 'doing', 'done')),
  notes text NOT NULL DEFAULT '',
  files jsonb NOT NULL DEFAULT '[]'::jsonb,
  comments jsonb NOT NULL DEFAULT '[]'::jsonb,
  position integer NOT NULL DEFAULT 0,
  PRIMARY KEY (event_id, id)
);

CREATE TABLE IF NOT EXISTS event_infrastructure (
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  label text NOT NULL,
  owner_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  position integer NOT NULL DEFAULT 0,
  PRIMARY KEY (event_id, label)
);

CREATE TABLE IF NOT EXISTS event_runsheet (
  id text NOT NULL,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  time text NOT NULL DEFAULT '',
  title text NOT NULL DEFAULT '',
  owner text NOT NULL DEFAULT '',
  position integer NOT NULL DEFAULT 0,
  PRIMARY KEY (event_id, id)
);

CREATE TABLE IF NOT EXISTS event_budget (
  id text NOT NULL,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT '',
  type text NOT NULL CHECK (type IN ('income', 'expense')),
  amount numeric NOT NULL DEFAULT 0,
  position integer NOT NULL DEFAULT 0,
  PRIMARY KEY (event_id, id)
);

CREATE INDEX IF NOT EXISTS idx_events_data_gin ON events USING gin (data);
CREATE INDEX IF NOT EXISTS idx_event_members_user ON event_members (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invite_tokens_user ON invite_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_email_change_tokens_user ON email_change_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_event_actions_event ON event_actions (event_id, position);
CREATE INDEX IF NOT EXISTS idx_event_tasks_event ON event_tasks (event_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_event_tasks_action ON event_tasks (action_id, position);
CREATE INDEX IF NOT EXISTS idx_event_infrastructure_event ON event_infrastructure (event_id, position);
CREATE INDEX IF NOT EXISTS idx_event_runsheet_event ON event_runsheet (event_id, position);
CREATE INDEX IF NOT EXISTS idx_event_budget_event ON event_budget (event_id, position);
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
  await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_note text NOT NULL DEFAULT ''")
  const events = await query('SELECT id, data FROM events')
  for (const event of events.rows) {
    await syncNormalizedEvent({ query }, event.id, event.data)
  }
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
