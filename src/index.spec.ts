import assert from 'node:assert/strict'
import { beforeEach, test, vi } from 'vitest'
import { PrivateKey, encrypt, ECIES_CONFIG } from 'eciesjs'
import type { Environment } from './types.js'
import { ResenvError, resolve, formatError } from './index.js'
import { resolveDopplerSync } from './doppler/bridge.js'

vi.mock('./doppler/bridge.js', () => ({ resolveDopplerSync: vi.fn() }))

beforeEach(() => {
  vi.mocked(resolveDopplerSync).mockReset()
})

function fixture (plaintext: string | Buffer = 'dummy-value') {
  const key = new PrivateKey()
  return {
    privateKey: key.toHex(),
    ciphertext: `encrypted:${Buffer.from(encrypt(key.publicKey.toHex(), Buffer.from(plaintext))).toString('base64')}`
  }
}

test('decrypts UTF-8, multiline and empty values without interpolation', () => {
  for (const plaintext of ['', '\uFEFFkeep the leading BOM', 'hello 🌍\nsecond line', '$(echo literal) ${HOME} $PATH']) {
    const { privateKey, ciphertext } = fixture(plaintext)
    const env = { TOKEN: ciphertext, DOTENV_PRIVATE_KEY: privateKey, PORT: '3000' }
    const result = resolve(env)
    assert.equal(result.TOKEN, plaintext)
    assert.equal(result.PORT, '3000')
    assert.equal(result.DOTENV_PRIVATE_KEY, privateKey)
    assert.equal(env.TOKEN, ciphertext)
  }
})

test('plaintext-only environments need no keys and are copied unchanged', () => {
  const env = { VALUE: 'plain', EMPTY: '', UNSET: undefined, DOTENV_PRIVATE_KEY: 'unused' }
  assert.deepEqual({ ...resolve(env) }, env)
  assert.notEqual(resolve(env), env)
})

test('default and explicit copy mode resolve a frozen input without replacing it', () => {
  const { privateKey, ciphertext } = fixture()
  const env = Object.freeze({ TOKEN: ciphertext, DOTENV_PRIVATE_KEY: privateKey })
  for (const options of [{}, { replace: false }]) {
    const result = resolve(env, options)
    assert.equal(result.TOKEN, 'dummy-value')
    assert.equal(env.TOKEN, ciphertext)
    assert.notEqual(result, env)
  }
})

