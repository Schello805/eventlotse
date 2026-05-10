import fs from 'node:fs'
import path from 'node:path'

export const blockedUploadExtensions = new Set([
  '.apk',
  '.app',
  '.bat',
  '.cmd',
  '.com',
  '.command',
  '.deb',
  '.dll',
  '.dmg',
  '.exe',
  '.jar',
  '.js',
  '.jse',
  '.msi',
  '.php',
  '.pkg',
  '.pl',
  '.ps1',
  '.py',
  '.rb',
  '.rpm',
  '.scr',
  '.sh',
  '.vb',
  '.vbs',
  '.wsf',
])

export function isBlockedUpload(file = {}) {
  return blockedUploadExtensions.has(path.extname(file.originalname || '').toLowerCase())
}

export function hasExecutableSignature(file = {}) {
  if (!file.path) return false
  const buffer = Buffer.alloc(8)
  const fd = fs.openSync(file.path, 'r')
  try {
    const bytes = fs.readSync(fd, buffer, 0, buffer.length, 0)
    const head = buffer.subarray(0, bytes)
    if (head.length >= 2 && head[0] === 0x4d && head[1] === 0x5a) return true
    if (head.length >= 2 && head[0] === 0x23 && head[1] === 0x21) return true
    if (head.length >= 4 && head[0] === 0x7f && head[1] === 0x45 && head[2] === 0x4c && head[3] === 0x46) return true
    const hex = head.subarray(0, 4).toString('hex')
    return ['feedface', 'feedfacf', 'cefaedfe', 'cffaedfe'].includes(hex)
  } finally {
    fs.closeSync(fd)
  }
}
