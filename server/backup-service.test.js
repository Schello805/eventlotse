import assert from 'node:assert/strict'
import test from 'node:test'
import { validBackupName } from './backup-service.js'

test('akzeptiert von Eventlotse erzeugte Backup-Namen', () => {
  assert.equal(validBackupName('eventlotse-20260929-031500.tar.gz'), true)
  assert.equal(validBackupName('eventlotse-20260929-031500-a1b2c3d4.tar.gz'), true)
})

test('blockiert Pfade und fremde Dateinamen', () => {
  assert.equal(validBackupName('../eventlotse-20260929-031500.tar.gz'), false)
  assert.equal(validBackupName('/tmp/eventlotse-20260929-031500.tar.gz'), false)
  assert.equal(validBackupName('eventlotse-latest.tar.gz'), false)
  assert.equal(validBackupName('eventlotse-20260929-031500.tar.gz.exe'), false)
})
