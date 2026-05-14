import { config } from './config.js'
import { decryptSecret, encryptSecret } from './crypto-box.js'
import { defaultEventTemplates } from './default-templates.js'
import crypto from 'node:crypto'

const PLACEHOLDER_VALUES = new Set([
  '',
  'http://localhost:3000',
  'https://eventlotse.example.org',
  'smtp.example.org',
  'info@example.org',
  'noreply@example.org',
  'Eventlotse <info@example.org>',
  'Eventlotse <noreply@example.org>',
])

export function isPlaceholderValue(value) {
  return PLACEHOLDER_VALUES.has(String(value || '').trim())
}

export function appSettingsFromEnv() {
  return {
    baseUrl: config.publicBaseUrl,
    smtpHost: config.smtp.host,
    smtpPort: config.smtp.port,
    smtpUser: config.smtp.user,
    smtpPass: config.smtp.pass ? encryptSecret(config.smtp.pass) : '',
    smtpFrom: config.smtp.from,
    smtpTls: !config.smtp.secure,
    reminderLeadDays: Number(config.reminderLeadDays || 3),
    allowUserEventCreation: false,
    eventTemplates: defaultEventTemplates,
  }
}

export function normalizeEventTemplate(template = {}) {
  return {
    id: String(template.id || crypto.randomUUID?.() || `template-${Date.now()}`),
    name: String(template.name || 'Neue Vorlage').trim().slice(0, 80),
    description: String(template.description || '').trim().slice(0, 500),
    motto: String(template.motto || '').trim().slice(0, 120),
    targetGroup: String(template.targetGroup || '').trim().slice(0, 160),
    guests: Number.isFinite(Number(template.guests)) ? Math.max(0, Number(template.guests)) : 0,
    createInfrastructureTasks: template.createInfrastructureTasks !== false,
    actions: Array.isArray(template.actions)
      ? template.actions.slice(0, 40).map((action = {}) => ({
          title: String(action.title || 'Aufgabe').trim().slice(0, 100),
          category: String(action.category || 'Allgemein').trim().slice(0, 80),
          tasks: Array.isArray(action.tasks) ? action.tasks.slice(0, 40).map((task) => String(task).trim().slice(0, 140)).filter(Boolean) : [],
        }))
      : [],
    infrastructure: Array.isArray(template.infrastructure) ? template.infrastructure.slice(0, 80).map((item) => String(item).trim().slice(0, 80)).filter(Boolean) : [],
    runsheet: Array.isArray(template.runsheet)
      ? template.runsheet.slice(0, 80).map((item = {}) => ({
          time: String(item.time || '').trim().slice(0, 8),
          title: String(item.title || '').trim().slice(0, 120),
          owner: String(item.owner || '').trim().slice(0, 80),
        })).filter((item) => item.time || item.title || item.owner)
      : [],
    budget: Array.isArray(template.budget)
      ? template.budget.slice(0, 80).map((item = {}) => ({
          label: String(item.label || '').trim().slice(0, 120),
          type: item.type === 'income' ? 'income' : 'expense',
          amount: Number.isFinite(Number(item.amount)) ? Number(item.amount) : 0,
        })).filter((item) => item.label)
      : [],
    wiki: Array.isArray(template.wiki) ? template.wiki.slice(0, 80).map((item) => String(item).trim().slice(0, 300)).filter(Boolean) : [],
  }
}

export function normalizeEventTemplates(templates) {
  const source = Array.isArray(templates) && templates.length ? templates : defaultEventTemplates
  return source.map(normalizeEventTemplate)
}

export function mergeAppSettings(stored = {}) {
  const env = appSettingsFromEnv()
  return {
    baseUrl: !isPlaceholderValue(stored.baseUrl) ? stored.baseUrl : env.baseUrl,
    smtpHost: !isPlaceholderValue(stored.smtpHost) ? stored.smtpHost : env.smtpHost,
    smtpPort: Number(stored.smtpPort || env.smtpPort || 587),
    smtpUser: !isPlaceholderValue(stored.smtpUser) ? stored.smtpUser : env.smtpUser,
    smtpPass: stored.smtpPass && stored.smtpPass !== '********' ? stored.smtpPass : env.smtpPass,
    smtpFrom: !isPlaceholderValue(stored.smtpFrom) ? stored.smtpFrom : env.smtpFrom,
    smtpTls: typeof stored.smtpTls === 'boolean' ? stored.smtpTls : env.smtpTls,
    reminderLeadDays: Number.isFinite(Number(stored.reminderLeadDays)) ? Math.max(0, Math.min(30, Number(stored.reminderLeadDays))) : env.reminderLeadDays,
    allowUserEventCreation: stored.allowUserEventCreation === true,
    eventTemplates: normalizeEventTemplates(stored.eventTemplates || env.eventTemplates),
  }
}

export function sanitizeAppSettings(settings = {}) {
  return {
    ...settings,
    smtpPass: settings.smtpPass ? '********' : '',
  }
}

export function mailSettingsFromAppSettings(settings = {}) {
  const merged = mergeAppSettings(settings)
  return {
    host: merged.smtpHost,
    port: Number(merged.smtpPort || 587),
    user: merged.smtpUser,
    pass: merged.smtpPass && merged.smtpPass !== '********' ? decryptSecret(merged.smtpPass) : config.smtp.pass,
    from: merged.smtpFrom,
    secure: merged.smtpTls === false,
  }
}
