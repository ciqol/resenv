import assert from 'node:assert/strict'
import { test } from 'vitest'
import { PrivateKey, encrypt, ECIES_CONFIG } from 'eciesjs'
import type { Environment } from './types.js'
import { ResenvError, resolveEnv, formatError } from './index.js'

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
    const result = resolveEnv(env)
    assert.equal(result.TOKEN, plaintext)
    assert.equal(result.PORT, '3000')
    assert.equal(result.DOTENV_PRIVATE_KEY, privateKey)
    assert.equal(env.TOKEN, ciphertext)
  }
})

test('plaintext-only environments need no keys and are copied unchanged', () => {
  const env = { VALUE: 'plain', EMPTY: '', UNSET: undefined, DOTENV_PRIVATE_KEY: 'unused' }
  assert.deepEqual({ ...resolveEnv(env) }, env)
  assert.notEqual(resolveEnv(env), env)
})

test('default and explicit copy mode resolve a frozen input without replacing it', () => {
  const { privateKey, ciphertext } = fixture()
  const env = Object.freeze({ TOKEN: ciphertext, DOTENV_PRIVATE_KEY: privateKey })
  for (const options of [{}, { inPlace: false }]) {
    const result = resolveEnv(env, options)
    assert.equal(result.TOKEN, 'dummy-value')
    assert.equal(env.TOKEN, ciphertext)
    assert.notEqual(result, env)
  }
})

test('in-place mode replaces the input and returns an independent resolved copy', () => {
  const { privateKey, ciphertext } = fixture()
  const env = { TOKEN: ciphertext, DOTENV_PRIVATE_KEY: privateKey }
  const result = resolveEnv(env, { inPlace: true })
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
  const result = resolveEnv(env, { inPlace: true })
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
  assert.notEqual(resolveEnv(env, { inPlace: true }), env)
  assert.equal(env.FIRST, 'first')
  assert.equal(env.SECOND, 'second')
  assert.notEqual(resolveEnv(env, { inPlace: true }), env)
})

test('missing, invalid and wrong keys fail with safe errors', () => {
  const { ciphertext } = fixture('private-dummy-plaintext')
  for (const [key, code] of <readonly (readonly [string | undefined, string])[]>[[undefined, 'MISSING_PRIVATE_KEY'], ['invalid-dummy-key', 'INVALID_PRIVATE_KEY'], [new PrivateKey().toHex(), 'DECRYPTION_FAILED']]) {
    assert.throws(() => resolveEnv({ TOKEN: ciphertext, DOTENV_PRIVATE_KEY: key }), (err: unknown) => {
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
    assert.throws(() => resolveEnv(env, { inPlace: true }), ResenvError)
    assert.deepEqual(env, original)
  }
})

test('null bytes and invalid UTF-8 cannot silently change an environment value', () => {
  for (const plaintext of [Buffer.from([0xff, 0xfe]), Buffer.from('before\0after')]) {
    const { privateKey, ciphertext } = fixture(plaintext)
    assert.throws(() => resolveEnv({ TOKEN: ciphertext, DOTENV_PRIVATE_KEY: privateKey }), { code: 'INVALID_ENV_VALUE' })
  }
})

test('cryptographic configuration is independent of eciesjs global settings', () => {
  const { privateKey, ciphertext } = fixture()
  const previous = ECIES_CONFIG.symmetricNonceLength
  try {
    ECIES_CONFIG.symmetricNonceLength = 12
    assert.equal(resolveEnv({ TOKEN: ciphertext, DOTENV_PRIVATE_KEY: privateKey }).TOKEN, 'dummy-value')
  } finally {
    ECIES_CONFIG.symmetricNonceLength = previous
  }
})

test('special environment names do not modify object prototypes', () => {
  const { privateKey, ciphertext } = fixture()
  const env: Environment = { DOTENV_PRIVATE_KEY: privateKey }
  Object.defineProperty(env, '__proto__', { value: ciphertext, enumerable: true, writable: true, configurable: true })
  resolveEnv(env, { inPlace: true })
  assert.equal(env.__proto__, 'dummy-value')
  assert.equal(Object.getPrototypeOf(env), Object.prototype)
})

test('decrypted strings are literal values and are not recursively resolved', () => {
  const { privateKey, ciphertext } = fixture('encrypted:literal-application-value')
  assert.equal(resolveEnv({ TOKEN: ciphertext, DOTENV_PRIVATE_KEY: privateKey }).TOKEN, 'encrypted:literal-application-value')
})

test('in-place resolution rejects a read-only property before changing any value', () => {
  const { privateKey, ciphertext } = fixture()
  const env: Environment = { FIRST: ciphertext, DOTENV_PRIVATE_KEY: privateKey }
  Object.defineProperty(env, 'SECOND', { value: ciphertext, enumerable: true })
  assert.throws(() => resolveEnv(env, { inPlace: true }), { code: 'INVALID_ENV_TARGET' })
  assert.equal(env.FIRST, ciphertext)
  assert.equal(env.SECOND, ciphertext)
})

test('in-place resolution preserves writable property flags and rejects setters and proxies', () => {
  const { privateKey, ciphertext } = fixture()
  const env = Object.seal({ TOKEN: ciphertext, DOTENV_PRIVATE_KEY: privateKey })
  resolveEnv(env, { inPlace: true })
  assert.equal(env.TOKEN, 'dummy-value')
  assert.equal(Object.getOwnPropertyDescriptor(env, 'TOKEN')?.configurable, false)
  const accessor = { FIRST: ciphertext, DOTENV_PRIVATE_KEY: privateKey }
  Object.defineProperty(accessor, 'SECOND', { get: () => ciphertext, set: () => assert.fail('setter must not run'), enumerable: true })
  assert.throws(() => resolveEnv(accessor, { inPlace: true }), { code: 'INVALID_ENV_TARGET' })
  assert.equal(accessor.FIRST, ciphertext)
  const proxy = new Proxy({ TOKEN: ciphertext }, { defineProperty: () => assert.fail('Proxy trap must not run') })
  assert.throws(() => resolveEnv(proxy, { inPlace: true }), { code: 'INVALID_ENV_TARGET' })
})

test('commands require explicit opt-in and ignore an environment toggle', () => {
  const env = { TOKEN: '$(must-not-run)', RESENV_COMMANDS: 'true' }
  assert.deepEqual({ ...resolveEnv(env) }, env)
})
