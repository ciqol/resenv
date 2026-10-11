import assert from 'node:assert/strict'
import { beforeEach, test, vi } from 'vitest'
import type { Environment } from './types.js'
import { ResenvError, resolve, formatError } from './index.js'
import { resolveDopplerSync } from './doppler/bridge.js'

vi.mock('./doppler/bridge.js', () => ({ resolveDopplerSync: vi.fn() }))

beforeEach(() => {
  vi.mocked(resolveDopplerSync).mockReset()
})

test('plaintext-only environments need no keys and are copied unchanged', () => {
  const env = { VALUE: 'plain', EMPTY: '', UNSET: undefined, DOTENV_PRIVATE_KEY: 'unused' }
  assert.deepEqual({ ...resolve(env) }, env)
  assert.notEqual(resolve(env), env)
})

test('default and explicit copy mode resolve a frozen input without replacing it', () => {
  const reference = 'doppler://dummy/dev/API_KEY'
  vi.mocked(resolveDopplerSync).mockReturnValue(Object.fromEntries(['TOKEN', 'FIRST', 'SECOND', '__proto__'].map(name => [name, 'dummy-value'])))
  const env = Object.freeze({ TOKEN: reference })
  for (const options of [{}, { replace: false }]) {
    const result = resolve(env, options)
    assert.equal(result.TOKEN, 'dummy-value')
    assert.equal(env.TOKEN, reference)
    assert.notEqual(result, env)
  }
})

test('in-place mode replaces the input and returns an independent resolved copy', () => {
  const reference = 'doppler://dummy/dev/API_KEY'
  vi.mocked(resolveDopplerSync).mockReturnValue(Object.fromEntries(['TOKEN', 'FIRST', 'SECOND', '__proto__'].map(name => [name, 'dummy-value'])))
  const env = { TOKEN: reference }
  const result = resolve(env, { replace: true })
  assert.equal(env.TOKEN, 'dummy-value')
  assert.deepEqual({ ...result }, env)
  assert.notEqual(result, env)
  result.TOKEN = 'dummy-copy-change'
  assert.equal(env.TOKEN, 'dummy-value')
  env.TOKEN = 'dummy-input-change'
  assert.equal(result.TOKEN, 'dummy-copy-change')
})

test('in-place mode returns a new copy even when there are no references', () => {
  const env = { VALUE: 'plain', EMPTY: '', UNSET: undefined }
  const result = resolve(env, { replace: true })
  assert.deepEqual({ ...result }, env)
  assert.notEqual(result, env)
  result.VALUE = 'dummy-copy-change'
  assert.equal(env.VALUE, 'plain')
})

test('special environment names do not modify object prototypes', () => {
  const reference = 'doppler://dummy/dev/API_KEY'
  vi.mocked(resolveDopplerSync).mockReturnValue(Object.fromEntries(['TOKEN', 'FIRST', 'SECOND', '__proto__'].map(name => [name, 'dummy-value'])))
  const env: Environment = {}
  Object.defineProperty(env, '__proto__', { value: reference, enumerable: true, writable: true, configurable: true })
  resolve(env, { replace: true })
  assert.equal(env.__proto__, 'dummy-value')
  assert.equal(Object.getPrototypeOf(env), Object.prototype)
})

test('in-place resolution rejects a read-only property before changing any value', () => {
  const reference = 'doppler://dummy/dev/API_KEY'
  vi.mocked(resolveDopplerSync).mockReturnValue(Object.fromEntries(['TOKEN', 'FIRST', 'SECOND', '__proto__'].map(name => [name, 'dummy-value'])))
  const env: Environment = { FIRST: reference }
  Object.defineProperty(env, 'SECOND', { value: reference, enumerable: true })
  assert.throws(() => resolve(env, { replace: true }), { code: 'INVALID_ENV_TARGET' })
  assert.equal(env.FIRST, reference)
  assert.equal(env.SECOND, reference)
})

