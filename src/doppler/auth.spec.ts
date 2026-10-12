import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'vitest'
import { ResenvError } from '../errors.js'
import type { Environment } from '../types.js'
import { isRecord } from '../values.js'
import { credential, login } from './auth.js'
import type { Request, RequestOptions } from './http.js'
import type { CredentialSystem } from './system.js'

const token = 'dp.ct.dummy0123456789'
const failure = (code: string) => new ResenvError(code, 'Dummy failure')
const challenge = { code: 'dummy_human_code', polling_code: 'dummy_poll_code', auth_url: 'https://dashboard.doppler.com/workplace/auth/cli' }
const manifest: unknown = createRequire(import.meta.url)('@ciqol/resenv/package.json')
assert.ok(isRecord(manifest) && typeof manifest.version === 'string')
const { version } = manifest

type LoginDependencies = NonNullable<Parameters<typeof login>[1]>
type Event = readonly ['write' | 'browser' | 'output', string] | readonly ['cli'] | readonly ['request', string, RequestOptions | undefined]

function loginFixture (overrides: Partial<Omit<LoginDependencies, 'system'>> = {}) {
  const events: Event[] = []
  const system: CredentialSystem = {
    remove: () => assert.fail('unexpected credential deletion'),
    canStore: true, read: () => undefined,
    write: value => events.push(['write', value]),
    cliLogin: () => events.push(['cli']), cliToken: () => token,
    openBrowser: url => { events.push(['browser', url]); return true }
  }
  let polls = 0
  const request: Request = (path, options) => Promise.resolve().then(() => {
    events.push(['request', path, options])
    if (path.startsWith('/v3/auth/cli/generate/2?')) {
      assert.equal(new URLSearchParams(path.split('?')[1] || '').get('version'), `v${version}`)
      return challenge
    }
    assert.equal(path, '/v3/auth/cli/authorize')
    assert.equal(options?.body?.code, challenge.polling_code)
    return polls++ === 0 ? null : { token }
  })
  return { events, deps: { system, request, interactive: true, env: <Readonly<Environment>>{}, sleep: () => Promise.resolve().then(() => {}), output: (text: string) => events.push(['output', text]), ...overrides } }
}

test('credential selection uses explicit identity, then keyring, then CLI', async () => {
  const calls: string[] = []
  const system: Pick<CredentialSystem, 'read' | 'cliToken'> = { read: () => { calls.push('keyring'); return token }, cliToken: () => { calls.push('cli'); return token } }
  assert.equal(await credential({ DOPPLER_TOKEN: token }, system), token)
  assert.deepEqual(calls, [])
  await assert.rejects(credential({ DOPPLER_TOKEN: '' }, system), { code: 'DOPPLER_INVALID_TOKEN' })
  assert.deepEqual(calls, [])
  assert.equal(await credential({}, system), token)
  assert.deepEqual(calls, ['keyring'])
  system.read = () => undefined
  assert.equal(await credential({}, system), token)
  assert.deepEqual(calls, ['keyring', 'cli'])
  system.read = () => { throw failure('DOPPLER_KEYRING_UNAVAILABLE') }
  assert.equal(await credential({}, system), token)
  system.cliToken = () => undefined
  await assert.rejects(credential({}, system), { code: 'DOPPLER_AUTH_REQUIRED' })
})

test('native login polls, opens only Doppler and saves without exposing its token', async () => {
  const { events, deps } = loginFixture()
  assert.equal(await login({}, deps), 'native')
  assert.equal(events.filter(([kind]) => kind === 'cli').length, 0)
  assert.deepEqual(events.find(([kind]) => kind === 'write'), ['write', token])
  assert.deepEqual(events.find(([kind]) => kind === 'browser'), ['browser', challenge.auth_url])
  const output = events.filter(([kind]) => kind === 'output').map(([, value]) => value).join('\n')
  assert.ok(output.includes(challenge.code))
  assert.ok(!output.includes(token) && !output.includes(challenge.polling_code))
})

