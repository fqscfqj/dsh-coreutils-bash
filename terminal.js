import z from '@deepseek-ai/schemastery'
import { BashTerminalBackend } from '@deepseek-ai/dsh-terminal-bash'
import { prependRuntimePath, resolveCoreutilsRuntime, terminalShellArgs } from './resolve.js'

export const name = 'coreutils-terminal'
export const inject = ['terminals', 'sandboxPolicy', 'subprocess', 'workingDirectory']

export const Config = z.object({
  backendType: z.string().default('coreutils-bash'),
  shellDialect: z.string().default('bash'),
  shellPath: z.string().required(false),
  shellArgs: z.array(z.string()).required(false),
  bashPath: z.string().required(false),
  coreutilsPath: z.string().required(false),
  coreutilsBinPath: z.string().required(false),
  rows: z.number().default(40),
  cols: z.number().default(160),
  scrollbackLines: z.number().default(10000),
  scrollbackMaxBytes: z.number().default(4 * 1024 * 1024),
  maxReadBytes: z.number().default(256 * 1024),
  pollIntervalMs: z.number().default(50),
  exactProbeAfterMs: z.number().default(150),
  idleSilenceMs: z.number().default(3000),
  handoffGraceMs: z.number().default(500),
  promptTailGraceMs: z.number().default(0),
  timeoutMs: z.number().default(30000),
  disposeGraceMs: z.number().default(3000)
})

function resolveConfig(config) {
  validateTerminalConfig(config)
  const runtime = resolveCoreutilsRuntime(config)
  if (config.shellDialect !== undefined && config.shellDialect !== 'bash') {
    throw new Error('coreutils-terminal: shellDialect must be bash')
  }
  return {
    ...config,
    shellDialect: 'bash',
    shellPath: runtime.bashPath,
    shellArgs: terminalShellArgs(config),
    backendType: config.backendType || 'coreutils-bash',
    coreutilsRuntime: runtime
  }
}

export function validateTerminalConfig(config) {
  const positive = ['rows', 'cols', 'scrollbackLines', 'scrollbackMaxBytes', 'maxReadBytes', 'pollIntervalMs', 'exactProbeAfterMs', 'timeoutMs']
  const nonNegative = ['idleSilenceMs', 'handoffGraceMs', 'promptTailGraceMs', 'disposeGraceMs']
  for (const key of positive) {
    if (!Number.isFinite(config[key]) || config[key] <= 0) {
      throw new Error(`coreutils-terminal: ${key} must be a positive finite number`)
    }
  }
  for (const key of nonNegative) {
    if (!Number.isFinite(config[key]) || config[key] < 0) {
      throw new Error(`coreutils-terminal: ${key} must be a non-negative finite number`)
    }
  }
  if (config.maxReadBytes > config.scrollbackMaxBytes) {
    throw new Error('coreutils-terminal: maxReadBytes must not exceed scrollbackMaxBytes')
  }
  if (config.handoffGraceMs < config.pollIntervalMs) {
    throw new Error('coreutils-terminal: handoffGraceMs must be at least pollIntervalMs')
  }
}

class CoreutilsBashTerminalBackend extends BashTerminalBackend {
  constructor(ctx, config) {
    const runtime = config.coreutilsRuntime
    super(ctx, config, (spec) => {
      const existingPath = spec.env?.PATH ?? process.env.PATH ?? process.env.Path ?? ''
      return ctx.subprocess.spawnTerminal({
        ...spec,
        env: {
          ...spec.env,
          PATH: prependRuntimePath(runtime, existingPath),
          NO_COLOR: '1',
          DSH_COREUTILS_BASH: '1',
          DSH_COREUTILS_BIN: runtime.coreutilsBinPath
        }
      })
    })
  }
}

export function apply(ctx, config) {
  ctx.terminals.registerBackend(new CoreutilsBashTerminalBackend(ctx, resolveConfig(config)))
}