test('in-place resolution preserves writable property flags and rejects setters and proxies', () => {
  const reference = 'doppler://dummy/dev/API_KEY'
  vi.mocked(resolveDopplerSync).mockReturnValue(Object.fromEntries(['TOKEN', 'FIRST', 'SECOND', '__proto__'].map(name => [name, 'dummy-value'])))
  const env = Object.seal({ TOKEN: reference })
  resolve(env, { replace: true })
  assert.equal(env.TOKEN, 'dummy-value')
  assert.equal(Object.getOwnPropertyDescriptor(env, 'TOKEN')?.configurable, false)
  const accessor = { FIRST: reference }
  Object.defineProperty(accessor, 'SECOND', { get: () => reference, set: () => assert.fail('setter must not run'), enumerable: true })
  assert.throws(() => resolve(accessor, { replace: true }), { code: 'INVALID_ENV_TARGET' })
  assert.equal(accessor.FIRST, reference)
  const proxy = new Proxy({ TOKEN: reference }, { defineProperty: () => assert.fail('Proxy trap must not run') })
  assert.throws(() => resolve(proxy, { replace: true }), { code: 'INVALID_ENV_TARGET' })
})

test('commands require explicit opt-in and ignore an environment toggle', () => {
  const env = { TOKEN: '$(must-not-run)', RESENV_COMMANDS: 'true' }
  assert.deepEqual({ ...resolve(env) }, env)
})

test('infers Doppler in default, explicit copy and in-place modes', () => {
  const reference = 'doppler://dummy/dev/API_KEY'
  for (const options of [undefined, {}, { replace: false }, { replace: true }]) {
    vi.mocked(resolveDopplerSync).mockReset().mockReturnValue({ TOKEN: 'dummy-cloud' })
    const env = { TOKEN: reference, DOPPLER_TOKEN: 'dummy-token', PORT: '3000' }
    const result = resolve(env, options)
    assert.equal(result.TOKEN, 'dummy-cloud')
    assert.equal(result.PORT, '3000')
    assert.notEqual(result, env)
    assert.equal(env.TOKEN, options?.replace ? 'dummy-cloud' : reference)
    assert.deepEqual(vi.mocked(resolveDopplerSync).mock.calls, [[{ TOKEN: reference, DOPPLER_TOKEN: 'dummy-token' }]])
  }
})

test('no references skip cloud resolution and preserve command expressions by default', () => {
  const env = { TOKEN: '$(must-not-run)', URL: 'https://example.invalid/', EMPTY: '', UNSET: undefined }
  assert.deepEqual({ ...resolve(env) }, env)
  assert.equal(vi.mocked(resolveDopplerSync).mock.calls.length, 0)
})

test('invalid inferred references fail before optional commands execute', () => {
  const env = { TOKEN: 'doppler://missing-config', COMMAND: '$(must-not-run)' }
  assert.throws(() => resolve(env, { commands: true, replace: true }), (err: unknown) => {
    assert.ok(err instanceof ResenvError)
    assert.equal(err.code, 'DOPPLER_INVALID_REFERENCE')
    return true
  })
  assert.equal(env.COMMAND, '$(must-not-run)')
  assert.equal(vi.mocked(resolveDopplerSync).mock.calls.length, 0)
})

test('inferred cloud resolution failures never replace the input', () => {
  vi.mocked(resolveDopplerSync).mockImplementation(() => { throw new ResenvError('DOPPLER_ACCESS_DENIED', 'Dummy access denied') })
  const env = { TOKEN: 'doppler://dummy/dev/API_KEY' }
  assert.throws(() => resolve(env, { replace: true }), ResenvError)
  assert.equal(env.TOKEN, 'doppler://dummy/dev/API_KEY')
})

test('encrypted values stay literal and never need a private key', () => {
  const env = { TOKEN: 'encrypted:not-reference', DOTENV_PRIVATE_KEY: 'unused' }
  assert.deepEqual({ ...resolve(env) }, env)
  assert.equal(vi.mocked(resolveDopplerSync).mock.calls.length, 0)
})

test('fetched output stays literal with commands enabled', () => {
  for (const literal of ['doppler://dummy/dev/DO_NOT_FETCH', '$(must-not-run)', 'encrypted:not-reference']) {
    vi.mocked(resolveDopplerSync).mockReturnValue({ TOKEN: literal })
    const env = { TOKEN: 'doppler://dummy/dev/API_KEY' }
    assert.equal(resolve(env, { commands: true }).TOKEN, literal)
    assert.equal(env.TOKEN, 'doppler://dummy/dev/API_KEY')
  }
})

test('formats unexpected failures without their underlying details', () => {
  assert.equal(formatError(new Error('sensitive underlying failure')), '[resenv] STARTUP_FAILED: Environment resolution failed.')
})
