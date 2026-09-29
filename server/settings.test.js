import assert from 'node:assert/strict'
import test from 'node:test'
import { mergeAppSettings } from './settings.js'

test('übernimmt eine frei gewählte Backup-Aufbewahrung', () => {
  assert.equal(mergeAppSettings({ backupRetentionDays: 90 }).backupRetentionDays, 90)
  assert.equal(mergeAppSettings({ backupRetentionDays: 45 }).backupRetentionDays, 45)
})

test('begrenzt die Backup-Aufbewahrung auf einen sicheren Bereich', () => {
  assert.equal(mergeAppSettings({ backupRetentionDays: 0 }).backupRetentionDays, 1)
  assert.equal(mergeAppSettings({ backupRetentionDays: 9999 }).backupRetentionDays, 3650)
})
