import './config.js'
import bcrypt from 'bcryptjs'
import compression from 'compression'
import cookieParser from 'cookie-parser'
import crypto from 'node:crypto'
import express from 'express'
import rateLimit from 'express-rate-limit'
import fs from 'node:fs'
import helmet from 'helmet'
import jwt from 'jsonwebtoken'
import multer from 'multer'
import path from 'node:path'
import PDFDocument from 'pdfkit'
import { config } from './config.js'
import { pool, query, transaction } from './db.js'
import { createTransport, invitationMail, reminderMail, testMail } from './mail.js'

const app = express()
const distDir = path.join(config.rootDir, 'dist')
const upload = multer({
  dest: config.uploadDir,
  limits: { fileSize: 20 * 1024 * 1024 },
})

fs.mkdirSync(config.uploadDir, { recursive: true })

app.set('trust proxy', 1)
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'same-site' },
}))
app.use(compression())
app.use(express.json({ limit: '2mb' }))
app.use(cookieParser())
app.use(rateLimit({ windowMs: 60_000, limit: 240 }))

function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email, role: user.role }, config.jwtSecret, { expiresIn: '7d' })
}

function setAuthCookie(response, token) {
  response.cookie('eventlotse_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  })
}

async function audit(actor, action) {
  await query(
    'INSERT INTO audit_logs (actor_id, actor_email, action) VALUES ($1, $2, $3)',
    [actor?.id || null, actor?.email || 'System', action],
  )
}

async function requireAuth(request, response, next) {
  const token = request.cookies.eventlotse_token || request.header('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return response.status(401).json({ message: 'Bitte anmelden.' })

  try {
    const payload = jwt.verify(token, config.jwtSecret)
    const result = await query('SELECT id, email, name, role, active, last_login_at FROM users WHERE id = $1', [payload.sub])
    const user = result.rows[0]
    if (!user || !user.active) return response.status(401).json({ message: 'Benutzer ist nicht aktiv.' })
    request.user = user
    next()
  } catch {
    response.status(401).json({ message: 'Sitzung ist abgelaufen.' })
  }
}

function requireAdmin(request, response, next) {
  if (request.user.role !== 'Admin') return response.status(403).json({ message: 'Nur Admins dürfen das.' })
  next()
}

async function canReadEvent(user, eventId) {
  if (user.role === 'Admin') return true
  const result = await query('SELECT 1 FROM event_members WHERE event_id = $1 AND user_id = $2', [eventId, user.id])
  return Boolean(result.rowCount)
}

async function canWriteEvent(user, eventId) {
  if (user.role === 'Admin') return true
  const result = await query(
    `SELECT 1 FROM event_members
     WHERE event_id = $1 AND user_id = $2 AND role IN ('Admin', 'Helfer')`,
    [eventId, user.id],
  )
  return Boolean(result.rowCount)
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    active: user.active,
    lastLogin: user.last_login_at ? new Date(user.last_login_at).toLocaleString('de-DE') : 'noch nie',
  }
}

function eventFromRow(row) {
  return {
    ...row.data,
    id: row.id,
  }
}

function sanitizeFilename(name) {
  return String(name || 'datei').replace(/[\r\n"\\/]/g, '_')
}

function escapeIcs(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')
}

function yyyymmdd(date) {
  return String(date || '').replaceAll('-', '')
}

function formatIcsDate(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function csvCell(value) {
  return `"${String(value || '').replaceAll('"', '""')}"`
}

app.get('/api/health', (_request, response) => {
  response.json({ ok: true, name: 'Eventlotse', version: process.env.npm_package_version || '0.4.0' })
})

app.post('/api/auth/login', async (request, response) => {
  const { email, password } = request.body || {}
  const result = await query('SELECT * FROM users WHERE email = $1', [String(email || '').toLowerCase()])
  const user = result.rows[0]
  if (!user || !user.active || !(await bcrypt.compare(String(password || ''), user.password_hash))) {
    return response.status(401).json({ message: 'E-Mail oder Passwort stimmt nicht.' })
  }
  await query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id])
  await audit(user, 'Benutzer hat sich angemeldet.')
  setAuthCookie(response, signToken(user))
  response.json({ user: publicUser(user) })
})

app.post('/api/auth/logout', requireAuth, async (request, response) => {
  response.clearCookie('eventlotse_token')
  await audit(request.user, 'Benutzer hat sich abgemeldet.')
  response.json({ ok: true })
})

app.post('/api/auth/change-password', requireAuth, async (request, response) => {
  const { currentPassword, newPassword } = request.body || {}
  if (!newPassword || String(newPassword).length < 10) {
    return response.status(400).json({ message: 'Das neue Passwort muss mindestens 10 Zeichen lang sein.' })
  }
  const result = await query('SELECT password_hash FROM users WHERE id = $1', [request.user.id])
  const ok = await bcrypt.compare(String(currentPassword || ''), result.rows[0]?.password_hash || '')
  if (!ok) return response.status(400).json({ message: 'Das aktuelle Passwort stimmt nicht.' })
  const passwordHash = await bcrypt.hash(String(newPassword), 12)
  await query('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [passwordHash, request.user.id])
  await audit(request.user, 'Passwort wurde geändert.')
  response.json({ ok: true })
})

app.get('/api/invites/:token', async (request, response) => {
  const result = await query(
    `SELECT it.token, it.expires_at, it.used_at, u.email, u.name, e.id AS event_id, e.data
     FROM invite_tokens it
     JOIN users u ON u.id = it.user_id
     LEFT JOIN events e ON e.id = it.event_id
     WHERE it.token = $1`,
    [request.params.token],
  )
  const invite = result.rows[0]
  if (!invite || invite.used_at || new Date(invite.expires_at) < new Date()) {
    return response.status(404).json({ message: 'Einladung ist ungültig oder abgelaufen.' })
  }
  response.json({
    email: invite.email,
    name: invite.name,
    event: invite.event_id ? { id: invite.event_id, name: invite.data?.name, date: invite.data?.date, location: invite.data?.location } : null,
  })
})

app.post('/api/invites/:token/accept', async (request, response) => {
  const { password } = request.body || {}
  if (!password || String(password).length < 10) {
    return response.status(400).json({ message: 'Bitte ein Passwort mit mindestens 10 Zeichen setzen.' })
  }
  const result = await query(
    `SELECT it.token, it.user_id, it.event_id, it.expires_at, it.used_at, u.email, u.role
     FROM invite_tokens it
     JOIN users u ON u.id = it.user_id
     WHERE it.token = $1`,
    [request.params.token],
  )
  const invite = result.rows[0]
  if (!invite || invite.used_at || new Date(invite.expires_at) < new Date()) {
    return response.status(404).json({ message: 'Einladung ist ungültig oder abgelaufen.' })
  }
  const passwordHash = await bcrypt.hash(String(password), 12)
  await transaction(async (client) => {
    await client.query('UPDATE users SET password_hash = $1, active = true, updated_at = now() WHERE id = $2', [passwordHash, invite.user_id])
    await client.query('UPDATE invite_tokens SET used_at = now() WHERE token = $1', [invite.token])
  })
  const user = { id: invite.user_id, email: invite.email, role: invite.role }
  await audit(user, 'Einladung wurde angenommen und Passwort gesetzt.')
  setAuthCookie(response, signToken(user))
  response.json({ ok: true, user })
})

app.get('/api/me', requireAuth, (request, response) => {
  response.json({ user: publicUser(request.user) })
})

app.get('/api/bootstrap', requireAuth, async (request, response) => {
  const eventsResult = request.user.role === 'Admin'
    ? await query('SELECT id, data FROM events ORDER BY updated_at DESC')
    : await query(
      `SELECT e.id, e.data FROM events e
       JOIN event_members em ON em.event_id = e.id
       WHERE em.user_id = $1
       ORDER BY e.updated_at DESC`,
      [request.user.id],
    )
  const settings = request.user.role === 'Admin'
    ? (await query("SELECT value FROM settings WHERE key = 'app'")).rows[0]?.value
    : null
  const users = request.user.role === 'Admin'
    ? (await query('SELECT id, email, name, role, active, last_login_at FROM users ORDER BY created_at DESC')).rows.map(publicUser)
    : []
  const auditLog = request.user.role === 'Admin'
    ? (await query('SELECT actor_email, action, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 80')).rows.map((entry) => ({
      id: crypto.randomUUID(),
      at: new Date(entry.created_at).toLocaleString('de-DE'),
      actor: entry.actor_email,
      action: entry.action,
    }))
    : []

  response.json({
    events: eventsResult.rows.map(eventFromRow),
    settings: settings ? { ...settings, smtpPass: settings.smtpPass ? '********' : '' } : null,
    users,
    auditLog,
  })
})

app.post('/api/events', requireAuth, async (request, response) => {
  const event = request.body
  const result = await transaction(async (client) => {
    const inserted = await client.query(
      'INSERT INTO events (data, created_by) VALUES ($1, $2) RETURNING id, data',
      [JSON.stringify(event), request.user.id],
    )
    await client.query(
      'INSERT INTO event_members (event_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [inserted.rows[0].id, request.user.id, 'Admin'],
    )
    return inserted.rows[0]
  })
  await audit(request.user, `Event "${event.name}" wurde angelegt.`)
  response.status(201).json({ event: eventFromRow(result) })
})

app.put('/api/events/:eventId', requireAuth, async (request, response) => {
  if (!(await canWriteEvent(request.user, request.params.eventId))) {
    return response.status(403).json({ message: 'Du darfst dieses Event nicht bearbeiten.' })
  }
  const result = await query(
    'UPDATE events SET data = $1, updated_at = now() WHERE id = $2 RETURNING id, data',
    [JSON.stringify(request.body), request.params.eventId],
  )
  if (!result.rowCount) return response.status(404).json({ message: 'Event nicht gefunden.' })
  await audit(request.user, `Event "${request.body.name}" wurde aktualisiert.`)
  response.json({ event: eventFromRow(result.rows[0]) })
})

app.post('/api/events/:eventId/members', requireAuth, async (request, response) => {
  if (!(await canWriteEvent(request.user, request.params.eventId))) {
    return response.status(403).json({ message: 'Du darfst dieses Team nicht bearbeiten.' })
  }
  const { email, name = '', role = 'Helfer' } = request.body || {}
  const normalizedEmail = String(email || '').toLowerCase().trim()
  const tempPassword = crypto.randomBytes(9).toString('base64url')
  const passwordHash = await bcrypt.hash(tempPassword, 12)
  const inviteToken = crypto.randomBytes(32).toString('base64url')

  const eventResult = await query('SELECT id, data FROM events WHERE id = $1', [request.params.eventId])
  if (!eventResult.rowCount) return response.status(404).json({ message: 'Event nicht gefunden.' })
  const event = eventFromRow(eventResult.rows[0])

  const userResult = await query(
    `INSERT INTO users (email, name, password_hash, role, active)
     VALUES ($1, $2, $3, $4, true)
     ON CONFLICT (email) DO UPDATE SET name = COALESCE(NULLIF(EXCLUDED.name, ''), users.name), active = true
     RETURNING id, email, name, role, active, last_login_at`,
    [normalizedEmail, name || normalizedEmail.split('@')[0], passwordHash, role],
  )
  const user = userResult.rows[0]
  await query(
    'INSERT INTO event_members (event_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT (event_id, user_id) DO UPDATE SET role = EXCLUDED.role',
    [request.params.eventId, user.id, role],
  )
  await query(
    `INSERT INTO invite_tokens (token, user_id, event_id, expires_at)
     VALUES ($1, $2, $3, now() + interval '14 days')`,
    [inviteToken, user.id, request.params.eventId],
  )
  const updatedEvent = {
    ...event,
    members: [
      ...event.members.filter((member) => member.email !== normalizedEmail),
      { id: user.id, name: user.name, email: user.email, role },
    ],
  }
  await query('UPDATE events SET data = $1, updated_at = now() WHERE id = $2', [JSON.stringify(updatedEvent), request.params.eventId])

  const transport = await createTransport()
  const inviteUrl = `${config.publicBaseUrl}/invite/${inviteToken}`
  await transport.sendMail(await invitationMail({ to: normalizedEmail, event: updatedEvent, inviter: request.user.email, inviteUrl }))
  await audit(request.user, `Einladung an "${normalizedEmail}" für "${event.name}" wurde versendet.`)
  response.status(201).json({ user: publicUser(user), event: updatedEvent, inviteUrl, initialPassword: config.nodeEnv === 'development' ? tempPassword : undefined })
})

app.get('/api/events/:eventId/files', requireAuth, async (request, response) => {
  if (!(await canReadEvent(request.user, request.params.eventId))) {
    return response.status(403).json({ message: 'Du darfst diese Dateien nicht sehen.' })
  }
  const result = await query(
    `SELECT id, task_id, original_name, mime_type, size_bytes, created_at
     FROM files WHERE event_id = $1 ORDER BY created_at DESC`,
    [request.params.eventId],
  )
  response.json({ files: result.rows })
})

app.get('/api/files/:fileId/download', requireAuth, async (request, response) => {
  const result = await query('SELECT * FROM files WHERE id = $1', [request.params.fileId])
  const file = result.rows[0]
  if (!file || !(await canReadEvent(request.user, file.event_id))) {
    return response.status(404).json({ message: 'Datei nicht gefunden.' })
  }
  response.download(path.join(config.uploadDir, file.stored_name), sanitizeFilename(file.original_name))
})

app.delete('/api/files/:fileId', requireAuth, async (request, response) => {
  const result = await query('SELECT * FROM files WHERE id = $1', [request.params.fileId])
  const file = result.rows[0]
  if (!file || !(await canWriteEvent(request.user, file.event_id))) {
    return response.status(404).json({ message: 'Datei nicht gefunden.' })
  }
  await query('DELETE FROM files WHERE id = $1', [file.id])
  fs.rm(path.join(config.uploadDir, file.stored_name), { force: true }, () => undefined)
  await audit(request.user, `Datei "${file.original_name}" wurde gelöscht.`)
  response.json({ ok: true })
})

app.post('/api/uploads', requireAuth, upload.single('file'), async (request, response) => {
  const { eventId, taskId } = request.body
  if (!(await canWriteEvent(request.user, eventId))) {
    return response.status(403).json({ message: 'Du darfst für dieses Event keine Dateien hochladen.' })
  }
  const file = request.file
  const result = await query(
    `INSERT INTO files (event_id, task_id, original_name, stored_name, mime_type, size_bytes, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, original_name, mime_type, size_bytes, created_at`,
    [eventId, taskId || null, file.originalname, file.filename, file.mimetype, file.size, request.user.id],
  )
  await audit(request.user, `Datei "${file.originalname}" wurde hochgeladen.`)
  response.status(201).json({ file: result.rows[0] })
})

app.get('/api/events/:eventId/calendar.ics', requireAuth, async (request, response) => {
  if (!(await canReadEvent(request.user, request.params.eventId))) {
    return response.status(403).send('Nicht erlaubt')
  }
  const eventResult = await query('SELECT id, data FROM events WHERE id = $1', [request.params.eventId])
  if (!eventResult.rowCount) return response.status(404).send('Nicht gefunden')
  const event = eventFromRow(eventResult.rows[0])
  const date = yyyymmdd(event.date)
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Eventlotse//DE',
    'BEGIN:VEVENT',
    `UID:${event.id}@eventlotse`,
    `DTSTAMP:${formatIcsDate(new Date())}`,
    date ? `DTSTART;VALUE=DATE:${date}` : '',
    date ? `DTEND;VALUE=DATE:${date}` : '',
    `SUMMARY:${escapeIcs(event.name)}`,
    `LOCATION:${escapeIcs(event.location)}`,
    `DESCRIPTION:${escapeIcs(event.motto)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean)
  response.setHeader('Content-Type', 'text/calendar; charset=utf-8')
  response.setHeader('Content-Disposition', `attachment; filename="${sanitizeFilename(event.name)}.ics"`)
  response.send(lines.join('\r\n'))
})

app.get('/api/events/:eventId/export/tasks.csv', requireAuth, async (request, response) => {
  if (!(await canReadEvent(request.user, request.params.eventId))) return response.status(403).send('Nicht erlaubt')
  const eventResult = await query('SELECT id, data FROM events WHERE id = $1', [request.params.eventId])
  if (!eventResult.rowCount) return response.status(404).send('Nicht gefunden')
  const event = eventFromRow(eventResult.rows[0])
  const rows = [['Aktion', 'Aufgabe', 'Status', 'Fällig', 'Notizen']]
  event.actions?.forEach((action) => action.tasks?.forEach((task) => rows.push([action.title, task.title, task.status, task.due, task.notes])))
  response.setHeader('Content-Type', 'text/csv; charset=utf-8')
  response.setHeader('Content-Disposition', `attachment; filename="${sanitizeFilename(event.name)}-aufgaben.csv"`)
  response.send(rows.map((row) => row.map(csvCell).join(';')).join('\n'))
})

app.get('/api/events/:eventId/export/runsheet.pdf', requireAuth, async (request, response) => {
  if (!(await canReadEvent(request.user, request.params.eventId))) return response.status(403).send('Nicht erlaubt')
  const eventResult = await query('SELECT id, data FROM events WHERE id = $1', [request.params.eventId])
  if (!eventResult.rowCount) return response.status(404).send('Nicht gefunden')
  const event = eventFromRow(eventResult.rows[0])
  const doc = new PDFDocument({ margin: 48, size: 'A4' })

  response.setHeader('Content-Type', 'application/pdf')
  response.setHeader('Content-Disposition', `attachment; filename="${sanitizeFilename(event.name)}-ablauf.pdf"`)
  doc.pipe(response)
  doc.fontSize(22).text(event.name || 'Event', { continued: false })
  doc.moveDown(0.3)
  doc.fontSize(11).fillColor('#475569').text(`${event.date || 'Datum offen'} · ${event.location || 'Ort offen'}`)
  doc.moveDown(1)
  doc.fillColor('#0f172a').fontSize(16).text('Ablaufplan')
  doc.moveDown(0.5)

  if (!event.runsheet?.length) {
    doc.fontSize(11).fillColor('#475569').text('Noch keine Ablaufpunkte hinterlegt.')
  } else {
    event.runsheet.forEach((item) => {
      doc.fillColor('#0f766e').fontSize(12).text(item.time || '--:--', { continued: true, width: 70 })
      doc.fillColor('#0f172a').fontSize(12).text(`  ${item.title || 'Ablaufpunkt'}`, { continued: true })
      doc.fillColor('#475569').text(`  ${item.owner || 'offen'}`)
      doc.moveDown(0.4)
    })
  }

  doc.moveDown(1)
  doc.fillColor('#64748b').fontSize(9).text(`Erstellt mit Eventlotse am ${new Date().toLocaleString('de-DE')}`)
  doc.end()
})

app.post('/api/admin/test-mail', requireAuth, requireAdmin, async (request, response) => {
  try {
    const to = request.body?.to || request.user.email
    const info = await (await createTransport()).sendMail(await testMail(to))
    await audit(request.user, `Testmail an "${to}" wurde versendet.`)
    response.json({ ok: true, messageId: info.messageId, preview: info.message?.toString?.() })
  } catch (error) {
    const code = error?.code || error?.responseCode || 'SMTP_ERROR'
    const detail = error?.response || error?.message || 'Unbekannter SMTP-Fehler'
    response.status(502).json({
      message: `Testmail konnte nicht gesendet werden (${code}). Prüfe Host, Port, TLS, Benutzer und Passwort.`,
      detail,
    })
  }
})

app.put('/api/admin/settings', requireAuth, requireAdmin, async (request, response) => {
  const current = (await query("SELECT value FROM settings WHERE key = 'app'")).rows[0]?.value || {}
  const next = {
    ...current,
    ...request.body,
    smtpPass: request.body.smtpPass && request.body.smtpPass !== '********' ? request.body.smtpPass : current.smtpPass,
  }
  await query(
    `INSERT INTO settings (key, value, updated_at) VALUES ('app', $1, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [JSON.stringify(next)],
  )
  await audit(request.user, 'Systemeinstellungen wurden gespeichert.')
  response.json({ settings: { ...next, smtpPass: next.smtpPass ? '********' : '' } })
})

app.post('/api/admin/reminders/run', requireAuth, requireAdmin, async (request, response) => {
  const eventsResult = await query('SELECT id, data FROM events ORDER BY updated_at DESC')
  const today = new Date().toISOString().slice(0, 10)
  const sent = []
  const transport = await createTransport()

  for (const row of eventsResult.rows) {
    const event = eventFromRow(row)
    const dueTasks = (event.actions || [])
      .flatMap((action) => action.tasks || [])
      .filter((task) => task.status !== 'done' && task.due && task.due <= today)
    if (!dueTasks.length) continue

    const recipients = [...new Set((event.members || []).filter((member) => member.role !== 'Künstler').map((member) => member.email))]
    for (const to of recipients) {
      await transport.sendMail(await reminderMail({ to, event, tasks: dueTasks.slice(0, 8) }))
      sent.push({ event: event.name, to, count: dueTasks.length })
    }
  }

  await audit(request.user, `${sent.length} Erinnerungsmails wurden versendet.`)
  response.json({ sent })
})

app.use('/uploads', requireAuth, express.static(config.uploadDir))
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir))
  app.get('*splat', (_request, response) => response.sendFile(path.join(distDir, 'index.html')))
}

app.use((error, _request, response, _next) => {
  console.error(error)
  response.status(500).json({ message: 'Unerwarteter Serverfehler.' })
})

const server = app.listen(config.port, config.host, () => {
  console.log(`[Eventlotse] Server läuft auf http://${config.host}:${config.port}`)
})
server.on('error', (error) => {
  console.error('[Eventlotse] Server konnte nicht starten.', error)
  process.exit(1)
})
server.ref()
const keepAlive = setInterval(() => undefined, 60 * 60 * 1000)

process.on('SIGTERM', async () => {
  clearInterval(keepAlive)
  server.close()
  await pool.end()
  process.exit(0)
})