test('in-place mode replaces the input and returns an independent resolved copy', () => {
  const { privateKey, ciphertext } = fixture()
  const env = { TOKEN: ciphertext, DOTENV_PRIVATE_KEY: privateKey }
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

test('named keys and comma-separated rotation keys resolve a mixed environment', () => {
  const a = fixture('first')
  const b = fixture('second')
  const unused = new PrivateKey().toHex()
  const env = {
    FIRST: a.ciphertext,
    SECOND: b.ciphertext,
    DOTENV_PRIVATE_KEY: '',
    DOTENV_PRIVATE_KEY_DEV: `${unused}, ${a.privateKey.toUpperCase()},${a.privateKey}`,
    DOTENV_PRIVATE_KEY_OTHER: b.privateKey
  }
  assert.notEqual(resolve(env, { replace: true }), env)
  assert.equal(env.FIRST, 'first')
  assert.equal(env.SECOND, 'second')
  assert.notEqual(resolve(env, { replace: true }), env)
})

test('missing, invalid and wrong keys fail with safe errors', () => {
  const { ciphertext } = fixture('private-dummy-plaintext')
  for (const [key, code] of <readonly (readonly [string | undefined, string])[]>[[undefined, 'MISSING_PRIVATE_KEY'], ['invalid-dummy-key', 'INVALID_PRIVATE_KEY'], [new PrivateKey().toHex(), 'DECRYPTION_FAILED']]) {
    assert.throws(() => resolve({ TOKEN: ciphertext, DOTENV_PRIVATE_KEY: key }), (err: unknown) => {
      assert.ok(err instanceof ResenvError)
      assert.equal(err.code, code)
      const report = `${formatError(err)}\n${err.stack}`
      assert.ok(!report.includes(ciphertext))
      assert.ok(!report.includes('private-dummy-plaintext'))
      if (key) assert.ok(!report.includes(key))
      assert.equal(err.cause, undefined)
      return true
    })
  }
  assert.equal(formatError(new Error('sensitive underlying failure')), '[resenv] STARTUP_FAILED: Environment resolution failed.')
})

test('malformed and tampered ciphertext abort before mutating any values', () => {
  const { privateKey, ciphertext } = fixture()
  const tampered = Buffer.from(ciphertext.slice('encrypted:'.length), 'base64')
  tampered[tampered.length - 1] = (tampered[tampered.length - 1] || 0) ^ 1
  for (const invalid of ['encrypted:', 'encrypted:abc', `${ciphertext}\n`, `encrypted:${tampered.toString('base64')}`]) {
    const env = { FIRST: ciphertext, SECOND: invalid, DOTENV_PRIVATE_KEY: privateKey }
    const original = { ...env }
    assert.throws(() => resolve(env, { replace: true }), ResenvError)
    assert.deepEqual(env, original)
  }
})

test('null bytes and invalid UTF-8 cannot silently change an environment value', () => {
  for (const plaintext of [Buffer.from([0xff, 0xfe]), Buffer.from('before\0after')]) {
    const { privateKey, ciphertext } = fixture(plaintext)
    assert.throws(() => resolve({ TOKEN: ciphertext, DOTENV_PRIVATE_KEY: privateKey }), { code: 'INVALID_ENV_VALUE' })
  }
})

test('cryptographic configuration is independent of eciesjs global settings', () => {
  const { privateKey, ciphertext } = fixture()
  const previous = ECIES_CONFIG.symmetricNonceLength
  try {
    ECIES_CONFIG.symmetricNonceLength = 12
    assert.equal(resolve({ TOKEN: ciphertext, DOTENV_PRIVATE_KEY: privateKey }).TOKEN, 'dummy-value')
  } finally {
    ECIES_CONFIG.symmetricNonceLength = previous
  }
})

test('special environment names do not modify object prototypes', () => {
  const { privateKey, ciphertext } = fixture()
  const env: Environment = { DOTENV_PRIVATE_KEY: privateKey }
  Object.defineProperty(env, '__proto__', { value: ciphertext, enumerable: true, writable: true, configurable: true })
  resolve(env, { replace: true })
  assert.equal(env.__proto__, 'dummy-value')
  assert.equal(Object.getPrototypeOf(env), Object.prototype)
})

test('decrypted strings are literal values and are not recursively resolved', () => {
  const { privateKey, ciphertext } = fixture('encrypted:literal-application-value')
  assert.equal(resolve({ TOKEN: ciphertext, DOTENV_PRIVATE_KEY: privateKey }).TOKEN, 'encrypted:literal-application-value')
})

test('in-place resolution rejects a read-only property before changing any value', () => {
  const { privateKey, ciphertext } = fixture()
  const env: Environment = { FIRST: ciphertext, DOTENV_PRIVATE_KEY: privateKey }
  Object.defineProperty(env, 'SECOND', { value: ciphertext, enumerable: true })
  assert.throws(() => resolve(env, { replace: true }), { code: 'INVALID_ENV_TARGET' })
  assert.equal(env.FIRST, ciphertext)
  assert.equal(env.SECOND, ciphertext)
})

test('in-place resolution preserves writable property flags and rejects setters and proxies', () => {
  const { privateKey, ciphertext } = fixture()
  const env = Object.seal({ TOKEN: ciphertext, DOTENV_PRIVATE_KEY: privateKey })
  resolve(env, { replace: true })
  assert.equal(env.TOKEN, 'dummy-value')
  assert.equal(Object.getOwnPropertyDescriptor(env, 'TOKEN')?.configurable, false)
  const accessor = { FIRST: ciphertext, DOTENV_PRIVATE_KEY: privateKey }
  Object.defineProperty(accessor, 'SECOND', { get: () => ciphertext, set: () => assert.fail('setter must not run'), enumerable: true })
  assert.throws(() => resolve(accessor, { replace: true }), { code: 'INVALID_ENV_TARGET' })
  assert.equal(accessor.FIRST, ciphertext)
  const proxy = new Proxy({ TOKEN: ciphertext }, { defineProperty: () => assert.fail('Proxy trap must not run') })
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

test('cloud keys can decrypt original values while all cloud output remains literal', () => {
  const { privateKey, ciphertext } = fixture()
  for (const literal of ['doppler://dummy/dev/DO_NOT_FETCH', '$(must-not-run)', 'encrypted:not-ciphertext']) {
    vi.mocked(resolveDopplerSync).mockReset().mockReturnValue({ DOTENV_PRIVATE_KEY: privateKey, LITERAL: literal })
    const env = {
      DOTENV_PRIVATE_KEY: 'doppler://dummy/dev/PRIVATE_KEY',
      LITERAL: 'doppler://dummy/dev/LITERAL',
      TOKEN: ciphertext
    }
    const result = resolve(env, { commands: true })
    assert.equal(result.TOKEN, 'dummy-value')
    assert.equal(result.LITERAL, literal)
    assert.equal(env.TOKEN, ciphertext)
    assert.equal(vi.mocked(resolveDopplerSync).mock.calls.length, 1)
  }
})
