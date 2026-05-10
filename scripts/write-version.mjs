import fs from 'node:fs'
import path from 'node:path'

const rootDir = path.resolve(import.meta.dirname, '..')
const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'))
const publicDir = path.join(rootDir, 'public')

fs.mkdirSync(publicDir, { recursive: true })
fs.writeFileSync(
  path.join(publicDir, 'version.json'),
  `${JSON.stringify({ name: 'Eventlotse', version: packageJson.version }, null, 2)}\n`,
)
