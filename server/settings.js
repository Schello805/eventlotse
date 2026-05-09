import { config } from './config.js'
import { decryptSecret, encryptSecret } from './crypto-box.js'

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
  }
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
