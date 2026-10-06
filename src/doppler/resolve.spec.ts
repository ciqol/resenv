import assert from 'node:assert/strict'
import { test } from 'vitest'
import { ResenvError } from '../errors.js'
import { resolveReferences } from './resolve.js'

const token = 'dp.ct.dummy0123456789'
const env = { TOKEN: 'doppler://my-app/dev/API_KEY', DOPPLER_TOKEN: token }
const failure = (code: string) => new ResenvError(code, 'Dummy failure')

test('API resolution fetches only named secrets, deduplicates and preserves literal outputs', async () => {
  const paths: string[] = []
  const input = { ...env, AGAIN: env.TOKEN, PLAIN: 'keep' }
  const values = await resolveReferences(input, { request: (path, options) => Promise.resolve().then(() => {
    assert.equal(options?.token, token)
    paths.push(path)
    return { value: { computed: '$(must-not-run)\nencrypted:literal' } }
  }) })
  assert.equal(paths.length, 1)
  const query = new URLSearchParams(paths[0]?.split('?')[1])
  assert.equal(query.get('name'), 'API_KEY')
  assert.equal(query.get('project'), 'my-app')
  assert.equal(query.get('config'), 'dev')
  assert.equal(values.TOKEN, '$(must-not-run)\nencrypted:literal')
  assert.equal(values.AGAIN, values.TOKEN)
  assert.equal(values.PLAIN, undefined)
  assert.equal(input.TOKEN, env.TOKEN)
})

test('API resolution validates all references before credentials and rejects missing values', async () => {
  let accessed = false
  await assert.rejects(resolveReferences({ ...env, BAD: 'doppler://invalid' }, { getCredential: () => Promise.resolve().then(() => { accessed = true; return token }) }), { code: 'DOPPLER_INVALID_REFERENCE' })
  assert.equal(accessed, false)
  for (const value of [undefined, null, {}, { computed: null }, { computed: 'a\0b' }, { computed: '\ud800' }, { computed: '\udc00' }, { computed: 'x'.repeat(65537) }]) {
    await assert.rejects(resolveReferences(env, { request: () => Promise.resolve().then(() => ({ value })) }), { code: 'DOPPLER_INVALID_VALUE' })
  }
  const result = await resolveReferences(env, { request: () => Promise.resolve().then(() => ({ value: { computed: '' } })) })
  assert.equal(result.TOKEN, '')
})

test('API failures never retry using another credential or expose partial results', async () => {
  const input = { ...env, SECOND: 'doppler://my-app/dev/SECOND' }
  let credentials = 0
  let requests = 0
  await assert.rejects(resolveReferences(input, {
    getCredential: () => Promise.resolve().then(() => { credentials++; return token }),
    request: () => Promise.resolve().then(() => {
      if (++requests === 2) throw failure('DOPPLER_ACCESS_DENIED')
      return { value: { computed: 'dummy-secret' } }
    })
  }), { code: 'DOPPLER_ACCESS_DENIED' })
  assert.equal(credentials, 1)
  assert.equal(input.TOKEN, env.TOKEN)
})

test('API resolution overlaps four unique lookups and shares results for duplicates', async () => {
  const input = Object.fromEntries(Array.from({ length: 16 }, (_, i) => [`KEY_${i}`, `doppler://dummy/dev/KEY_${i % 8}`]))
  const pending: (() => void)[] = []
  let calls = 0
  let credentials = 0
  const result = resolveReferences(input, {
    getCredential: () => Promise.resolve().then(() => { credentials++; return token }),
    request: async () => {
      calls++
      await new Promise<void>(resolve => pending.push(resolve))
      return { value: { computed: 'dummy-value' } }
    }
  })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(calls, 4)
  for (const release of pending.splice(0)) release()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(calls, 8)
  assert.equal(pending.length, 4)
  for (const release of pending.splice(0)) release()
  const values = await result
  assert.equal(credentials, 1)
  assert.equal(Object.keys(values).length, 16)
  assert.ok(Object.values(values).every(value => value === 'dummy-value'))
})

test('a failed parallel lookup stops new requests and waits for active ones', async () => {
  const input = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`KEY_${i}`, `doppler://dummy/dev/KEY_${i}`]))
  const pending: { readonly resolve: (value: Record<string, unknown>) => void; readonly reject: (err: unknown) => void }[] = []
  let calls = 0
  let settled = false
  const result = resolveReferences(input, {
    getCredential: () => Promise.resolve().then(() => token),
    request: () => { calls++; return new Promise((resolve, reject) => pending.push({ resolve, reject })) }
  })
  const rejection = assert.rejects(result, { code: 'DOPPLER_ACCESS_DENIED' }).then(() => { settled = true })
  await new Promise(resolve => setImmediate(resolve))
  pending.shift()?.reject(failure('DOPPLER_ACCESS_DENIED'))
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(settled, false)
  for (const task of pending) task.resolve({ value: { computed: 'dummy' } })
  await rejection
  assert.equal(calls, 4)
  assert.equal(input.KEY_0, 'doppler://dummy/dev/KEY_0')
})

test('cloud secret limits count UTF-8 bytes and accept the exact limit', async () => {
  const value = '🌍'.repeat(16384)
  assert.equal((await resolveReferences(env, { request: () => Promise.resolve().then(() => ({ value: { computed: value } })) })).TOKEN, value)
  await assert.rejects(resolveReferences(env, { request: () => Promise.resolve().then(() => ({ value: { computed: `${value}a` } })) }), { code: 'DOPPLER_INVALID_VALUE' })
})
