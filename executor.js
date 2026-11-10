import z from '@deepseek-ai/schemastery'
import { SandboxUnavailableError, classifyRunnerFailure, isRunnerSpawnFailure, matchesSignature } from '@deepseek-ai/dsh-sandbox'
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

  argv(spec) {
    const command = typeof spec === 'string' ? spec : spec.command
    return bashCommandArgv(this.runtime(), command)
  }

  spawnSpec(spec, argv, stdoutMaxBytes, signal) {
    const spawn = super.spawnSpec(spec, argv, stdoutMaxBytes, signal)
    const runtime = this.runtime()
    return {
      ...spawn,
      env: runtimeEnvironment(runtime, spawn.env),
    }
  }

  confine(command, policy, signal) {
    return this.ctx.sandbox.confine(this.argv(command), policy, signal)
  }

  async execute(spec) {
    const policy = spec.sandboxPolicy
    const { mode } = policy
    if (mode === 'danger-full-access') {
      return CoreutilsBashExecutor.decorateResult(
        await this.executeArgv(spec, this.argv(spec)),
        (result) => ({ ...result, sandbox: { mode, denied: false } })
      )
    }
    let confined
    const ex = await this.executeArgv(spec, async (signal) => {
      const prepared = await this.confine(spec.command, { ...policy, mode }, signal)
      signal.throwIfAborted()
      confined = prepared
      return prepared.argv
    }, (process) => {
      const facts = confined
      if (facts === undefined) return
      this.processFacts.set(process, {
        mode,
        enforcement: facts.enforcement,
        denialSignatures: facts.denialSignatures,
        runnerFailureRules: facts.runnerFailureRules,
        runnerProgram: facts.argv[0],
        workdir: spec.workdir
      })
    })
    return CoreutilsBashExecutor.decorateResult(ex, (result) => {
      if (confined === undefined) return { ...result, sandbox: { mode, denied: false } }
      const { enforcement, denialSignatures, runnerFailureRules } = confined
      const runnerFailure = classifyRunnerFailure(result.exitCode, result.stderr.text, runnerFailureRules)
      if (runnerFailure !== undefined) throw new SandboxUnavailableError(mode, runnerFailure.detail)
      return {
        ...result,
        sandbox: {
          mode,
          denied: matchesSignature(result.exitCode, result.stderr.text, denialSignatures),
          enforcement
        }
      }
    }, (error) => {
      if (spec.signal?.aborted === true) spec.signal.throwIfAborted()
      if (confined !== undefined && isRunnerSpawnFailure(error, confined.argv[0], spec.workdir)) {
        throw new SandboxUnavailableError(mode, String(error))
      }
      throw error
    })
  }

  onProcessDone(proc, stderr, providerRejected, providerError) {
    const facts = this.processFacts.get(proc)
    if (facts !== undefined) {
      this.processFacts.delete(proc)
      const runnerFailed = providerRejected
        ? isRunnerSpawnFailure(providerError, facts.runnerProgram, facts.workdir)
        : classifyRunnerFailure(proc.exitCode, stderr, facts.runnerFailureRules) !== undefined
      proc.sandbox = {
        mode: facts.mode,
        denied: !runnerFailed && matchesSignature(proc.exitCode, stderr, facts.denialSignatures),
        enforcement: facts.enforcement,
        ...(runnerFailed ? { runnerFailed } : {})
      }
    }
    super.onProcessDone(proc, stderr, providerRejected, providerError)
  }
}

export default CoreutilsBashExecutor
