import 'dotenv/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const publicBaseUrl = process.env.PUBLIC_BASE_URL || 'http://localhost:3000'
const cookieSecure = process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : publicBaseUrl.startsWith('https://')

export const config = {
  rootDir,
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || '127.0.0.1',
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || 'postgres://eventlotse:eventlotse@localhost:5432/eventlotse',
  jwtSecret: process.env.JWT_SECRET || 'eventlotse-dev-secret-change-me',
  cookieSecure,
  uploadDir: process.env.UPLOAD_DIR || path.join(rootDir, 'uploads'),
  publicBaseUrl,
  adminEmail: process.env.ADMIN_EMAIL || 'admin@example.de',
  adminPassword: process.env.ADMIN_PASSWORD || 'Eventlotse-Start123!',
  reminderHour: Number(process.env.REMINDER_HOUR || 8),
  reminderLeadDays: Number(process.env.REMINDER_LEAD_DAYS || 3),
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'Eventlotse <noreply@example.org>',
    secure: process.env.SMTP_SECURE === 'true',
  },
}
