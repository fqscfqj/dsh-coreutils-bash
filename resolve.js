import { accessSync, constants, statSync } from 'node:fs'
import { dirname, join, basename } from 'node:path'

const REQUIRED_UTILITIES = ['ls.exe', 'cat.exe', 'grep.exe', 'find.exe']
const DEFAULT_BASH_ARGS = ['--noprofile', '--norc', '-c']

function clean(value) {
  const unboxed = value !== null && typeof value === 'object' && typeof value.get === 'function' ? value.get() : value
  return typeof unboxed === 'string' ? unboxed.trim().replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, (_, doubleQuoted, singleQuoted) => doubleQuoted ?? singleQuoted) : ''
}

function existingFile(value) {
  const path = clean(value)
  if (!path) return false
  try {
    const stat = statSync(path)
    accessSync(path, constants.R_OK)
    return stat.isFile() || stat.isSymbolicLink()
  } catch {
    return false
  }
}

function existingDirectory(value) {
  const path = clean(value)
  if (!path) return false
  try {
    const stat = statSync(path)
    accessSync(path, constants.R_OK)
    return stat.isDirectory()
  } catch {
    return false
  }
}

export function environmentPath(env = process.env) {
  const value = env.PATH ?? env.Path ?? Object.entries(env).find(([key]) => key.toLowerCase() === 'path')?.[1]
  return typeof value === 'string' ? value : ''
}

function pathEntries(env) {
  const raw = environmentPath(env)
  return raw.split(process.platform === 'win32' ? ';' : ':').map(clean).filter(Boolean)
}

