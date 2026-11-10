import { spawnSync } from 'node:child_process'
import { resolveCoreutilsRuntime, runtimeEnvironment } from '../resolve.js'

const runtime = resolveCoreutilsRuntime({
  bashPath: process.env.DSH_BASH_PATH,
  coreutilsBinPath: process.env.DSH_COREUTILS_BIN
})
const env = runtimeEnvironment(runtime, process.env)
const script = String.raw`printf 'bash-ok\n'; command -v ls; ls --version; printf 'beta\nalpha\n' | sort; printf '%s\n' '*.txt'; command -v sed; printf '%s\n' "$PATH"; grep --version; find --version`
const result = spawnSync(runtime.bashPath, ['--noprofile', '--norc', '-c', script], { env, encoding: 'utf8', timeout: 15000, windowsHide: true })
console.log(JSON.stringify({ runtime, result }, null, 2))
process.exitCode = result.status ?? 1
