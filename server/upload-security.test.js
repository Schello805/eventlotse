import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { hasExecutableSignature, isBlockedUpload } from './upload-security.js'

function tempFile(bytes) {
  const filePath = path.join(os.tmpdir(), `eventlotse-upload-test-${crypto.randomUUID()}`)
  fs.writeFileSync(filePath, Buffer.from(bytes))
  return filePath
}

test('blockiert ausführbare Dateiendungen unabhängig von Groß-/Kleinschreibung', () => {
  assert.equal(isBlockedUpload({ originalname: 'setup.EXE' }), true)
  assert.equal(isBlockedUpload({ originalname: 'script.sh' }), true)
  assert.equal(isBlockedUpload({ originalname: 'rechnung.pdf' }), false)
})

test('erkennt ausführbare Signaturen auch bei harmloser Dateiendung', () => {
  const pe = tempFile([0x4d, 0x5a, 0x90, 0x00])
  const elf = tempFile([0x7f, 0x45, 0x4c, 0x46])
  const shell = tempFile([0x23, 0x21, 0x2f, 0x62])
  try {
    assert.equal(hasExecutableSignature({ path: pe }), true)
    assert.equal(hasExecutableSignature({ path: elf }), true)
    assert.equal(hasExecutableSignature({ path: shell }), true)
  } finally {
    fs.rmSync(pe, { force: true })
    fs.rmSync(elf, { force: true })
    fs.rmSync(shell, { force: true })
  }
})

test('erlaubt normale Dokumentinhalte', () => {
  const file = tempFile([0x25, 0x50, 0x44, 0x46])
  try {
    assert.equal(hasExecutableSignature({ path: file }), false)
  } finally {
    fs.rmSync(file, { force: true })
  }
})