test('login CLI fallback is limited to unavailable native support or explicit selection', async () => {
  for (const reason of ['store', 'endpoint', 'explicit']) {
    const { events, deps } = loginFixture()
    if (reason === 'store') deps.system.canStore = false
    if (reason === 'endpoint') deps.request = () => Promise.resolve().then(() => { throw failure('DOPPLER_ENDPOINT_UNAVAILABLE') })
    assert.equal(await login({ cli: reason === 'explicit' }, deps), 'cli')
    assert.equal(events.filter(([kind]) => kind === 'cli').length, 1)
    assert.equal(events.filter(([kind]) => kind === 'browser').length, 0)
  }
  for (const code of ['DOPPLER_ACCESS_DENIED', 'DOPPLER_AUTH_REQUIRED', 'DOPPLER_REQUEST_FAILED']) {
    const { events, deps } = loginFixture({ request: () => Promise.resolve().then(() => { throw failure(code) }) })
    await assert.rejects(login({}, deps), { code })
    assert.equal(events.filter(([kind]) => kind === 'cli').length, 0)
  }
})

test('login refuses unattended sessions and explicit credential overrides', async () => {
  for (const [options, code] of <readonly (readonly [Partial<LoginDependencies>, string])[]>[[{ interactive: false }, 'DOPPLER_INTERACTIVE_REQUIRED'], [{ interactive: true, env: { CI: 'true' } }, 'DOPPLER_INTERACTIVE_REQUIRED'], [{ env: { DOPPLER_TOKEN: token } }, 'DOPPLER_TOKEN_OVERRIDE']]) {
    const { events, deps } = loginFixture(options)
    await assert.rejects(login({}, deps), { code })
    assert.deepEqual(events, [])
  }
})

test('invalid authorization URLs cannot launch a browser or trigger CLI fallback', async () => {
  for (const auth_url of ['http://dashboard.doppler.com/workplace/auth/cli', 'https://example.invalid/auth', 'https://user@dashboard.doppler.com/workplace/auth/cli', 'https://dashboard.doppler.com/elsewhere']) {
    const { events, deps } = loginFixture({ request: () => Promise.resolve().then(() => ({ ...challenge, auth_url })) })
    await assert.rejects(login({}, deps), { code: 'DOPPLER_INVALID_RESPONSE' })
    assert.deepEqual(events, [])
  }
})

test('login can suppress browser opening, times out and revokes when persistence fails', async () => {
  const fixture = loginFixture()
  assert.equal(await login({ noBrowser: true }, fixture.deps), 'native')
  assert.equal(fixture.events.filter(([kind]) => kind === 'browser').length, 0)
  let clock = 0
  const timed = loginFixture({ now: () => { clock += 300001; return clock } })
  await assert.rejects(login({}, timed.deps), { code: 'DOPPLER_LOGIN_TIMEOUT' })
  const failed = loginFixture()
  failed.deps.system.write = () => { throw failure('DOPPLER_KEYRING_UNAVAILABLE') }
  const requests: (readonly [string, RequestOptions | undefined])[] = []
  failed.deps.request = (path, options) => Promise.resolve().then(() => {
    requests.push([path, options])
    return path.includes('generate') ? challenge : { token }
  })
  await assert.rejects(login({}, failed.deps), { code: 'DOPPLER_KEYRING_UNAVAILABLE' })
  assert.deepEqual(requests.at(-1), ['/v3/auth/revoke', { token, body: { token } }])
})

test('failed login revocation reports safe errors without retaining provider details', async () => {
  for (const err of [failure('DOPPLER_REQUEST_FAILED'), new Error('dummy-sensitive-revocation-detail')]) {
    const { deps } = loginFixture()
    deps.system.write = () => { throw failure('DOPPLER_KEYRING_UNAVAILABLE') }
    deps.request = path => Promise.resolve().then(() => {
      if (path.includes('generate')) return challenge
      if (path.includes('authorize')) return { token }
      throw err
    })
    await assert.rejects(login({}, deps), (thrown: unknown) => {
      assert.ok(thrown instanceof ResenvError)
      assert.equal(thrown.code, 'DOPPLER_KEYRING_UNAVAILABLE')
      assert.ok(!thrown.stack?.includes('dummy-sensitive'))
      assert.equal(thrown.cause, undefined)
      return true
    })
  }
})

