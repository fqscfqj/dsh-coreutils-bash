import assert from 'node:assert/strict'
import test from 'node:test'
import { environmentPath, prependRuntimePath, runtimeEnvironment, terminalShellArgs } from '../resolve.js'

test('environmentPath accepts Windows Path casing', () => {
  assert.equal(environmentPath({ Path: 'C:\\Windows\\System32', other: 'value' }), 'C:\\Windows\\System32')
  assert.equal(environmentPath({ PATH: 'first', Path: 'second' }), 'first')
  assert.equal(environmentPath({}), '')
})

test('runtimeEnvironment replaces every PATH spelling and prepends runtime tools', () => {
  const runtime = { coreutilsBinPath: 'C:\\coreutils\\bin', bashDirectory: 'C:\\Git\\usr\\bin' }
  const env = runtimeEnvironment(runtime, { Path: 'C:\\Windows\\System32', DSH_TEST: '1' })
  assert.equal(env.PATH, 'C:\\coreutils\\bin;C:\\Git\\usr\\bin;C:\\Windows\\System32')
  assert.equal(env.Path, undefined)
  assert.equal(env.DSH_TEST, '1')
  assert.equal(env.DSH_COREUTILS_BASH, '1')
  assert.equal(env.DSH_COREUTILS_BIN, runtime.coreutilsBinPath)
})

test('runtimeEnvironment keeps the caller PATH when no override is passed', () => {
  const runtime = { coreutilsBinPath: 'C:\\coreutils\\bin', bashDirectory: 'C:\\Git\\usr\\bin' }
  const env = runtimeEnvironment(runtime)
  assert.match(env.PATH, /^C:\\coreutils\\bin;C:\\Git\\usr\\bin;/i)
})

test('terminalShellArgs keeps explicit arguments and supplies safe defaults', () => {
  assert.deepEqual(terminalShellArgs({ shellArgs: ['--login', '-i'] }), ['--login', '-i'])
  assert.deepEqual(terminalShellArgs({ shellArgs: ['--login', 1, null] }), ['--login'])
  assert.deepEqual(terminalShellArgs({}), ['--noprofile', '--norc', '-i'])
})

test('prependRuntimePath removes duplicate entries case-insensitively on Windows', () => {
  const runtime = { coreutilsBinPath: 'C:\\Coreutils\\bin', bashDirectory: 'C:\\Git\\usr\\bin' }
  const result = prependRuntimePath(runtime, 'c:\\coreutils\\bin;C:\\Windows')
  assert.equal(result, 'C:\\Coreutils\\bin;C:\\Git\\usr\\bin;C:\\Windows')
})
