import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

const candidates = [
  'pwsh.exe',
  join(process.env.ProgramFiles ?? 'C:\\Program Files', 'PowerShell', '7', 'pwsh.exe'),
  join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'WindowsApps', 'pwsh.exe')
]
const executable = candidates.find((candidate) => {
  const probe = spawnSync(candidate, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', '$PSVersionTable.PSVersion.ToString()'], { encoding: 'utf8', windowsHide: true })
  return probe.error === undefined && probe.status === 0
})

if (executable === undefined) {
  console.log('pwsh.exe is unavailable; native PowerShell smoke test skipped')
  process.exit(0)
}

const command = "$items = 1, 2, 3 | ForEach-Object { [pscustomobject]@{ Value = $_; Double = $_ * 2 } }; ($items | Where-Object Double -gt 2 | ForEach-Object { $_.Value }) -join ','"
const result = spawnSync(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8', windowsHide: true })
assert.equal(result.status, 0, result.stderr)
assert.equal(result.stdout.trim(), '2,3')
console.log(JSON.stringify({ executable, stdout: result.stdout.trim() }, null, 2))
