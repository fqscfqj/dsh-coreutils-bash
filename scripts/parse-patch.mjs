import fs from 'node:fs'

const file = process.argv[2] ?? new URL('../cordis.patch.yml', import.meta.url)
const text = fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n')
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
if (!/^- id: pwsh-sandbox\n\s+name: '@deepseek-ai\/dsh-pwsh-sandbox'\n\s+disabled: false/m.test(text)) throw new Error('root pwsh sandbox must stay enabled for permission-presets')
const missing = requiredIds.filter(id => !new RegExp(`^\\s*- id: ${id}\\s*$`, 'm').test(text))
if (missing.length > 0) throw new Error(`missing patch entries: ${missing.join(', ')}`)
if ((text.match(/^\\s+section: \|/gm) ?? []).length !== 0) throw new Error('plan-mode text must use the shared YAML anchor')
if ((text.match(/section: &plan-mode-instructions \|/g) ?? []).length !== 1) throw new Error('patch must define one plan-mode anchor')
if ((text.match(/section: \*plan-mode-instructions/g) ?? []).length !== 2) throw new Error('patch must reuse plan-mode anchor twice')
if ((text.match(/name: '@deepseek-ai\/dsh-plugin-(?:manager|market)\/tools'\n\s+disabled: true/g) ?? []).length !== 0) throw new Error('profile plugin tools must use profileContext')

if ((text.match(/- id: coreutils-bash-sandbox\b/g) ?? []).length !== 3) throw new Error('coreutils bash executor must be declared once in standard, ptc, and cordis presets')
if ((text.match(/- id: coreutils-bash-shell\n\s+name: cordis:group\n\s+group: true\n\s+isolate:\n\s+shell: true/g) ?? []).length !== 3) throw new Error('coreutils bash executor must run in a preset-local shell isolation group')
if ((text.match(/- id: pwsh-shell\n\s+name: cordis:group\n\s+group: true\n\s+isolate:\n\s+shell: true/g) ?? []).length !== 3) throw new Error('pwsh executor must run in a separate preset-local shell isolation group')
if ((text.match(/- id: preset-pwsh-sandbox\b/g) ?? []).length !== 3) throw new Error('pwsh sandbox must be declared once in standard, ptc, and cordis presets')
if ((text.match(/- id: preset-tool-pwsh\b/g) ?? []).length !== 3) throw new Error('pwsh tool must be declared once in standard, ptc, and cordis presets')
if (/^- insert:\n\s+- id: coreutils-bash-sandbox\b/m.test(text)) throw new Error('coreutils bash executor must not be inserted in the root scope')
if ((text.match(/- id: tool-bash\n\s+name: '@deepseek-ai\/dsh-tool-bash'/g) ?? []).length !== 3) throw new Error('tool-bash must be declared in each executable preset')
if ((text.match(/- id: pwsh-terminal\n\s+name: '@deepseek-ai\/dsh-terminal-bash'\n\s+config:\n\s+backendType: coreutils-pwsh\n\s+shellDialect: pwsh/g) ?? []).length !== 1) throw new Error('minimal must register one native pwsh terminal backend')
if ((text.match(/- id: persistent-pwsh\n\s+name: '@deepseek-ai\/dsh-tool-pwsh-persistent'/g) ?? []).length !== 1) throw new Error('minimal must expose one persistent pwsh tool')

console.log(JSON.stringify({ requiredIds, bytes: Buffer.byteLength(text) }, null, 2))
