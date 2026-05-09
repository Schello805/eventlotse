import bcrypt from 'bcryptjs'
import '../server/config.js'
import { pool, query } from '../server/db.js'

const [emailArg, passwordArg] = process.argv.slice(2)
const email = String(emailArg || process.env.ADMIN_EMAIL || '').trim().toLowerCase()
const password = String(passwordArg || process.env.ADMIN_PASSWORD || '')

if (!email || !password || password.length < 10) {
  console.error('Nutzung: node scripts/reset-admin-password.mjs admin@example.de NeuesSicheresPasswort123!')
  console.error('Das Passwort muss mindestens 10 Zeichen lang sein.')
  process.exit(1)
}

try {
  const passwordHash = await bcrypt.hash(password, 12)
  const result = await query(
    `INSERT INTO users (email, name, password_hash, role, active)
     VALUES ($1, $2, $3, 'Admin', true)
     ON CONFLICT (email) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           role = 'Admin',
           active = true,
           updated_at = now()
     RETURNING email`,
    [email, 'Administrator', passwordHash],
  )
  await query(
    'INSERT INTO audit_logs (actor_email, action) VALUES ($1, $2)',
    ['System', `Admin-Passwort für "${result.rows[0].email}" wurde per Wartungsscript zurückgesetzt.`],
  )
  console.log(`[Eventlotse] Admin-Passwort für ${result.rows[0].email} wurde zurückgesetzt.`)
} finally {
  await pool.end()
}
