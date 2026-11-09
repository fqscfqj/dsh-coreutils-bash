import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { bashCommandArgv, prependRuntimePath, resolveCoreutilsRuntime } from '../resolve.js'

const runtime = resolveCoreutilsRuntime()
assert.match(runtime.bashPath, /bash\.exe$/i)
assert.match(runtime.coreutilsBinPath, /coreutils[\\/]+bin$/i)
assert.equal(bashCommandArgv(runtime, 'printf ok')[0], runtime.bashPath)
assert.equal(bashCommandArgv(runtime, 'printf ok').at(-1), 'printf ok')
assert.equal(prependRuntimePath(runtime, 'C:/Windows/System32').split(';')[0], runtime.coreutilsBinPath)

const script = String.raw`printf 'coreutils-bash-ok\n'; command -v ls; printf 'beta\nalpha\n' | sort; printf '%s\n' '中文'`
const env = { ...process.env, PATH: prependRuntimePath(runtime, process.env.PATH ?? process.env.Path ?? '') }
const result = spawnSync(runtime.bashPath, ['--noprofile', '--norc', '-c', script], { env, encoding: 'utf8', windowsHide: true })
assert.equal(result.status, 0, result.stderr)
assert.match(result.stdout, /coreutils-bash-ok/)
assert.match(result.stdout, /coreutils[\\/]bin[\\/]ls/)
assert.match(result.stdout, /alpha\nbeta/)
assert.match(result.stdout, /中文/)

assert.throws(() => resolveCoreutilsRuntime({ bashPath: 'C:/missing/bash.exe', coreutilsBinPath: 'C:/missing' }), /Coreutils Bash is unavailable/)
console.log(JSON.stringify({ runtime, stdout: result.stdout }, null, 2))
