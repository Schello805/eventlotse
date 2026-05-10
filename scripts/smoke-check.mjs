import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const rootDir = path.resolve(import.meta.dirname, '..')
const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'))
const requiredFiles = [
  'dist/index.html',
  'dist/version.json',
  'scripts/install-ubuntu-24.04.sh',
  'scripts/update-ubuntu-24.04.sh',
  'scripts/backup.sh',
  'scripts/restore.sh',
  'docs/SELF_HOSTING.md',
  'SECURITY.md',
]

for (const relativePath of requiredFiles) {
  assert.ok(fs.existsSync(path.join(rootDir, relativePath)), `${relativePath} fehlt`)
}

const versionJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'dist/version.json'), 'utf8'))
assert.equal(versionJson.version, packageJson.version, 'dist/version.json passt nicht zur package.json')

const html = fs.readFileSync(path.join(rootDir, 'dist/index.html'), 'utf8')
assert.match(html, /<div id="root"><\/div>/, 'dist/index.html enthält keinen React-root')

console.log(`[Eventlotse] Smoke-Check erfolgreich für Version ${packageJson.version}.`)