function unique(values) {
  const seen = new Set()
  return values.filter((value) => {
    const key = process.platform === 'win32' ? value.toLowerCase() : value
    if (!value || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function executableCandidates(configured, env, names) {
  const configuredPath = clean(configured)
  const programFiles = clean(env.ProgramFiles) || 'C:\\Program Files'
  const localAppData = clean(env.LOCALAPPDATA) || join(clean(env.USERPROFILE) || '', 'AppData', 'Local')
  const pathCandidates = pathEntries(env).flatMap((entry) => names.map((name) => join(entry, name)))
  if (configuredPath) return [configuredPath]
  return unique([
    ...names.flatMap((name) => [
      join(programFiles, 'Git', 'usr', 'bin', name),
      join(programFiles, 'Git', 'bin', name),
      join(localAppData, 'Programs', 'Git', 'usr', 'bin', name),
      join(localAppData, 'Programs', 'Git', 'bin', name),
      join('C:\\msys64', 'usr', 'bin', name),
      join(clean(env.USERPROFILE) || '', 'scoop', 'apps', 'git', 'current', 'usr', 'bin', name)
    ]),
    ...pathCandidates
  ])
}

function configuredCoreutilsBinCandidates(value) {
  const configured = clean(value)
  if (!configured) return []
  if (existingFile(configured)) {
    const directory = dirname(configured)
    return unique([directory, join(directory, 'bin'), join(directory, 'cmd'), dirname(directory)])
  }
  if (existingDirectory(configured)) {
    return unique([configured, join(configured, 'bin'), join(configured, 'cmd')])
  }
  return [configured]
}

function coreutilsBinCandidates(config, env) {
  const configuredBin = clean(config?.coreutilsBinPath)
  const configured = clean(config?.coreutilsPath)
  const programFiles = clean(env.ProgramFiles) || 'C:\\Program Files'
  const localAppData = clean(env.LOCALAPPDATA) || join(clean(env.USERPROFILE) || '', 'AppData', 'Local')
  const roots = [
    join(programFiles, 'coreutils'),
    join(localAppData, 'Programs', 'coreutils'),
    join(clean(env.USERPROFILE) || '', 'scoop', 'apps', 'coreutils', 'current'),
    ...pathEntries(env).filter((entry) => /coreutils/i.test(entry))
  ]
  if (configuredBin) return [configuredBin]
  if (configured) return configuredCoreutilsBinCandidates(configured)
  return unique([
    ...roots.flatMap((root) => [root, join(root, 'bin'), join(root, 'cmd')])
  ])
}

function configuredCoreutilsExecutable(configuredPath, coreutilsBinPath) {
  if (existingFile(configuredPath)) return configuredPath
  const configured = clean(configuredPath)
  if (configured) {
    const candidate = [join(configured, 'coreutils.exe'), join(dirname(configured), 'coreutils.exe')].find(existingFile)
    if (candidate) return candidate
  }
  return join(dirname(coreutilsBinPath), 'coreutils.exe')
}

function completeCoreutilsBin(path) {
  if (!existingDirectory(path)) return false
  return REQUIRED_UTILITIES.every((utility) => existingFile(join(path, utility)))
}

function diagnostic({ bashCandidates, binCandidates, configuredBash, configuredCoreutils, invalidCoreutilsPath, language }) {
  const bash = bashCandidates.length > 0 ? bashCandidates.join('\n  ') : '(none)'
  const bins = binCandidates.length > 0 ? binCandidates.join('\n  ') : '(none)'
  if (language === 'zh') {
    return [
      'Coreutils Bash 不可用。',
      configuredBash ? `配置的 bashPath 不存在或不可执行：${configuredBash}` : `已检查的 bash.exe 位置：\n  ${bash}`,
      invalidCoreutilsPath ? `配置的 coreutilsPath 不存在或不是文件：${invalidCoreutilsPath}` : configuredCoreutils ? `配置的 Coreutils 路径不完整：${configuredCoreutils}` : `已检查的 Coreutils 命令目录：\n  ${bins}`,
      '请安装 Git for Windows 或 MSYS2 提供 bash.exe，并通过 winget install Microsoft.Coreutils 安装 Microsoft Coreutils。',
      '可在插件配置中设置 bashPath、coreutilsPath 或 coreutilsBinPath。'
    ].join('\n')
  }
  return [
    'Coreutils Bash is unavailable.',
    configuredBash ? `Configured bashPath does not exist or is not executable: ${configuredBash}` : `Checked bash.exe locations:\n  ${bash}`,
    invalidCoreutilsPath ? `Configured coreutilsPath does not exist or is not a file: ${invalidCoreutilsPath}` : configuredCoreutils ? `Configured coreutils path is incomplete: ${configuredCoreutils}` : `Checked Coreutils command directories:\n  ${bins}`,
    'Install Git for Windows or MSYS2 for bash.exe, then install Microsoft Coreutils with: winget install Microsoft.Coreutils',
    'You can configure bashPath, coreutilsPath, or coreutilsBinPath in the plugin row.'
  ].join('\n')
}

export function resolveCoreutilsRuntime(config = {}, env = process.env) {
  const bashCandidates = executableCandidates(config.bashPath, env, ['bash.exe', 'bash'])
  const bashPath = bashCandidates.find(existingFile)
  const binCandidates = coreutilsBinCandidates(config, env)
  const coreutilsBinPath = binCandidates.find(completeCoreutilsBin)
  const configuredCoreutilsPath = clean(config.coreutilsPath)
  const invalidCoreutilsPath = configuredCoreutilsPath && !existingFile(configuredCoreutilsPath) && !existingDirectory(configuredCoreutilsPath) ? configuredCoreutilsPath : undefined
  if (!bashPath || !coreutilsBinPath || invalidCoreutilsPath) {
    throw new Error(diagnostic({
      bashCandidates,
      binCandidates,
      configuredBash: clean(config.bashPath),
      configuredCoreutils: clean(config.coreutilsBinPath || config.coreutilsPath),
      invalidCoreutilsPath,
      language: /^(zh|zh[-_])/i.test(env.LC_ALL || env.LC_MESSAGES || env.LANG || '') ? 'zh' : 'en'
    }))
  }
  const coreutilsPath = configuredCoreutilsExecutable(configuredCoreutilsPath, coreutilsBinPath)
  return {
    bashPath,
    bashDirectory: dirname(bashPath),
    coreutilsBinPath,
    coreutilsPath
  }
}

export function prependRuntimePath(runtime, existingPath = '') {
  const separator = process.platform === 'win32' ? ';' : ':'
  return unique([runtime.coreutilsBinPath, runtime.bashDirectory, ...String(existingPath).split(separator).map(clean)]).join(separator)
}

export function runtimeEnvironment(runtime, env = {}) {
  const result = { ...env }
  const pathKey = Object.keys(result).find((key) => key.toLowerCase() === 'path')
  const existingPath = pathKey === undefined ? environmentPath() : environmentPath(result)
  // Node sorts environment keys on Windows and keeps only one PATH spelling.
  for (const key of Object.keys(result)) {
    if (key.toLowerCase() === 'path') delete result[key]
  }
  return {
    ...result,
    PATH: prependRuntimePath(runtime, existingPath),
    DSH_COREUTILS_BASH: '1',
    DSH_COREUTILS_BIN: runtime.coreutilsBinPath
  }
}

export function bashCommandArgv(runtime, command) {
  return [runtime.bashPath, ...DEFAULT_BASH_ARGS, command]
}

export function terminalShellArgs(config) {
  const args = Array.isArray(config?.shellArgs) ? config.shellArgs.filter((value) => typeof value === 'string') : []
  return args.length > 0 ? args : ['--noprofile', '--norc', '-i']
}

export function runtimeSummary(runtime) {
  return `${basename(runtime.bashPath)} + ${runtime.coreutilsBinPath}`
}
