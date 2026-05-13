import './config.js'
import bcrypt from 'bcryptjs'
import compression from 'compression'
import cookieParser from 'cookie-parser'
import crypto from 'node:crypto'
import express from 'express'
import ExcelJS from 'exceljs'
import rateLimit from 'express-rate-limit'
import fs from 'node:fs'
import helmet from 'helmet'
import jwt from 'jsonwebtoken'
import multer from 'multer'
import path from 'node:path'
import PDFDocument from 'pdfkit'
import { canReadEventWithQuery, canWriteEventWithQuery, eventRoleWithQuery } from './authz.js'
import { config } from './config.js'
import { encryptSecret } from './crypto-box.js'
import { canHelperUpdateEvent } from './event-permissions.js'
import { syncNormalizedEvent } from './event-store.js'
import { pool, query, transaction } from './db.js'
import { createTransport, emailChangeMail, invitationMail, passwordResetMail, reminderMail, taskNotificationMail, testMail } from './mail.js'
import { dueTasksForEvent } from './reminders.js'
import { mergeAppSettings, normalizeEventTemplates, sanitizeAppSettings } from './settings.js'
import { hasExecutableSignature, isBlockedUpload } from './upload-security.js'

const app = express()
const distDir = path.join(config.rootDir, 'dist')
const packageJson = JSON.parse(fs.readFileSync(path.join(config.rootDir, 'package.json'), 'utf8'))
const authLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 12, standardHeaders: true, legacyHeaders: false })
const uploadLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 40, standardHeaders: true, legacyHeaders: false })
const csrfCookieName = 'eventlotse_csrf'
const upload = multer({
  dest: config.uploadDir,
  limits: { fileSize: 20 * 1024 * 1024 },
})

fs.mkdirSync(config.uploadDir, { recursive: true })

app.disable('x-powered-by')
app.set('trust proxy', 1)
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'same-site' },
}))
app.use(compression())
app.use(express.json({ limit: '2mb' }))
app.use(cookieParser())
app.use(rateLimit({ windowMs: 60_000, limit: 240 }))

function csrfCookieOptions() {
  return {
    httpOnly: false,
    path: '/',
    sameSite: 'lax',
    secure: config.cookieSecure,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  }
}

function createCsrfToken() {
  return crypto.randomBytes(32).toString('base64url')
}

function setCsrfCookie(response, token = createCsrfToken()) {
  response.cookie(csrfCookieName, token, csrfCookieOptions())
  return token
}

function clearCsrfCookie(response) {
  response.clearCookie(csrfCookieName, csrfCookieOptions())
}

function parseUrl(value) {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

function isAllowedOrigin(request, origin) {
  const originUrl = parseUrl(origin)
  if (!originUrl) return false

  const requestHost = String(request.get('host') || '').toLowerCase()
  const publicUrl = parseUrl(config.publicBaseUrl)
  const publicOrigin = publicUrl?.origin.toLowerCase()
  const publicHost = publicUrl?.host.toLowerCase()
  const originHost = originUrl.host.toLowerCase()

  return origin.toLowerCase() === publicOrigin || originHost === requestHost || originHost === publicHost
}

app.use((request, response, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return next()
  const origin = request.header('origin')
  if (!origin) return next()

  if (!isAllowedOrigin(request, origin)) {
    if (request.path === '/api/auth/login') {
      return response.status(403).json({ message: 'Anmeldung nicht möglich. Bitte E-Mail und Passwort prüfen oder die Seite neu laden.' })
    }
    return response.status(403).json({ message: 'Anfrage von dieser Herkunft ist nicht erlaubt.' })
  }
  next()
})

app.use((request, response, next) => {
  if (!request.cookies?.[csrfCookieName] && request.cookies?.eventlotse_token && request.method === 'GET' && request.path.startsWith('/api/')) {
    setCsrfCookie(response)
  }
  next()
})

app.use((request, response, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return next()
  if (!request.path.startsWith('/api/')) return next()
  if (request.header('authorization')) return next()
  if (request.path === '/api/auth/login' || request.path === '/api/auth/logout' || request.path.startsWith('/api/invites/') || request.path.startsWith('/api/email-change/')) return next()

  const cookieToken = request.cookies?.[csrfCookieName]
  const headerToken = request.header('x-eventlotse-csrf')
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return response.status(403).json({ message: 'Sicherheitsprüfung fehlgeschlagen. Bitte Seite neu laden und erneut versuchen.' })
  }
  next()
})

function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email, role: user.role }, config.jwtSecret, { expiresIn: '7d' })
}

function setAuthCookie(response, token) {
  response.cookie('eventlotse_token', token, {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: config.cookieSecure,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  })
}

