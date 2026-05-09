import crypto from 'node:crypto'
import { config } from './config.js'

const prefix = 'enc:v1:'

function key() {
  return crypto.createHash('sha256').update(config.jwtSecret).digest()
}

export function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(prefix)
}

export function encryptSecret(value) {
  if (!value || isEncrypted(value) || value === '********') return value || ''
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv)
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${prefix}${iv.toString('base64url')}:${tag.toString('base64url')}:${encrypted.toString('base64url')}`
}

export function decryptSecret(value) {
  if (!value || !isEncrypted(value)) return value || ''
  const [, ivRaw, tagRaw, encryptedRaw] = value.slice(prefix.length).match(/^([^:]+):([^:]+):(.+)$/) || []
  if (!ivRaw || !tagRaw || !encryptedRaw) return ''
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(ivRaw, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'))
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}