test('credential validation failures never fall back to another saved identity', async () => {
  for (const code of ['DOPPLER_INVALID_TOKEN', 'DOPPLER_ACCESS_DENIED']) {
    const err = failure(code)
    let cliCalls = 0
    await assert.rejects(credential({}, {
      read: () => { throw err },
      cliToken: () => { cliCalls++; return token }
    }), (thrown: unknown) => thrown === err)
    assert.equal(cliCalls, 0)
  }
})

test('an unavailable keyring falls back before creating a browser authorization session', async () => {
  const { deps, events } = loginFixture()
  let saved = 'dp.ct.older0123456789'
  let unavailable = true
  deps.system.read = () => {
    if (unavailable) throw failure('DOPPLER_KEYRING_UNAVAILABLE')
    return saved
  }
  deps.system.write = value => { saved = value }
  assert.equal(await login({}, deps), 'cli')
  unavailable = false
  assert.equal(await credential({}, deps.system), token)
  assert.deepEqual(events.map(([kind]) => kind), ['output', 'cli', 'output'])
  unavailable = true
  deps.system.write = () => { throw failure('DOPPLER_KEYRING_UNAVAILABLE') }
  events.length = 0
  await assert.rejects(login({}, deps), { code: 'DOPPLER_KEYRING_UNAVAILABLE' })
  assert.deepEqual(events.map(([kind]) => kind), ['output', 'cli'])
  deps.system.read = () => { throw failure('DOPPLER_INVALID_TOKEN') }
  events.length = 0
  await assert.rejects(login({}, deps), { code: 'DOPPLER_INVALID_TOKEN' })
  assert.deepEqual(events, [])
})

test('CLI fallback replaces an older saved identity and reports persistence failures safely', async () => {
  const { deps, events } = loginFixture()
  deps.system.read = () => 'dp.ct.older0123456789'
  assert.equal(await login({ cli: true }, deps), 'cli')
  assert.deepEqual(events.filter(([kind]) => ['cli', 'write'].includes(kind)), [['cli'], ['write', token]])
  for (const reason of ['write', 'token']) {
    const failed = loginFixture()
    if (reason === 'write') failed.deps.system.write = () => { throw new Error('dummy-sensitive-storage-detail') }
    else failed.deps.system.cliToken = () => undefined
    await assert.rejects(login({ cli: true }, failed.deps), (err: unknown) => {
      assert.ok(err instanceof ResenvError)
      assert.equal(err.code, 'DOPPLER_KEYRING_UNAVAILABLE')
      assert.ok(!err.stack?.includes('dummy-sensitive'))
      assert.equal(err.cause, undefined)
      return true
    })
    assert.ok(!failed.events.some(([kind, text]) => kind === 'output' && text.startsWith('Done:')))
  }
})

test('malformed authorization codes fail before display, browser launch or polling', async () => {
  for (const response of [null, {}, { ...challenge, code: 'short' }, { ...challenge, code: 'dummy\nsensitive-code' }, { ...challenge, polling_code: '' }, { ...challenge, polling_code: 'x'.repeat(513) }, { ...challenge, auth_url: 'not a URL' }]) {
    const { deps, events } = loginFixture({ request: () => Promise.resolve().then(() => response) })
    await assert.rejects(login({}, deps), { code: 'DOPPLER_INVALID_RESPONSE' })
    assert.deepEqual(events, [])
  }
})

test('an invalid issued token is not saved or reported as a successful login', async () => {
  const { deps, events } = loginFixture({ request: path => Promise.resolve().then(() => path.includes('generate') ? challenge : { token: 'dummy-sensitive-malformed-token' }) })
  await assert.rejects(login({}, deps), { code: 'DOPPLER_INVALID_TOKEN' })
  assert.ok(!events.some(([kind]) => kind === 'write'))
  assert.ok(!events.some(([kind, text]) => kind === 'output' && (text.includes('dummy-sensitive') || text.startsWith('Done:'))))
})
