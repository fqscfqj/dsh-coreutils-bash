import fs from 'node:fs'

const file = new URL('../cordis.patch.yml', import.meta.url)
const text = fs.readFileSync(file, 'utf8')
const requiredIds = [
  'pwsh-sandbox',
  'coreutils-bash-sandbox',
  'coreutils-terminal-global',
  'preset-standard',
  'preset-ptc',
  'preset-minimal',
  'preset-cordis'
]

if (!/^\s*-\s+id:\s+pwsh-sandbox\b/m.test(text)) throw new Error('patch must be a YAML entry list')
const missing = requiredIds.filter(id => !new RegExp(`^\\s*- id: ${id}\\s*$`, 'm').test(text))
if (missing.length > 0) throw new Error(`missing patch entries: ${missing.join(', ')}`)

console.log(JSON.stringify({ requiredIds, bytes: Buffer.byteLength(text) }, null, 2))
