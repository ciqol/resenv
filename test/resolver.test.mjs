import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PrivateKey, encrypt, ECIES_CONFIG } from 'eciesjs'
import { EnvrefError, resolveEnv, resolveEnvInPlace, formatError } from '../dist/index.mjs'

function fixture (plaintext = 'dummy-value') {
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
  assert.equal(resolveEnvInPlace(env), env)
  assert.equal(env.FIRST, 'first')
  assert.equal(env.SECOND, 'second')
  assert.equal(resolveEnvInPlace(env), env)
})

test('missing, invalid and wrong keys fail with safe errors', () => {
  const { ciphertext } = fixture('private-dummy-plaintext')
  for (const [key, code] of [[undefined, 'MISSING_PRIVATE_KEY'], ['invalid-dummy-key', 'INVALID_PRIVATE_KEY'], [new PrivateKey().toHex(), 'DECRYPTION_FAILED']]) {
    assert.throws(() => resolveEnv({ TOKEN: ciphertext, DOTENV_PRIVATE_KEY: key }), error => {
      assert.ok(error instanceof EnvrefError)
      assert.equal(error.code, code)
      const report = `${formatError(error)}\n${error.stack}`
      assert.ok(!report.includes(ciphertext))
      assert.ok(!report.includes('private-dummy-plaintext'))
      if (key) assert.ok(!report.includes(key))
      assert.equal(error.cause, undefined)
      return true
    })
  }
  assert.equal(formatError(new Error('sensitive underlying failure')), '[envref] STARTUP_FAILED: Environment resolution failed.')
})

test('malformed and tampered ciphertext abort before mutating any values', () => {
  const { privateKey, ciphertext } = fixture()
  const tampered = Buffer.from(ciphertext.slice('encrypted:'.length), 'base64')
  tampered[tampered.length - 1] ^= 1
  for (const invalid of ['encrypted:', 'encrypted:abc', `${ciphertext}\n`, `encrypted:${tampered.toString('base64')}`]) {
    const env = { FIRST: ciphertext, SECOND: invalid, DOTENV_PRIVATE_KEY: privateKey }
    const original = { ...env }
    assert.throws(() => resolveEnvInPlace(env), EnvrefError)
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
  const env = JSON.parse(JSON.stringify({ DOTENV_PRIVATE_KEY: privateKey }))
  Object.defineProperty(env, '__proto__', { value: ciphertext, enumerable: true, writable: true, configurable: true })
  resolveEnvInPlace(env)
  assert.equal(env.__proto__, 'dummy-value')
  assert.equal(Object.getPrototypeOf(env), Object.prototype)
})

test('decrypted strings are literal values and are not recursively resolved', () => {
  const { privateKey, ciphertext } = fixture('encrypted:literal-application-value')
  assert.equal(resolveEnv({ TOKEN: ciphertext, DOTENV_PRIVATE_KEY: privateKey }).TOKEN, 'encrypted:literal-application-value')
})
