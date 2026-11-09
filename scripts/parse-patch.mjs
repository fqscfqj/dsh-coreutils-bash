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
if ((text.match(/^\\s+section: \|/gm) ?? []).length !== 0) throw new Error('plan-mode text must use the shared YAML anchor')
if ((text.match(/section: &plan-mode-instructions \|/g) ?? []).length !== 1) throw new Error('patch must define one plan-mode anchor')
if ((text.match(/section: \*plan-mode-instructions/g) ?? []).length !== 2) throw new Error('patch must reuse plan-mode anchor twice')
if ((text.match(/name: '@deepseek-ai\/dsh-plugin-(?:manager|market)\/tools'\n\s+disabled: true/g) ?? []).length !== 0) throw new Error('profile plugin tools must use profileContext')

if ((text.match(/- id: coreutils-bash-sandbox\b/g) ?? []).length !== 3) throw new Error('coreutils bash executor must be declared once in standard, ptc, and cordis presets')
if ((text.match(/- id: coreutils-bash-shell\n\s+name: cordis:group\n\s+group: true\n\s+isolate:\n\s+shell: true/g) ?? []).length !== 3) throw new Error('coreutils bash executor must run in a preset-local shell isolation group')
if (/^- insert:\n\s+- id: coreutils-bash-sandbox\b/m.test(text)) throw new Error('coreutils bash executor must not be inserted in the root scope')
if ((text.match(/- id: tool-bash\n\s+name: '@deepseek-ai\/dsh-tool-bash'/g) ?? []).length !== 3) throw new Error('tool-bash must be declared in each executable preset')

console.log(JSON.stringify({ requiredIds, bytes: Buffer.byteLength(text) }, null, 2))
