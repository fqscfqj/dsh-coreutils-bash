import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { accessSync, constants, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { bashCommandArgv, prependRuntimePath, resolveCoreutilsRuntime } from '../resolve.js'

const runtime = resolveCoreutilsRuntime()
assert.match(runtime.bashPath, /bash\.exe$/i)
assert.match(runtime.coreutilsBinPath, /coreutils[\\/]bin$/i)
assert.equal(bashCommandArgv(runtime, 'printf ok')[0], runtime.bashPath)
assert.equal(bashCommandArgv(runtime, 'printf ok').at(-1), 'printf ok')
assert.equal(prependRuntimePath(runtime, 'C:/Windows/System32').split(';')[0], runtime.coreutilsBinPath)
assert.equal(resolveCoreutilsRuntime({ bashPath: `'${runtime.bashPath}'`, coreutilsBinPath: `'${runtime.coreutilsBinPath}'` }).bashPath, runtime.bashPath)
assert.throws(() => resolveCoreutilsRuntime({ bashPath: runtime.bashPath, coreutilsBinPath: runtime.coreutilsBinPath, coreutilsPath: 'C:/missing/coreutils.exe' }), /coreutilsPath does not exist/)
assert.throws(() => resolveCoreutilsRuntime({ bashPath: 'C:/missing/bash.exe', coreutilsBinPath: 'C:/missing' }, { ...process.env, LANG: 'zh_CN.UTF-8' }), /Coreutils Bash 不可用/)

const script = String.raw`printf 'coreutils-bash-ok\n'; command -v ls; printf 'beta\nalpha\n' | sort; printf '%s\n' '中文'`
const env = { ...process.env, PATH: prependRuntimePath(runtime, process.env.PATH ?? process.env.Path ?? '') }
const result = spawnSync(runtime.bashPath, ['--noprofile', '--norc', '-c', script], { env, encoding: 'utf8', windowsHide: true })
assert.equal(result.status, 0, result.stderr)
assert.match(result.stdout, /coreutils-bash-ok/)
assert.match(result.stdout, /coreutils[\\/]bin[\\/]ls/)
assert.match(result.stdout, /alpha\nbeta/)
assert.match(result.stdout, /中文/)

const root = mkdtempSync(join(tmpdir(), 'coreutils-path-test-'))
try {
  const bash = join(root, 'bash.exe')
  writeFileSync(bash, '')
  const coreutils = join(root, 'custom-coreutils')
  const bin = join(coreutils, 'bin')
  mkdirSync(bin, { recursive: true })
  for (const name of ['ls.exe', 'cat.exe', 'grep.exe', 'find.exe']) writeFileSync(join(bin, name), '')
  const executable = join(coreutils, 'coreutils.exe')
  writeFileSync(executable, '')
  accessSync(executable, constants.R_OK)
  const custom = resolveCoreutilsRuntime({ bashPath: bash, coreutilsPath: executable })
  assert.equal(custom.coreutilsBinPath, bin)
  assert.equal(custom.coreutilsPath, executable)
  const fromDirectory = resolveCoreutilsRuntime({ bashPath: bash, coreutilsPath: coreutils })
  assert.equal(fromDirectory.coreutilsBinPath, bin)
  assert.equal(fromDirectory.coreutilsPath, executable)
} finally {
  rmSync(root, { recursive: true, force: true })
}

assert.throws(() => resolveCoreutilsRuntime({ bashPath: 'C:/missing/bash.exe', coreutilsBinPath: 'C:/missing' }), /Coreutils Bash is unavailable/)
console.log(JSON.stringify({ runtime, stdout: result.stdout }, null, 2))
