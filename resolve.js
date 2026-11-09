import { accessSync, constants, existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, basename } from 'node:path'

const REQUIRED_UTILITIES = ['ls.exe', 'cat.exe', 'grep.exe', 'find.exe']
const DEFAULT_BASH_ARGS = ['--noprofile', '--norc', '-c']

function clean(value) {
  const unboxed = value !== null && typeof value === 'object' && typeof value.get === 'function' ? value.get() : value
  return typeof unboxed === 'string' ? unboxed.trim().replace(/^"|"$/g, '') : ''
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

function pathEntries(env) {
  const raw = env.PATH ?? env.Path ?? ''
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
  if (configured) return unique([configured, join(configured, 'bin'), join(configured, 'cmd')])
  return unique([
    ...roots.flatMap((root) => [root, join(root, 'bin'), join(root, 'cmd')])
  ])
}

function completeCoreutilsBin(path) {
  if (!existingDirectory(path)) return false
  return REQUIRED_UTILITIES.every((utility) => existingFile(join(path, utility)))
}

function diagnostic({ bashCandidates, binCandidates, configuredBash, configuredCoreutils }) {
  const bash = bashCandidates.length > 0 ? bashCandidates.join('\n  ') : '(none)'
  const bins = binCandidates.length > 0 ? binCandidates.join('\n  ') : '(none)'
  return [
    'Coreutils Bash is unavailable.',
    configuredBash ? `Configured bashPath does not exist or is not executable: ${configuredBash}` : `Checked bash.exe locations:\n  ${bash}`,
    configuredCoreutils ? `Configured coreutils path is incomplete: ${configuredCoreutils}` : `Checked Coreutils command directories:\n  ${bins}`,
    'Install Git for Windows or MSYS2 for bash.exe, then install Microsoft Coreutils with: winget install Microsoft.Coreutils',
    'You can configure bashPath, coreutilsPath, or coreutilsBinPath in the plugin row.'
  ].join('\n')
}

export function resolveCoreutilsRuntime(config = {}, env = process.env) {
  const bashCandidates = executableCandidates(config.bashPath, env, ['bash.exe', 'bash'])
  const bashPath = bashCandidates.find(existingFile)
  const binCandidates = coreutilsBinCandidates(config, env)
  const coreutilsBinPath = binCandidates.find(completeCoreutilsBin)
  if (!bashPath || !coreutilsBinPath) {
    throw new Error(diagnostic({
      bashCandidates,
      binCandidates,
      configuredBash: clean(config.bashPath),
      configuredCoreutils: clean(config.coreutilsBinPath || config.coreutilsPath)
    }))
  }
  const coreutilsPath = clean(config.coreutilsPath) || join(dirname(coreutilsBinPath), 'coreutils.exe')
  return {
    bashPath,
    bashDirectory: dirname(bashPath),
    coreutilsBinPath,
    coreutilsPath: existingFile(coreutilsPath) ? coreutilsPath : join(dirname(coreutilsBinPath), 'coreutils.exe')
  }
}

export function prependRuntimePath(runtime, existingPath = '') {
  const separator = process.platform === 'win32' ? ';' : ':'
  return unique([runtime.coreutilsBinPath, runtime.bashDirectory, ...String(existingPath).split(separator).map(clean)]).join(separator)
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