function clearAuthCookie(response) {
  response.clearCookie('eventlotse_token', {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: config.cookieSecure,
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
    const result = await query('SELECT id, email, name, profile_note, role, active, last_login_at FROM users WHERE id = $1', [payload.sub])
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
  return canReadEventWithQuery(query, user, eventId)
}

async function canWriteEvent(user, eventId) {
  return canWriteEventWithQuery(query, user, eventId)
}

async function eventRole(user, eventId) {
  return eventRoleWithQuery(query, user, eventId)
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    profileNote: user.profile_note || '',
    role: user.role === 'Admin' ? 'Admin' : 'Helfer',
    active: user.active,
    lastLogin: user.last_login_at ? new Date(user.last_login_at).toLocaleString('de-DE') : 'noch nie',
  }
}

async function loadStoredSettings() {
  const result = await query("SELECT value FROM settings WHERE key = 'app'")
  return result.rows[0]?.value || {}
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

function cleanupUploadedFile(file = {}) {
  if (file.filename) fs.rm(path.join(config.uploadDir, file.filename), { force: true }, () => undefined)
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

function formatGermanDate(date) {
  if (!date) return 'Datum offen'
  const parsed = new Date(`${date}T12:00:00+01:00`)
  if (Number.isNaN(parsed.getTime())) return 'Datum offen'
  return new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin' }).format(parsed)
}

function csvCell(value) {
  return `"${String(value || '').replaceAll('"', '""')}"`
}

function taskRows(event) {
  return (event.actions || []).flatMap((action) =>
    (action.tasks || []).map((task) => ({ action, task })),
  )
}

function memberEmailById(event, memberId) {
  return (event.members || []).find((member) => member.id === memberId)?.email
}

function canRecycleEmailUser(user) {
  return user && user.role === 'Helfer' && Number(user.member_count || 0) === 0
}

function taskUrl(baseUrl, eventId, taskId) {
  return `${baseUrl}/events/${eventId}#task-${taskId}`
}

async function sendTaskChangeNotifications({ actor, beforeEvent, afterEvent }) {
  const beforeTasks = new Map(taskRows(beforeEvent).map(({ action, task }) => [task.id, { action, task }]))
  const transport = await createTransport()
  const settings = mergeAppSettings(await loadStoredSettings())
  const sentKeys = new Set()

  for (const { action, task } of taskRows(afterEvent)) {
    const before = beforeTasks.get(task.id)
    const ownerIds = task.ownerIds || []
    const previousOwnerIds = before?.task.ownerIds || []
    const newlyAssigned = ownerIds.filter((ownerId) => !previousOwnerIds.includes(ownerId))
    const reasons = []
    for (const ownerId of newlyAssigned) reasons.push({ ownerId, text: `Neue Aufgabe zugewiesen: ${task.title}` })
    if (before && before.task.status !== task.status) {
      for (const ownerId of ownerIds) reasons.push({ ownerId, text: `Status geändert: ${task.title}` })
    }
    if (before && JSON.stringify(before.task.files || []) !== JSON.stringify(task.files || [])) {
      for (const ownerId of ownerIds) reasons.push({ ownerId, text: `Anhang geändert: ${task.title}` })
    }

    for (const reason of reasons) {
      const to = memberEmailById(afterEvent, reason.ownerId)
      if (!to || to === actor?.email) continue
      const key = `${to}:${task.id}:${reason.text}`
      if (sentKeys.has(key)) continue
      sentKeys.add(key)
      await transport.sendMail(await taskNotificationMail({
        to,
        event: afterEvent,
        task,
        actionTitle: action.title,
        taskUrl: taskUrl(settings.baseUrl || config.publicBaseUrl, afterEvent.id, task.id),
        reason: reason.text,
      }))
    }
  }
  if (sentKeys.size) await audit(actor, `${sentKeys.size} Aufgaben-Benachrichtigung(en) für "${afterEvent.name}" wurden versendet.`)
}

async function runDueReminders(actor = null) {
  const today = new Date().toISOString().slice(0, 10)
  const already = await query("SELECT value FROM settings WHERE key = 'reminders:lastRun'")
  if (already.rows[0]?.value?.date === today) return []

  const eventsResult = await query('SELECT id, data FROM events ORDER BY updated_at DESC')
  const settings = mergeAppSettings(await loadStoredSettings())
  const sent = []
  const transport = await createTransport()

  for (const row of eventsResult.rows) {
    const event = eventFromRow(row)
    const dueTasks = dueTasksForEvent(event, today, settings.reminderLeadDays)
    if (!dueTasks.length) continue

    const recipients = [...new Set((event.members || []).map((member) => member.email))]
    for (const to of recipients) {
      await transport.sendMail(await reminderMail({ to, event, tasks: dueTasks.slice(0, 8) }))
      sent.push({ event: event.name, to, count: dueTasks.length })
    }
  }

  await query(
    `INSERT INTO settings (key, value, updated_at) VALUES ('reminders:lastRun', $1, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [JSON.stringify({ date: today, sent: sent.length })],
  )
  await audit(actor, `${sent.length} automatische Erinnerungsmails wurden verarbeitet.`)
  return sent
}

function scheduleReminderWorker() {
  if (config.nodeEnv === 'test') return
  const tick = async () => {
    const now = new Date()
    if (now.getHours() < config.reminderHour) return
    try {
      await runDueReminders(null)
    } catch (error) {
      console.error('[Eventlotse] Erinnerungslauf fehlgeschlagen.', error)
    }
  }
  setTimeout(tick, 30_000)
  return setInterval(tick, 15 * 60 * 1000)
}

app.get('/api/health', (_request, response) => {
  response.json({ ok: true, name: 'Eventlotse', version: packageJson.version })
})

app.get('/version.json', (_request, response) => {
  response.setHeader('Cache-Control', 'no-store, max-age=0')
  response.json({ name: 'Eventlotse', version: packageJson.version })
})

app.post('/api/auth/login', authLimiter, async (request, response) => {
  const { email, password } = request.body || {}
  const result = await query('SELECT * FROM users WHERE email = $1', [String(email || '').toLowerCase()])
  const user = result.rows[0]
  if (!user || !user.active || !(await bcrypt.compare(String(password || ''), user.password_hash))) {
    return response.status(401).json({ message: 'E-Mail oder Passwort stimmt nicht.' })
  }
  await query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id])
  await audit(user, 'Benutzer hat sich angemeldet.')
  setAuthCookie(response, signToken(user))
  setCsrfCookie(response)
  response.json({ user: publicUser(user) })
})

app.post('/api/auth/logout', async (request, response) => {
  let user = null
  const token = request.cookies.eventlotse_token
  if (token) {
    try {
      const payload = jwt.verify(token, config.jwtSecret)
      const result = await query('SELECT id, email, name, profile_note, role, active, last_login_at FROM users WHERE id = $1', [payload.sub])
      user = result.rows[0] || null
    } catch {
      user = null
    }
  }
  clearAuthCookie(response)
  clearCsrfCookie(response)
  if (user) await audit(user, 'Benutzer hat sich abgemeldet.')
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

app.post('/api/auth/profile', requireAuth, async (request, response) => {
  const name = String(request.body?.name || '').trim()
  const profileNote = String(request.body?.profileNote || '').trim()
  const result = await query(
    `UPDATE users SET
       name = COALESCE(NULLIF($1, ''), name),
       profile_note = $2,
       updated_at = now()
     WHERE id = $3
     RETURNING id, email, name, profile_note, role, active, last_login_at`,
    [name, profileNote, request.user.id],
  )
  const updatedUser = result.rows[0]
  const eventRows = await query(
    `SELECT e.id, e.data
     FROM events e
     JOIN event_members em ON em.event_id = e.id
     WHERE em.user_id = $1`,
    [request.user.id],
  )
  for (const row of eventRows.rows) {
    const event = eventFromRow(row)
    const members = (event.members || []).map((member) =>
      member.id === request.user.id || member.email === request.user.email
        ? { ...member, name: updatedUser.name, email: updatedUser.email, note: updatedUser.profile_note || '' }
        : member,
    )
    await query('UPDATE events SET data = $1, updated_at = now() WHERE id = $2', [JSON.stringify({ ...event, members }), row.id])
  }
  await audit(request.user, 'Profil wurde aktualisiert.')
  response.json({ user: publicUser(updatedUser) })
})

app.post('/api/auth/request-email-change', requireAuth, async (request, response) => {
  const newEmail = String(request.body?.email || '').toLowerCase().trim()
  if (!newEmail.includes('@') || newEmail.length > 180) {
    return response.status(400).json({ message: 'Bitte eine gültige neue E-Mail-Adresse eingeben.' })
  }
  if (newEmail === request.user.email) {
    return response.status(400).json({ message: 'Das ist bereits deine aktuelle E-Mail-Adresse.' })
  }
  const existing = await query(
    `SELECT u.id, u.role, COUNT(em.event_id) AS member_count
     FROM users u
     LEFT JOIN event_members em ON em.user_id = u.id
     WHERE u.email = $1
     GROUP BY u.id, u.role`,
    [newEmail],
  )
  if (existing.rowCount && !canRecycleEmailUser(existing.rows[0])) {
    return response.status(409).json({ message: 'Diese E-Mail-Adresse wird bereits verwendet.' })
  }
  const token = crypto.randomBytes(32).toString('base64url')
  await query(
    `INSERT INTO email_change_tokens (token, user_id, old_email, new_email, expires_at)
     VALUES ($1, $2, $3, $4, now() + interval '24 hours')`,
    [token, request.user.id, request.user.email, newEmail],
  )
  const settings = mergeAppSettings(await loadStoredSettings())
  const confirmUrl = `${settings.baseUrl}/email-aendern/${token}`
  const transport = await createTransport()
  await transport.sendMail(await emailChangeMail({
    to: newEmail,
    name: request.user.name,
    oldEmail: request.user.email,
    confirmUrl,
  }))
  await audit(request.user, `E-Mail-Änderung von "${request.user.email}" zu "${newEmail}" wurde angefordert.`)
  response.json({ ok: true })
})

app.post('/api/email-change/:token/confirm', async (request, response) => {
  const result = await query(
    `SELECT ect.token, ect.user_id, ect.old_email, ect.new_email, ect.expires_at, ect.used_at, u.name, u.profile_note, u.role, u.active
     FROM email_change_tokens ect
     JOIN users u ON u.id = ect.user_id
     WHERE ect.token = $1`,
    [request.params.token],
  )
  const change = result.rows[0]
  if (!change || change.used_at || new Date(change.expires_at) < new Date()) {
    return response.status(400).json({ message: 'Dieser Bestätigungslink ist ungültig oder abgelaufen.' })
  }
  if (!change.active) {
    return response.status(400).json({ message: 'Dieser Account ist deaktiviert.' })
  }
  const duplicate = await query(
    `SELECT u.id, u.role, COUNT(em.event_id) AS member_count
     FROM users u
     LEFT JOIN event_members em ON em.user_id = u.id
     WHERE u.email = $1 AND u.id <> $2
     GROUP BY u.id, u.role`,
    [change.new_email, change.user_id],
  )
  if (duplicate.rowCount && !canRecycleEmailUser(duplicate.rows[0])) {
    return response.status(409).json({ message: 'Diese E-Mail-Adresse wird inzwischen bereits verwendet.' })
  }

  const updatedUser = await transaction(async (client) => {
    if (duplicate.rowCount && canRecycleEmailUser(duplicate.rows[0])) {
      await client.query('DELETE FROM users WHERE id = $1', [duplicate.rows[0].id])
    }
    const userResult = await client.query(
      `UPDATE users
       SET email = $1, updated_at = now()
       WHERE id = $2
       RETURNING id, email, name, profile_note, role, active, last_login_at`,
      [change.new_email, change.user_id],
    )
    await client.query('UPDATE email_change_tokens SET used_at = now() WHERE token = $1', [change.token])
    await client.query('UPDATE email_change_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL AND token <> $2', [change.user_id, change.token])
    const eventRows = await client.query(
      `SELECT e.id, e.data
       FROM events e
       JOIN event_members em ON em.event_id = e.id
       WHERE em.user_id = $1`,
      [change.user_id],
    )
    for (const row of eventRows.rows) {
      const event = eventFromRow(row)
      const members = (event.members || []).map((member) =>
        member.id === change.user_id || member.email === change.old_email
          ? { ...member, email: change.new_email }
          : member,
      )
      await client.query('UPDATE events SET data = $1, updated_at = now() WHERE id = $2', [JSON.stringify({ ...event, members }), row.id])
    }
    return userResult.rows[0]
  })

  await audit(updatedUser, `E-Mail-Adresse wurde von "${change.old_email}" zu "${change.new_email}" geändert.`)
  setAuthCookie(response, signToken(updatedUser))
  setCsrfCookie(response)
  response.json({ user: publicUser(updatedUser) })
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
  setCsrfCookie(response)
  response.json({ ok: true, user })
})

app.get('/api/me', requireAuth, (request, response) => {
  response.json({ user: publicUser(request.user) })
})

app.get('/api/account/export', requireAuth, async (request, response) => {
  const eventsResult = request.user.role === 'Admin'
    ? await query('SELECT id, data, created_at, updated_at FROM events ORDER BY updated_at DESC')
    : await query(
      `SELECT e.id, e.data, e.created_at, e.updated_at FROM events e
       JOIN event_members em ON em.event_id = e.id
       WHERE em.user_id = $1
       ORDER BY e.updated_at DESC`,
      [request.user.id],
    )
  const filesResult = await query(
    `SELECT id, event_id, task_id, original_name, mime_type, size_bytes, created_at
     FROM files WHERE uploaded_by = $1 ORDER BY created_at DESC`,
    [request.user.id],
  )
  const auditResult = await query(
    'SELECT actor_email, action, created_at FROM audit_logs WHERE actor_id = $1 ORDER BY created_at DESC LIMIT 200',
    [request.user.id],
  )
  const payload = {
    exportedAt: new Date().toISOString(),
    user: publicUser(request.user),
    events: eventsResult.rows.map((row) => ({ id: row.id, createdAt: row.created_at, updatedAt: row.updated_at, data: row.data })),
    uploadedFiles: filesResult.rows,
    auditLog: auditResult.rows,
  }
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Content-Disposition', `attachment; filename="eventlotse-account-${sanitizeFilename(request.user.email)}.json"`)
  response.json(payload)
})

app.delete('/api/account', requireAuth, async (request, response) => {
  if (request.user.role === 'Admin') {
    return response.status(400).json({ message: 'Admin-Accounts können nicht selbst gelöscht werden. Lege zuerst einen zweiten Admin an und nutze die Server-Wartung.' })
  }

  const eventRows = await query(
    `SELECT e.id, e.data
     FROM events e
     JOIN event_members em ON em.event_id = e.id
     WHERE em.user_id = $1`,
    [request.user.id],
  )
  await transaction(async (client) => {
    for (const row of eventRows.rows) {
      const event = eventFromRow(row)
      const members = (event.members || []).filter((member) => member.id !== request.user.id && member.email !== request.user.email)
      await client.query('UPDATE events SET data = $1, updated_at = now() WHERE id = $2', [JSON.stringify({ ...event, members }), row.id])
    }
    await client.query('DELETE FROM users WHERE id = $1', [request.user.id])
  })
  await audit(null, `Benutzer "${request.user.email}" hat den eigenen Account gelöscht.`)
  clearAuthCookie(response)
  clearCsrfCookie(response)
  response.json({ ok: true })
})

app.get('/api/bootstrap', requireAuth, async (request, response) => {
  const appSettings = mergeAppSettings(await loadStoredSettings())
  const eventsResult = request.user.role === 'Admin'
    ? await query('SELECT id, data FROM events ORDER BY updated_at DESC')
    : await query(
      `SELECT e.id, e.data FROM events e
       JOIN event_members em ON em.event_id = e.id
       WHERE em.user_id = $1
       ORDER BY e.updated_at DESC`,
      [request.user.id],
    )
  const settings = request.user.role === 'Admin' ? appSettings : null
  const users = request.user.role === 'Admin'
    ? (await query('SELECT id, email, name, profile_note, role, active, last_login_at FROM users ORDER BY created_at DESC')).rows.map(publicUser)
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
    settings: settings ? sanitizeAppSettings(settings) : null,
    templates: appSettings.eventTemplates,
    permissions: {
      canCreateEvents: request.user.role === 'Admin' || appSettings.allowUserEventCreation,
    },
    users,
    auditLog,
  })
})

app.get('/api/templates', requireAuth, async (_request, response) => {
  const settings = mergeAppSettings(await loadStoredSettings())
  response.json({ templates: settings.eventTemplates })
})

app.post('/api/events', requireAuth, async (request, response) => {
  const settings = mergeAppSettings(await loadStoredSettings())
  if (request.user.role !== 'Admin' && !settings.allowUserEventCreation) {
    return response.status(403).json({ message: 'Nur Admins dürfen neue Events erstellen.' })
  }
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
    await syncNormalizedEvent(client, inserted.rows[0].id, event)
    return inserted.rows[0]
  })
  await audit(request.user, `Event "${event.name}" wurde angelegt.`)
  response.status(201).json({ event: eventFromRow(result) })
})

app.put('/api/events/:eventId', requireAuth, async (request, response) => {
  if (!(await canWriteEvent(request.user, request.params.eventId))) {
    return response.status(403).json({ message: 'Du darfst dieses Event nicht bearbeiten.' })
  }

  const currentResult = await query('SELECT id, data FROM events WHERE id = $1', [request.params.eventId])
  if (!currentResult.rowCount) return response.status(404).json({ message: 'Event nicht gefunden.' })
  const currentEvent = eventFromRow(currentResult.rows[0])
  const roleInEvent = await eventRole(request.user, request.params.eventId)
  if (roleInEvent !== 'Admin' && !canHelperUpdateEvent(currentEvent, request.body, request.user.id)) {
    return response.status(403).json({ message: 'Du darfst nur Aufgaben bearbeiten, für die du verantwortlich bist.' })
  }

  const result = await transaction(async (client) => {
    const updated = await client.query(
      'UPDATE events SET data = $1, updated_at = now() WHERE id = $2 RETURNING id, data',
      [JSON.stringify(request.body), request.params.eventId],
    )
    await syncNormalizedEvent(client, request.params.eventId, request.body)
    return updated
  })
  if (!result.rowCount) return response.status(404).json({ message: 'Event nicht gefunden.' })
  const updatedEvent = eventFromRow(result.rows[0])
  await audit(request.user, `Event "${request.body.name}" wurde aktualisiert.`)
  sendTaskChangeNotifications({ actor: request.user, beforeEvent: currentEvent, afterEvent: updatedEvent }).catch((error) => {
    console.error('[Eventlotse] Aufgaben-Benachrichtigung fehlgeschlagen:', error)
  })
  response.json({ event: updatedEvent })
})

app.delete('/api/events/:eventId', requireAuth, async (request, response) => {
  if ((await eventRole(request.user, request.params.eventId)) !== 'Admin') {
    return response.status(403).json({ message: 'Nur Event-Admins dürfen Events löschen.' })
  }
  const result = await query('DELETE FROM events WHERE id = $1 RETURNING data', [request.params.eventId])
  if (!result.rowCount) return response.status(404).json({ message: 'Event nicht gefunden.' })
  await audit(request.user, `Event "${result.rows[0].data?.name || request.params.eventId}" wurde gelöscht.`)
  response.json({ ok: true })
})

app.post('/api/events/:eventId/members', requireAuth, async (request, response) => {
  if ((await eventRole(request.user, request.params.eventId)) !== 'Admin') {
    return response.status(403).json({ message: 'Nur Event-Admins dürfen Teams verwalten.' })
  }
  const { email, name = '', note = '' } = request.body || {}
  const role = 'Helfer'
  const normalizedEmail = String(email || '').toLowerCase().trim()
  const tempPassword = crypto.randomBytes(9).toString('base64url')
  const passwordHash = await bcrypt.hash(tempPassword, 12)
  const inviteToken = crypto.randomBytes(32).toString('base64url')

  const eventResult = await query('SELECT id, data FROM events WHERE id = $1', [request.params.eventId])
  if (!eventResult.rowCount) return response.status(404).json({ message: 'Event nicht gefunden.' })
  const event = eventFromRow(eventResult.rows[0])

  const normalizedNote = String(note || '').trim()
  const userResult = await query(
    `INSERT INTO users (email, name, profile_note, password_hash, role, active)
     VALUES ($1, $2, $3, $4, $5, true)
     ON CONFLICT (email) DO UPDATE SET
       name = COALESCE(NULLIF(EXCLUDED.name, ''), users.name),
       profile_note = COALESCE(NULLIF(EXCLUDED.profile_note, ''), users.profile_note),
       active = true
     RETURNING id, email, name, profile_note, role, active, last_login_at`,
    [normalizedEmail, name || normalizedEmail.split('@')[0], normalizedNote, passwordHash, role],
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
      { id: user.id, name: user.name, email: user.email, role: 'Helfer', note: user.profile_note || normalizedNote },
    ],
  }
  await query('UPDATE events SET data = $1, updated_at = now() WHERE id = $2', [JSON.stringify(updatedEvent), request.params.eventId])

  const transport = await createTransport()
  const settings = mergeAppSettings(await loadStoredSettings())
  const inviteUrl = `${settings.baseUrl}/invite/${inviteToken}`
  await transport.sendMail(await invitationMail({ to: normalizedEmail, event: updatedEvent, inviter: request.user.email, inviteUrl }))
  await audit(request.user, `Einladung an "${normalizedEmail}" für "${event.name}" wurde versendet.`)
  response.status(201).json({ user: publicUser(user), event: updatedEvent, inviteUrl, initialPassword: config.nodeEnv === 'development' ? tempPassword : undefined })
})

app.delete('/api/events/:eventId/members/:userId', requireAuth, async (request, response) => {
  if ((await eventRole(request.user, request.params.eventId)) !== 'Admin') {
    return response.status(403).json({ message: 'Nur Event-Admins dürfen Teams verwalten.' })
  }
  const eventResult = await query('SELECT id, data FROM events WHERE id = $1', [request.params.eventId])
  if (!eventResult.rowCount) return response.status(404).json({ message: 'Event nicht gefunden.' })
  const event = eventFromRow(eventResult.rows[0])
  const member = (event.members || []).find((entry) => entry.id === request.params.userId)
  if (!member) return response.status(404).json({ message: 'Mitglied nicht gefunden.' })
  if (member.role === 'Admin') return response.status(400).json({ message: 'Event-Admins können nicht entfernt werden.' })
  const updatedEvent = { ...event, members: event.members.filter((entry) => entry.id !== request.params.userId) }
  await transaction(async (client) => {
    await client.query('DELETE FROM event_members WHERE event_id = $1 AND user_id = $2', [request.params.eventId, request.params.userId])
    await client.query('UPDATE events SET data = $1, updated_at = now() WHERE id = $2', [JSON.stringify(updatedEvent), request.params.eventId])
    const remaining = await client.query('SELECT 1 FROM event_members WHERE user_id = $1 LIMIT 1', [request.params.userId])
    if (!remaining.rowCount) {
      await client.query("DELETE FROM users WHERE id = $1 AND role = 'Helfer'", [request.params.userId])
    }
  })
  await audit(request.user, `Mitglied "${member.email}" wurde aus "${event.name}" entfernt.`)
  response.json({ event: updatedEvent })
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

app.get('/api/files/:fileId/preview', requireAuth, async (request, response) => {
  const result = await query('SELECT * FROM files WHERE id = $1', [request.params.fileId])
  const file = result.rows[0]
  if (!file || !(await canReadEvent(request.user, file.event_id))) {
    return response.status(404).json({ message: 'Datei nicht gefunden.' })
  }
  if (!String(file.mime_type || '').startsWith('image/')) {
    return response.status(415).json({ message: 'Für diese Datei gibt es keine Bildvorschau.' })
  }
  response.setHeader('Content-Type', file.mime_type)
  response.setHeader('Content-Disposition', `inline; filename="${sanitizeFilename(file.original_name)}"`)
  response.sendFile(path.join(config.uploadDir, file.stored_name))
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

app.post('/api/uploads', uploadLimiter, requireAuth, upload.single('file'), async (request, response) => {
  const { eventId, taskId } = request.body
  const file = request.file
  if (!file) return response.status(400).json({ message: 'Keine Datei empfangen.' })
  if (isBlockedUpload(file) || hasExecutableSignature(file)) {
    cleanupUploadedFile(file)
    return response.status(400).json({ message: 'Diese Dateiart ist aus Sicherheitsgründen gesperrt.' })
  }
  if (!(await canWriteEvent(request.user, eventId))) {
    cleanupUploadedFile(file)
    return response.status(403).json({ message: 'Du darfst für dieses Event keine Dateien hochladen.' })
  }
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

app.get('/api/events/:eventId/export/tasks.xlsx', requireAuth, async (request, response) => {
  if (!(await canReadEvent(request.user, request.params.eventId))) return response.status(403).send('Nicht erlaubt')
  const eventResult = await query('SELECT id, data FROM events WHERE id = $1', [request.params.eventId])
  if (!eventResult.rowCount) return response.status(404).send('Nicht gefunden')
  const event = eventFromRow(eventResult.rows[0])
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Eventlotse'
  workbook.created = new Date()

  const tasks = workbook.addWorksheet('Aufgaben')
  tasks.columns = [
    { header: 'Aktion', key: 'action', width: 24 },
    { header: 'Aufgabe', key: 'task', width: 34 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Fällig', key: 'due', width: 14 },
    { header: 'Notizen', key: 'notes', width: 44 },
  ]
  ;(event.actions || []).forEach((action) => {
    ;(action.tasks || []).forEach((task) => {
      tasks.addRow({ action: action.title, task: task.title, status: task.status, due: task.due, notes: task.notes })
    })
  })

  const runsheet = workbook.addWorksheet('Zeitplan')
  runsheet.columns = [
    { header: 'Uhrzeit', key: 'time', width: 12 },
    { header: 'Programmpunkt', key: 'title', width: 36 },
    { header: 'Verantwortlich', key: 'owner', width: 28 },
  ]
  ;(event.runsheet || []).forEach((item) => runsheet.addRow(item))

  const budget = workbook.addWorksheet('Budget')
  budget.columns = [
    { header: 'Bezeichnung', key: 'label', width: 34 },
    { header: 'Typ', key: 'type', width: 14 },
    { header: 'Betrag', key: 'amount', width: 14 },
  ]
  ;(event.budget || []).forEach((line) => budget.addRow(line))

  for (const sheet of workbook.worksheets) {
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } }
    sheet.views = [{ state: 'frozen', ySplit: 1 }]
    sheet.autoFilter = { from: 'A1', to: `${String.fromCharCode(64 + sheet.columnCount)}1` }
  }

  response.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  response.setHeader('Content-Disposition', `attachment; filename="${sanitizeFilename(event.name)}-eventlotse.xlsx"`)
  await workbook.xlsx.write(response)
  response.end()
})

app.get('/api/events/:eventId/export/runsheet.pdf', requireAuth, async (request, response) => {
  if (!(await canReadEvent(request.user, request.params.eventId))) return response.status(403).send('Nicht erlaubt')
  const eventResult = await query('SELECT id, data FROM events WHERE id = $1', [request.params.eventId])
  if (!eventResult.rowCount) return response.status(404).send('Nicht gefunden')
  const event = eventFromRow(eventResult.rows[0])
  const doc = new PDFDocument({ margin: 48, size: 'A4' })

  response.setHeader('Content-Type', 'application/pdf')
  response.setHeader('Content-Disposition', `attachment; filename="${sanitizeFilename(event.name)}-zeitplan.pdf"`)
  doc.pipe(response)
  doc.fontSize(22).text(event.name || 'Event', { continued: false })
  doc.moveDown(0.3)
  doc.fontSize(11).fillColor('#475569').text(`${formatGermanDate(event.date)} · ${event.location || 'Ort offen'}`)
  doc.moveDown(1)
  doc.fillColor('#0f172a').fontSize(16).text('Zeitplan')
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

app.post('/api/admin/users', requireAuth, requireAdmin, async (request, response) => {
  const { email, name = '', role = 'Helfer' } = request.body || {}
  const normalizedEmail = String(email || '').toLowerCase().trim()
  if (!normalizedEmail.includes('@')) return response.status(400).json({ message: 'Bitte eine gültige E-Mail-Adresse eingeben.' })
  const tempPassword = crypto.randomBytes(16).toString('base64url')
  const passwordHash = await bcrypt.hash(tempPassword, 12)
  const result = await query(
    `INSERT INTO users (email, name, password_hash, role, active)
     VALUES ($1, $2, $3, $4, true)
     ON CONFLICT (email) DO UPDATE
       SET name = COALESCE(NULLIF(EXCLUDED.name, ''), users.name),
           role = EXCLUDED.role,
           active = true,
           updated_at = now()
     RETURNING id, email, name, role, active, last_login_at`,
    [normalizedEmail, String(name || '').trim() || normalizedEmail.split('@')[0], passwordHash, role],
  )
  await audit(request.user, `Benutzer "${normalizedEmail}" wurde hinzugefügt.`)
  response.status(201).json({ user: publicUser(result.rows[0]) })
})

app.patch('/api/admin/users/:userId', requireAuth, requireAdmin, async (request, response) => {
  const { name, role, active } = request.body || {}
  const result = await query(
    `UPDATE users
     SET name = COALESCE($1, name),
         role = COALESCE($2, role),
         active = COALESCE($3, active),
         updated_at = now()
     WHERE id = $4
     RETURNING id, email, name, role, active, last_login_at`,
    [
      typeof name === 'string' ? name.trim() : null,
      ['Admin', 'Helfer'].includes(role) ? role : null,
      typeof active === 'boolean' ? active : null,
      request.params.userId,
    ],
  )
  if (!result.rowCount) return response.status(404).json({ message: 'Benutzer nicht gefunden.' })
  await audit(request.user, `Benutzer "${result.rows[0].email}" wurde aktualisiert.`)
  response.json({ user: publicUser(result.rows[0]) })
})

app.delete('/api/admin/users/:userId', requireAuth, requireAdmin, async (request, response) => {
  if (request.params.userId === request.user.id) {
    return response.status(400).json({ message: 'Du kannst deinen eigenen Admin-Benutzer nicht löschen.' })
  }
  const result = await query('DELETE FROM users WHERE id = $1 RETURNING email', [request.params.userId])
  if (!result.rowCount) return response.status(404).json({ message: 'Benutzer nicht gefunden.' })
  await audit(request.user, `Benutzer "${result.rows[0].email}" wurde gelöscht.`)
  response.json({ ok: true })
})

app.post('/api/admin/users/:userId/reset-password', requireAuth, requireAdmin, async (request, response) => {
  const userResult = await query('SELECT id, email, name FROM users WHERE id = $1', [request.params.userId])
  const user = userResult.rows[0]
  if (!user) return response.status(404).json({ message: 'Benutzer nicht gefunden.' })
  const inviteToken = crypto.randomBytes(32).toString('base64url')
  await query(
    `INSERT INTO invite_tokens (token, user_id, event_id, expires_at)
     VALUES ($1, $2, NULL, now() + interval '14 days')`,
    [inviteToken, user.id],
  )
  const settings = mergeAppSettings(await loadStoredSettings())
  const resetUrl = `${settings.baseUrl}/invite/${inviteToken}`
  const transport = await createTransport()
  await transport.sendMail(await passwordResetMail({ to: user.email, name: user.name, resetUrl, actor: request.user.email }))
  await audit(request.user, `Passwort-Reset für "${user.email}" wurde versendet.`)
  response.json({ ok: true })
})

app.put('/api/admin/settings', requireAuth, requireAdmin, async (request, response) => {
  const current = mergeAppSettings(await loadStoredSettings())
  const next = {
    ...current,
    ...request.body,
    smtpPass: request.body.smtpPass && request.body.smtpPass !== '********' ? encryptSecret(request.body.smtpPass) : current.smtpPass,
  }
  await query(
    `INSERT INTO settings (key, value, updated_at) VALUES ('app', $1, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [JSON.stringify(next)],
  )
  await audit(request.user, 'Systemeinstellungen wurden gespeichert.')
  response.json({ settings: sanitizeAppSettings(next) })
})

app.put('/api/admin/templates', requireAuth, requireAdmin, async (request, response) => {
  const current = mergeAppSettings(await loadStoredSettings())
  const templates = normalizeEventTemplates(request.body?.templates)
  const next = { ...current, eventTemplates: templates }
  await query(
    `INSERT INTO settings (key, value, updated_at) VALUES ('app', $1, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [JSON.stringify(next)],
  )
  await audit(request.user, 'Event-Vorlagen wurden gespeichert.')
  response.json({ templates })
})

app.post('/api/admin/reminders/run', requireAuth, requireAdmin, async (request, response) => {
  await query("DELETE FROM settings WHERE key = 'reminders:lastRun'")
  const sent = await runDueReminders(request.user)
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
const reminderTimer = scheduleReminderWorker()
const keepAlive = setInterval(() => undefined, 60 * 60 * 1000)

process.on('SIGTERM', async () => {
  if (reminderTimer) clearInterval(reminderTimer)
  clearInterval(keepAlive)
  server.close()
  await pool.end()
  process.exit(0)
})
