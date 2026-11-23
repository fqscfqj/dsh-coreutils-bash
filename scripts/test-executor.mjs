import assert from 'node:assert/strict'
import { mkdirSync, mkdtempDisposableSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import test from 'node:test'
import { Config as ExecutorConfig, CoreutilsBashExecutor } from '../executor.js'
import { apply as applyTerminal, Config as TerminalConfig, resolveConfig as resolveTerminalConfig } from '../terminal.js'

const command = 'printf "%s\\n" "hello world"'
const readOnlyFacts = { mode: 'read-only', enforcement: 'full', denied: false }

function fixture(t) {
  const workspace = mkdtempDisposableSync(join(tmpdir(), 'dsh-coreutils-mock-'))
  t.after(() => workspace.remove())
  const workdir = workspace.path
  const bashDirectory = join(workdir, 'Bash tools')
  const coreutilsBinPath = join(workdir, 'Coreutils bin')
  const bashPath = join(bashDirectory, 'bash.exe')
  mkdirSync(bashDirectory)
  mkdirSync(coreutilsBinPath)
  writeFileSync(bashPath, '')
  for (const executable of ['ls.exe', 'cat.exe', 'grep.exe', 'find.exe']) {
    writeFileSync(join(coreutilsBinPath, executable), '')
  }
  return { workdir, bashDirectory, bashPath, coreutilsBinPath }
}

function collect(readText) {
  return { readFrom(offset) {
    const bytes = Buffer.from(readText())
    return { text: bytes.subarray(offset).toString(), nextOffset: bytes.length, lossy: false }
  } }
}

function setup(t, { confine, spawn } = {}) {
  const runtime = fixture(t)
  const argv = ['mock-runner', '--', runtime.bashPath, '--noprofile', '--norc', '-c', command]
  const policy = { mode: 'read-only', workspaceRoot: runtime.workdir, sessionId: 'session-test' }
  const wrap = {
    argv,
    enforcement: 'full',
    denialSignatures: ['mock denied'],
    runnerFailureRules: [{ allowedExitCodes: [21], fatalSignatures: ['mock runner failed'] }]
  }
  const calls = { confine: [], spawn: [] }
  const processes = []
  const ctx = {
    reflect: { provide() {} },
    sandboxPolicy: { defaultMode: policy.mode, resolve: () => policy },
    sandbox: { async confine(...args) {
      calls.confine.push(args)
      return confine ? confine(wrap, ...args) : wrap
    } },
    subprocess: { spawn(spec) {
      calls.spawn.push(spec)
      spec.signal?.throwIfAborted()
      if (spawn) return spawn(spec)
      const deferred = Promise.withResolvers()
      const state = { stdout: '', stderr: '', terminations: 0, exit: deferred.resolve }
      const terminate = () => {
        state.terminations += 1
        state.exit({ exitCode: null, signal: 'SIGTERM' })
      }
      spec.signal?.addEventListener('abort', terminate, { once: true })
      processes.push(state)
      return {
        collected: { stdout: collect(() => state.stdout), stderr: collect(() => state.stderr) },
        done: deferred.promise.finally(() => spec.signal?.removeEventListener('abort', terminate)),
        terminate
      }
    } }
  }
  const executor = new CoreutilsBashExecutor(ctx, ExecutorConfig({ cwd: runtime.workdir, ...runtime }))
  return { ...runtime, policy, argv, calls, processes, executor, run: (options) => executor.execute(executor.resolve({ command, ...options })) }
}

test('full access uses configured Bash argv and preserves environment and stdio layering', async (t) => {
  const envPath = join(tmpdir(), 'mock-caller-env')
  const s = setup(t)
  const execution = await s.run({
    sandboxPolicy: { ...s.policy, mode: 'danger-full-access' },
    env: { Path: envPath, TEST_LAYER: 'ordinary' },
    dshEnv: { TEST_LAYER: 'trusted' },
    stdin: 'hello',
    stdoutMaxBytes: 2048
  })
  assert.deepEqual(s.calls.confine, [])
  const [spawn] = s.calls.spawn
  assert.deepEqual(spawn.argv, [s.bashPath, '--noprofile', '--norc', '-c', command])
  assert.equal(spawn.cwd, s.workdir)
  assert.deepEqual(spawn.stdio.stdin, { data: 'hello' })
  assert.equal(spawn.stdio.stdout.maxBytes, 2048)
  assert.equal(spawn.stdio.stdout.spill.maxBytes, 64 * 1024 * 1024)
  assert.equal(spawn.env.PATH, [s.coreutilsBinPath, s.bashDirectory, envPath].join(delimiter))
  assert.equal(spawn.env.Path, undefined)
  assert.equal(spawn.env.DSH_COREUTILS_BASH, '1')
  assert.equal(spawn.env.DSH_COREUTILS_BIN, s.coreutilsBinPath)
  assert.equal(spawn.env.TEST_LAYER, 'trusted')
  assert.equal(spawn.env.TERM, 'dumb')
  s.processes[0].exit({ exitCode: 0, signal: null })
  assert.deepEqual((await execution.result()).sandbox, { mode: 'danger-full-access', denied: false })
})

for (const mode of ['read-only', 'workspace-write']) {
  test(`${mode} forwards exact Bash and policy to confinement and spawns only the returned argv`, async (t) => {
    const s = setup(t)
    const sandboxPolicy = { ...s.policy, mode, additionalWritableRoots: [s.workdir] }
    const execution = await s.run({ sandboxPolicy })
    assert.equal(s.calls.confine.length, 1)
    const [receivedArgv, policy, signal] = s.calls.confine[0]
    assert.deepEqual(receivedArgv, [s.bashPath, '--noprofile', '--norc', '-c', command])
    assert.deepEqual(policy, sandboxPolicy)
    assert.equal(s.calls.spawn.length, 1)
    assert.equal(s.calls.spawn[0].argv, s.argv)
    assert.equal(s.calls.spawn[0].signal, signal)
    assert.equal(s.calls.spawn[0].env.DSH_COREUTILS_BIN, s.coreutilsBinPath)
    s.processes[0].stderr = 'Mock DENIED'
    s.processes[0].exit({ exitCode: 1, signal: null })
    await execution.done
    const expected = { ...readOnlyFacts, mode, denied: true }
    assert.deepEqual(execution.sandbox, expected)
    assert.deepEqual((await execution.result()).sandbox, expected)
  })
}

test('rejects unexpected direct argv dispatch for a restricted policy before spawning', async (t) => {
  const s = setup(t)
  const spec = s.executor.resolve({ command })
  await assert.rejects(s.executor.executeArgv(spec, ['bash', '-c', command]), /refusing direct argv without a full-access policy/)
  assert.deepEqual(s.calls.confine, [])
  assert.deepEqual(s.calls.spawn, [])
})

test('confinement rejection fails closed without spawning', async (t) => {
  const refused = new Error('mock confinement unavailable')
  const s = setup(t, { confine() { throw refused } })
  await assert.rejects(s.run(), (error) => error === refused)
  assert.deepEqual(s.calls.spawn, [])
})

test('runner failure takes precedence over denial in foreground and background', async (t) => {
  const s = setup(t)
  const execution = await s.run({ onExpiry: 'none' })
  s.processes[0].stderr = 'mock denied\nmock runner failed'
  s.processes[0].exit({ exitCode: 21, signal: null })
  await execution.done
  assert.deepEqual(execution.sandbox, { ...readOnlyFacts, runnerFailed: true })
  await assert.rejects(execution.result(), { code: 'SANDBOX_UNAVAILABLE', message: /mock runner failed/ })
})

test('cannot spawn a missing confinement runner, with no fallback', async (t) => {
  const s = setup(t, { spawn({ argv }) {
    throw Object.assign(new Error('mock spawn ENOENT'), { code: 'ENOENT', syscall: `spawn ${argv[0]}`, path: argv[0] })
  } })
  const execution = await s.run({ onExpiry: 'none' })
  await execution.done
  assert.equal(execution.status, 'killed')
  assert.deepEqual(execution.sandbox, { ...readOnlyFacts, runnerFailed: true })
  assert.equal(s.calls.spawn.length, 1)
  await assert.rejects(execution.result(), { code: 'SANDBOX_UNAVAILABLE' })
})

test('caller abort while preparing confinement prevents a later spawn', async (t) => {
  const controller = new AbortController()
  const aborted = new Error('mock caller aborted')
  const entered = Promise.withResolvers()
  const release = Promise.withResolvers()
  const s = setup(t, { async confine(wrap, _argv, _policy, signal) {
    entered.resolve(signal)
    await release.promise
    return wrap
  } })
  const pending = s.run({ signal: controller.signal })
  const signal = await entered.promise
  controller.abort(aborted)
  await assert.rejects(pending, (error) => error === aborted)
  assert.equal(signal.aborted, true)
  release.resolve()
  await new Promise(setImmediate)
  assert.deepEqual(s.calls.spawn, [])
})

test('caller abort after spawn reports cancellation without marking denial', async (t) => {
  const controller = new AbortController()
  const s = setup(t)
  const execution = await s.run({ signal: controller.signal })
  s.processes[0].stderr = 'mock denied'
  controller.abort(new Error('mock cancel'))
  const result = await execution.result()
  assert.equal(result.aborted, true)
  assert.equal(result.timedOut, false)
  assert.deepEqual(result.sandbox, readOnlyFacts)
  assert.equal(s.processes[0].terminations, 1)
})

test('background output is incremental and kill terminates the managed handle once', async (t) => {
  const s = setup(t)
  const execution = await s.run({ onExpiry: 'none' })
  assert.equal(execution.status, 'running')
  assert.equal(s.calls.spawn[0].signal, undefined)
  const [process] = s.processes
  process.stdout += 'one'
  assert.deepEqual(execution.readOutput(), { delta: 'one', lossy: false })
  process.stdout += 'two'
  process.stderr += 'three'
  assert.deepEqual(execution.readOutput(), { delta: 'two\n[stderr]\nthree', lossy: false })
  assert.equal(execution.readOutput().delta, '')
  assert.equal(execution.kill(), true)
  assert.equal(execution.kill(), false)
  await execution.done
  assert.equal(process.terminations, 1)
  assert.equal(execution.status, 'killed')
  assert.deepEqual(execution.sandbox, readOnlyFacts)
})

test('persistent terminal uses configured shell, profile-free defaults and the sandbox wrapper', async (t) => {
  const s = fixture(t)
  const config = TerminalConfig({ shellPath: s.bashPath, coreutilsBinPath: s.coreutilsBinPath })
  assert.deepEqual(resolveTerminalConfig(config).shellArgs, ['--noprofile', '--norc', '-i'])
  const customConfig = { ...config, shellArgs: ['--noprofile', '--norc', '-i'] }
  assert.deepEqual(resolveTerminalConfig({ ...config, shellArgs: ['--login', '-i'] }).shellArgs, ['--login', '-i'])
  let backend
  let spawn
  const policy = { mode: 'read-only', workspaceRoot: s.workdir }
  const wrapped = ['mock-terminal-runner', '--', s.bashPath, ...customConfig.shellArgs]
  // Stop at the subprocess seam so this test never creates a live PTY.
  const stopped = new Error('mock PTY allocation stopped')
  const sandbox = { async confine(argv, receivedPolicy) {
    assert.deepEqual(argv, [s.bashPath, ...customConfig.shellArgs])
    assert.deepEqual(receivedPolicy, policy)
    return { argv: wrapped }
  } }
  const ctx = {
    terminals: { registerBackend(value) { backend = value } },
    sandboxPolicy: { resolve: () => policy },
    get: (key) => key === 'sandbox' ? sandbox : undefined,
    subprocess: { async spawnTerminal(spec) { spawn = spec; throw stopped } }
  }
  applyTerminal(ctx, customConfig)
  const owner = { id: 'agent', session: {}, ctx: { on() {} } }
  assert.equal(backend.type, 'coreutils-bash')
  await assert.rejects(backend.spawn({ owner, cwd: s.workdir, sessionId: 'terminal' }), (error) => error === stopped)
  assert.equal(spawn.argv, wrapped)
  assert.equal(spawn.cwd, s.workdir)
  assert.equal(spawn.env.DSH_COREUTILS_BIN, s.coreutilsBinPath)
  assert.equal(spawn.env.NO_COLOR, '1')
  assert.equal(spawn.env.PS1, 'dsh> ')
})
