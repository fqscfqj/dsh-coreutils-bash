import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { parseDocument } from 'yaml'

const upstream = '@deepseek-ai/dsh-web-app'
const version = '0.2.3-alpha.2'
// SHA-256 of canonical non-shell declarations from the official Web app.
// Pass --upstream <package-dir> to also compare directly against that release.
const reference = {
  standard: '90469e463b42c40d50088451a83e7c51c85c0f40a2cb89913391310a3b2dc2fa',
  ptc: '76474ac7dfc9409524877894485d8b306704f7daa17e451946db32c6c55bd8ee',
  minimal: 'b943f3086734c6d67472df1f1d1070849785f9a0b42024d4580f7a3eae486594',
  cordis: 'f1b0d9d4ebff2c180e5c4a4a59c5c0a72b205ce4e48139c0d1d952d494e16fc2',
}

function readPatch(file) {
  const doc = parseDocument(readFileSync(file, 'utf8'), {
    customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: expr }],
  })
  const problems = [...doc.errors, ...doc.warnings]
  assert.equal(problems.length, 0, `${file}: ${problems.map(error => error.message).join('\n')}`)
  const value = doc.toJS()
  assert.ok(Array.isArray(value), `${file} must contain a YAML entry list`)
  return value
}

function expr(source) {
  // Represent the Loader tag as data. Never evaluate expressions in the checker.
  return { __jsExpr: source }
}

function nonShell(row) {
  const result = structuredClone(row)
  const shellIds = ['tool-bash', 'tool-pwsh', 'pwsh-shell', 'coreutils-bash-shell']
  result.config.plugins = result.config.plugins.filter(plugin => !shellIds.includes(plugin.id))
  if (row.config.id === 'minimal') {
    const group = result.config.plugins.find(plugin => plugin.id === 'persistent-shell')
    const terminalIds = ['terminal-bash', 'terminal-pwsh', 'coreutils-terminal', 'pwsh-terminal', 'persistent-bash', 'persistent-pwsh']
    group.config = group.config.filter(plugin => !terminalIds.includes(plugin.id))
  }
  return result
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
}

function digest(value) {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')
}

const patchPath = new URL('../cordis.patch.yml', import.meta.url)
const { positionals: [file = patchPath, ...extra], values: { upstream: upstreamDir } } = parseArgs({
  options: { upstream: { type: 'string' } },
  allowPositionals: true,
})
assert.equal(extra.length, 0,
  'Usage: node scripts/parse-patch.mjs [patch-file] [--upstream <web-app package directory>]')
if (upstreamDir !== undefined) {
  const manifest = JSON.parse(readFileSync(join(upstreamDir, 'package.json'), 'utf8'))
  assert.equal(`${manifest.name}@${manifest.version}`, `${upstream}@${version}`)
}

const rows = readPatch(file)
assert.deepEqual(rows.map(row => row.id), [
  'pwsh-sandbox', 'optional-persistent-terminals', ...Object.keys(reference).map(id => `preset-${id}`),
])
assert.deepEqual(rows[0], { id: 'pwsh-sandbox', name: '@deepseek-ai/dsh-pwsh-sandbox', disabled: false },
  'The root PowerShell executor serves permission-presets')
const terminalConfig = { backendType: 'coreutils-bash', shellDialect: 'bash' }
assert.deepEqual(rows[1], {
  id: 'optional-persistent-terminals',
  insert: [{ id: 'coreutils-terminal-global', name: 'dsh-coreutils-bash/terminal', config: { ...terminalConfig, timeoutMs: 30000 } }],
})

const executorConfig = {
  cwd: expr('process.cwd()'), timeoutMs: 120000, maxTimeoutMs: 600000,
  maxOutputBytes: 64000, maxSpillBytes: 67108864, graceMs: 3000,
}
for (const row of rows.slice(2)) {
  const id = row.id.slice('preset-'.length)
  const plugins = row.config.plugins
  if (id === 'minimal') {
    const group = plugins.find(plugin => plugin.id === 'persistent-shell')
    assert.deepEqual(group.config.map(plugin => plugin.id),
      ['pty', 'coreutils-terminal', 'pwsh-terminal', 'persistent-bash', 'persistent-pwsh'])
    const [, bash, pwsh, bashTool, pwshTool] = group.config
    assert.deepEqual(bash, {
      id: 'coreutils-terminal', name: 'dsh-coreutils-bash/terminal', config: { ...terminalConfig, timeoutMs: 300000 },
    })
    assert.deepEqual(pwsh, {
      id: 'pwsh-terminal', name: '@deepseek-ai/dsh-terminal-bash',
      config: { backendType: 'coreutils-pwsh', shellDialect: 'pwsh', timeoutMs: 300000 },
    })
    for (const [label, tool] of [['bash', bashTool], ['pwsh', pwshTool]]) {
      const { description, ...config } = tool.config
      assert.ok(typeof description === 'string' && description.length > 0)
      assert.deepEqual({ ...tool, config }, {
        id: `persistent-${label}`, name: `@deepseek-ai/dsh-tool-${label}-persistent`,
        config: { backendType: `coreutils-${label}`, timeoutMs: 300000 },
      })
    }
  } else {
    const shell = plugins.filter(plugin => ['tool-bash', 'tool-pwsh', 'pwsh-shell', 'coreutils-bash-shell'].includes(plugin.id))
    assert.deepEqual(shell, [
      { id: 'tool-pwsh', name: '@deepseek-ai/dsh-tool-pwsh', disabled: true },
      {
        id: 'pwsh-shell', name: 'cordis:group', group: true, isolate: { shell: true },
        config: [
          { id: 'preset-pwsh-sandbox', name: '@deepseek-ai/dsh-pwsh-sandbox', config: executorConfig },
          { id: 'preset-tool-pwsh', name: '@deepseek-ai/dsh-tool-pwsh' },
        ],
      },
      {
        id: 'coreutils-bash-shell', name: 'cordis:group', group: true, isolate: { shell: true },
        config: [
          { id: 'coreutils-bash-sandbox', name: 'dsh-coreutils-bash/executor', config: executorConfig },
          { id: 'tool-bash', name: '@deepseek-ai/dsh-tool-bash' },
        ],
      },
    ], `${id}: both shell executors must stay in separate preset-local realms`)
  }

  const actual = nonShell(row)
  if (upstreamDir) {
    const upstreamPatch = readPatch(join(upstreamDir, 'presets', `${id}.patch.yml`))
    const official = nonShell(upstreamPatch[0].insert[0])
    assert.deepEqual(actual, official, `${id}: non-shell preset settings differ from ${upstream}@${version}`)
    assert.equal(digest(official), reference[id], `${id}: upstream baseline digest is stale`)
  } else {
    assert.equal(digest(actual), reference[id],
      `${id}: non-shell settings drifted from ${upstream}@${version}; use --upstream for a detailed diff`)
  }
}

console.log(`Checked shell configuration and all four presets against ${upstream}@${version}${upstreamDir ? ' (direct comparison)' : ' (pinned baseline)'}.`)
