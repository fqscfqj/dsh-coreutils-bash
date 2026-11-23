import z from '@deepseek-ai/schemastery'
import { SandboxBashExecutor } from '@deepseek-ai/dsh-bash-sandbox'
import { bashCommandArgv, environmentPath, resolveCoreutilsRuntime, runtimeEnvironment } from './resolve.js'

export const name = 'coreutils-bash'
export const inject = ['subprocess', 'sandbox', 'sandboxPolicy']

export const Config = z.object({
  cwd: z.string().volatile(),
  timeoutMs: z.number().default(120000).volatile(),
  maxTimeoutMs: z.number().default(600000).volatile(),
  maxOutputBytes: z.number().default(64000).volatile(),
  maxSpillBytes: z.number().default(64 * 1024 * 1024).volatile(),
  graceMs: z.number().default(3000).volatile(),
  bashPath: z.string().required(false),
  coreutilsPath: z.string().required(false),
  coreutilsBinPath: z.string().required(false)
})

function configValue(value) {
  return value !== null && typeof value === 'object' && typeof value.get === 'function' ? value.get() : value
}

function pathConfig(config) {
  return {
    bashPath: configValue(config.bashPath),
    coreutilsPath: configValue(config.coreutilsPath),
    coreutilsBinPath: configValue(config.coreutilsBinPath)
  }
}

export class CoreutilsBashExecutor extends SandboxBashExecutor {
  static inject = inject
  static Config = Config

  runtime() {
    const config = pathConfig(this.config)
    const key = JSON.stringify({ ...config, PATH: environmentPath(), ProgramFiles: process.env.ProgramFiles, LOCALAPPDATA: process.env.LOCALAPPDATA, USERPROFILE: process.env.USERPROFILE })
    if (this.runtimeCache?.key !== key) {
      this.runtimeCache = { key, value: resolveCoreutilsRuntime(config) }
    }
    return this.runtimeCache.value
  }

  executeArgv(spec, argvOrPrepare, onStarted) {
    // Upstream supplies a direct argv only for full access; restricted calls
    // pass a preparation function that returns the sandbox provider's argv.
    if (typeof argvOrPrepare === 'function') {
      return super.executeArgv(spec, argvOrPrepare, onStarted)
    }
    if (spec.sandboxPolicy?.mode !== 'danger-full-access') {
      return Promise.reject(new Error('coreutils-bash: refusing direct argv without a full-access policy'))
    }
    return super.executeArgv(spec, bashCommandArgv(this.runtime(), spec.command), onStarted)
  }

  // These two methods are TypeScript-private in DSH 0.2.3-alpha.2, but the
  // shipped JavaScript dispatches them by name. Upstream still owns execution
  // lifecycle and sandbox result classification.
  spawnSpec(spec, argv, stdoutMaxBytes, signal) {
    const spawn = super.spawnSpec(spec, argv, stdoutMaxBytes, signal)
    return { ...spawn, env: runtimeEnvironment(this.runtime(), spawn.env) }
  }

  confine(command, policy, signal) {
    return this.ctx.sandbox.confine(bashCommandArgv(this.runtime(), command), policy, signal)
  }
}

export default CoreutilsBashExecutor
