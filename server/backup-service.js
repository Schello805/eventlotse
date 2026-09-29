import { execFile } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { config } from './config.js'

const execFileAsync = promisify(execFile)
const backupNamePattern = /^eventlotse-\d{8}-\d{6}(?:-[a-f0-9]{8})?\.tar\.gz$/
let activeOperation = null

function scriptPath(name) {
  return path.join(config.rootDir, 'scripts', name)
}

function operationEnvironment(retentionDays) {
  return {
    ...process.env,
    APP_DIR: config.rootDir,
    ENV_FILE: process.env.ENV_FILE || path.join(config.rootDir, '.env'),
    BACKUP_DIR: config.backupDir,
    UPLOAD_DIR: config.uploadDir,
    DATABASE_URL: config.databaseUrl,
    KEEP_DAYS: String(retentionDays),
  }
}

async function exclusive(label, operation) {
  if (activeOperation) throw new Error(`Es läuft bereits: ${activeOperation}.`)
  activeOperation = label
  try {
    return await operation()
  } finally {
    activeOperation = null
  }
}

export function validBackupName(name) {
  return backupNamePattern.test(String(name || ''))
}

export function backupPath(name) {
  if (!validBackupName(name)) throw new Error('Ungültiger Backup-Name.')
  return path.join(config.backupDir, name)
}

export async function listBackups() {
  await fs.mkdir(config.backupDir, { recursive: true })
  const entries = await fs.readdir(config.backupDir, { withFileTypes: true })
  const backups = await Promise.all(entries
    .filter((entry) => entry.isFile() && validBackupName(entry.name))
    .map(async (entry) => {
      const stats = await fs.stat(path.join(config.backupDir, entry.name))
      return { name: entry.name, size: stats.size, createdAt: stats.mtime.toISOString() }
    }))
  return backups.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function createBackup(retentionDays = 30) {
  return exclusive('Backup wird erstellt', async () => {
    await fs.mkdir(config.backupDir, { recursive: true })
    await execFileAsync('bash', [scriptPath('backup.sh')], {
      cwd: config.rootDir,
      env: operationEnvironment(retentionDays),
      maxBuffer: 2 * 1024 * 1024,
    })
    const [latest] = await listBackups()
    if (!latest) throw new Error('Backup wurde erstellt, aber nicht gefunden.')
    return latest
  })
}

export async function deleteBackup(name) {
  await fs.unlink(backupPath(name))
}

export async function validateBackupFile(filePath) {
  const handle = await fs.open(filePath, 'r')
  try {
    const signature = Buffer.alloc(2)
    await handle.read(signature, 0, 2, 0)
    if (signature[0] !== 0x1f || signature[1] !== 0x8b) throw new Error('Die Datei ist kein gültiges gzip-Backup.')
  } finally {
    await handle.close()
  }
  const listing = await execFileAsync('tar', ['-tvzf', filePath], { maxBuffer: 4 * 1024 * 1024 })
  if (listing.stdout.split('\n').some((line) => line.startsWith('l') || line.startsWith('h'))) {
    throw new Error('Backup-Archive mit symbolischen oder harten Links sind nicht erlaubt.')
  }
}

export async function restoreBackup(name, retentionDays = 30) {
  return exclusive('Wiederherstellung läuft', async () => {
    const restoreFile = backupPath(name)
    await validateBackupFile(restoreFile)
    await execFileAsync('bash', [scriptPath('backup.sh')], {
      cwd: config.rootDir,
      env: operationEnvironment(retentionDays),
      maxBuffer: 2 * 1024 * 1024,
    })
    await execFileAsync('bash', [scriptPath('restore.sh'), restoreFile], {
      cwd: config.rootDir,
      env: { ...operationEnvironment(retentionDays), RESTORE_ENV: 'false' },
      maxBuffer: 8 * 1024 * 1024,
    })
  })
}

export async function storeUploadedBackup(file) {
  if (!file) throw new Error('Keine Backup-Datei hochgeladen.')
  await validateBackupFile(file.path)
  const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14)
  const name = `eventlotse-${stamp.slice(0, 8)}-${stamp.slice(8, 14)}-${crypto.randomBytes(4).toString('hex')}.tar.gz`
  const destination = backupPath(name)
  await fs.rename(file.path, destination)
  return name
}

export function backupOperation() {
  return activeOperation
}
