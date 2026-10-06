import assert from 'node:assert/strict'
import { test } from 'vitest'
import { ResenvError } from '../errors.js'
import { createClient as createHttpClient, validateToken } from './http.js'

const token = 'dp.ct.dummy0123456789'
const challenge = { polling_code: 'dummy_poll_code' }

function createClient (fetchImpl: (url: URL, options: RequestInit) => Promise<unknown>) {
  return createHttpClient(async (url, options) => {
    assert.ok(url instanceof URL)
    assert.ok(options)
    // Test doubles deliberately include malformed response shapes.
    return await fetchImpl(url, options) as Response
  })
}

test('tokens cannot inject headers or the credential helper interpreter', () => {
  for (const value of [undefined, '', `${token}\nhelp`, `${token};help`, '$(command)', 'dp.ct.short', `${token} ${token}`]) {
    assert.throws(() => validateToken(value), { code: 'DOPPLER_INVALID_TOKEN' })
  }
  assert.equal(validateToken(token), token)
})

test('HTTPS uses Doppler only, blocks redirects and sends authorization in headers', async () => {
  const client = createClient((url, options) => Promise.resolve().then(() => {
    assert.equal(url.origin, 'https://api.doppler.com')
    assert.equal(options.redirect, 'error')
    assert.equal(new Headers(options.headers).get('authorization'), `Bearer ${token}`)
    assert.ok(options.signal instanceof AbortSignal)
    assert.ok(!url.href.includes(token))
    return new Response(JSON.stringify({ value: { computed: 'dummy-value' } }))
  }))
  assert.deepEqual(await client('/v3/configs/config/secret?name=KEY', { token }), { value: { computed: 'dummy-value' } })
})

test('HTTPS failures discard provider messages and bound responses', async () => {
  for (const [status, code] of <readonly (readonly [number, string])[]>[[401, 'DOPPLER_AUTH_REQUIRED'], [403, 'DOPPLER_ACCESS_DENIED'], [404, 'DOPPLER_ENDPOINT_UNAVAILABLE'], [429, 'DOPPLER_REQUEST_FAILED'], [500, 'DOPPLER_REQUEST_FAILED']]) {
    const client = createClient(() => Promise.resolve().then(() => new Response('dummy-sensitive-provider-body', { status })))
    await assert.rejects(client('/v3/me', { token }), (err: unknown) => err instanceof ResenvError && err.code === code && !err.message.includes('sensitive'))
  }
  const pending = createClient(() => Promise.resolve().then(() => new Response('', { status: 409 })))
  assert.equal(await pending('/v3/auth/cli/authorize', { pending: true }), null)
  for (const value of ['not-json', JSON.stringify({ success: false, error: 'dummy-sensitive' }), 'x'.repeat(1048577)]) {
    await assert.rejects(createClient(() => Promise.resolve().then(() => new Response(value)))('/v3/me'), (err: unknown) => err instanceof ResenvError && !err.message.includes('dummy-sensitive') && err.code.startsWith('DOPPLER_'))
  }
  await assert.rejects(createClient(() => Promise.resolve().then(() => { throw new Error('dummy-sensitive-network-error') }))('/v3/me'), (err: unknown) => err instanceof ResenvError && !err.message.includes('sensitive'))
})

test('HTTPS rejects malformed UTF-8 instead of changing a secret', async () => {
  const body = Buffer.concat([Buffer.from('{"value":{"computed":"'), Buffer.from([0xff]), Buffer.from('"}}')])
  await assert.rejects(createClient(() => Promise.resolve().then(() => new Response(body)))('/v3/me'), { code: 'DOPPLER_INVALID_RESPONSE' })
})

test('HTTPS rejects missing or non-byte response bodies with a safe error', async () => {
  for (const body of [null, { async * [Symbol.asyncIterator] () { yield await Promise.resolve('dummy-sensitive-response') } }]) {
    const request = createClient(() => Promise.resolve().then(() => ({ ok: true, status: 200, body })))
    await assert.rejects(request('/v3/me'), (err: unknown) => {
      assert.ok(err instanceof ResenvError)
      assert.equal(err.code, 'DOPPLER_INVALID_RESPONSE')
      assert.ok(!err.stack?.includes('dummy-sensitive'))
      return true
    })
  }
})

test('HTTPS cancels rejected bodies and treats 409 as pending only during authorization', async () => {
  for (const [status, code] of <readonly (readonly [number, string])[]>[[401, 'DOPPLER_AUTH_REQUIRED'], [403, 'DOPPLER_ACCESS_DENIED'], [404, 'DOPPLER_ENDPOINT_UNAVAILABLE'], [405, 'DOPPLER_ENDPOINT_UNAVAILABLE'], [409, 'DOPPLER_REQUEST_FAILED'], [501, 'DOPPLER_ENDPOINT_UNAVAILABLE']]) {
    let cancelled = 0
    const request = createClient(() => Promise.resolve().then(() => ({ status, ok: false, body: { cancel: () => Promise.resolve().then(() => { cancelled++ }) } })))
    await assert.rejects(request('/v3/me'), { code })
    assert.equal(cancelled, 1)
  }
  let cancelled = 0
  const pending = createClient(() => Promise.resolve().then(() => ({ status: 409, body: { cancel: () => Promise.resolve().then(() => { cancelled++ }) } })))
  assert.equal(await pending('/v3/auth/cli/authorize', { pending: true }), null)
  assert.equal(cancelled, 1)
})

test('HTTPS encodes POST bodies and decodes UTF-8 split across response chunks', async () => {
  const bytes = Buffer.from(JSON.stringify({ value: { computed: 'dummy-🌍' } }))
  const split = bytes.indexOf(Buffer.from('🌍')) + 1
  const request = createClient((url, options) => Promise.resolve().then(() => {
    assert.equal(url.origin, 'https://api.doppler.com')
    assert.equal(options.method, 'POST')
    assert.equal(new Headers(options.headers).get('authorization'), null)
    assert.ok(typeof options.body === 'string')
    assert.deepEqual(JSON.parse(options.body), { code: challenge.polling_code })
    return { status: 200, ok: true, body: { async * [Symbol.asyncIterator] () { yield await Promise.resolve(bytes.subarray(0, split)); yield await Promise.resolve(bytes.subarray(split)) } } }
  }))
  assert.deepEqual(await request('/v3/auth/cli/authorize', { body: { code: challenge.polling_code } }), { value: { computed: 'dummy-🌍' } })
  for (const response of ['null', '[]', 'true', '"dummy-sensitive-value"', '{"error":"dummy-sensitive-detail"}']) {
    await assert.rejects(createClient(() => Promise.resolve().then(() => new Response(response)))('/v3/me'), (err: unknown) => {
      assert.ok(err instanceof ResenvError)
      assert.equal(err.code, 'DOPPLER_INVALID_RESPONSE')
      assert.ok(!err.stack?.includes('dummy-sensitive'))
      return true
    })
  }
})
