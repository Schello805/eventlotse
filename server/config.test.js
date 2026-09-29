import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import test from 'node:test'

test('Produktion startet nicht ohne DATABASE_URL', () => {
  const rootDir = path.resolve(import.meta.dirname, '..')
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', "import './server/config.js'"], {
    cwd: rootDir,
    env: { ...process.env, NODE_ENV: 'production', DATABASE_URL: '' },
    encoding: 'utf8',
  })

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /DATABASE_URL fehlt/)
})
