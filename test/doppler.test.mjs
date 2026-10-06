import assert from 'node:assert/strict'
import { test } from 'node:test'
import { references } from '../src/doppler/references.mjs'
import { createClient, validateToken } from '../src/doppler/http.mjs'
import { credential, login } from '../src/doppler/auth.mjs'
import { createSystem } from '../src/doppler/system.mjs'
import { resolveReferences } from '../src/doppler/resolve.mjs'
import { resolveDopplerSync } from '../src/doppler/bridge.mjs'
import { ResenvError } from '../src/errors.mjs'

const token = 'dp.ct.dummy0123456789'
const challenge = { code: 'dummy_human_code', polling_code: 'dummy_poll_code', auth_url: 'https://dashboard.doppler.com/workplace/auth/cli' }
const env = { TOKEN: 'doppler://my-app/dev/API_KEY', DOPPLER_TOKEN: token }
const failure = code => new ResenvError(code, 'Dummy failure')

function loginFixture (overrides = {}) {
  const events = []
  const system = {
    canStore: true, read: () => undefined,
    write: value => events.push(['write', value]),
    cliLogin: () => events.push(['cli']), cliToken: () => token,
    openBrowser: url => events.push(['browser', url])
  }
  let polls = 0
  const request = async (path, options) => {
    events.push(['request', path, options])
    if (path.startsWith('/v3/auth/cli/generate/2?')) {
      assert.match(new URLSearchParams(path.split('?')[1]).get('version'), /^v\d+\.\d+\.\d+$/)
      return challenge
    }
    assert.equal(path, '/v3/auth/cli/authorize')
    assert.equal(options.body.code, challenge.polling_code)
    return polls++ === 0 ? null : { token }
  }
  return { events, deps: { system, request, interactive: true, env: {}, sleep: async () => {}, output: text => events.push(['output', text]), ...overrides } }
}

test('Doppler reference grammar rejects executable text and ambiguous selectors', () => {
  for (const value of ['doppler://UPPER/dev/KEY', 'doppler://p/dev/KEY?host=elsewhere', 'doppler://p/dev/KEY#other', 'doppler://p/../KEY', 'doppler://p/dev/$(echo bad)', 'doppler://user@p/dev/KEY', 'doppler://p:443/dev/KEY', 'doppler://p/dev/%00', 'doppler://p/dev/%ZZ']) {
    assert.throws(() => references({ TOKEN: value }), { code: 'DOPPLER_INVALID_REFERENCE' })
  }
  assert.deepEqual(references({ PLAIN: 'literal', TOKEN: 'doppler://p/dev/payments%2Fapi.key' }), [
    { name: 'TOKEN', project: 'p', config: 'dev', key: 'payments/api.key' }
  ])
  assert.throws(() => references(Object.fromEntries(Array.from({ length: 129 }, (_, index) => [`KEY${index}`, env.TOKEN]))), { code: 'DOPPLER_TOO_MANY_REFERENCES' })
})

test('credential selection uses explicit identity, then keyring, then CLI', async () => {
  const calls = []
  const system = { read: () => { calls.push('keyring'); return token }, cliToken: () => { calls.push('cli'); return token } }
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

test('tokens cannot inject headers or the credential helper interpreter', () => {
  for (const value of [undefined, '', `${token}\nhelp`, `${token};help`, '$(command)', 'dp.ct.short', `${token} ${token}`]) {
    assert.throws(() => validateToken(value), { code: 'DOPPLER_INVALID_TOKEN' })
  }
  assert.equal(validateToken(token), token)
})

test('HTTPS uses Doppler only, blocks redirects and sends authorization in headers', async () => {
  const client = createClient(async (url, options) => {
    assert.equal(url.origin, 'https://api.doppler.com')
    assert.equal(options.redirect, 'error')
    assert.equal(options.headers.authorization, `Bearer ${token}`)
    assert.ok(options.signal instanceof AbortSignal)
    assert.ok(!url.href.includes(token))
    return new Response(JSON.stringify({ value: { computed: 'dummy-value' } }))
  })
  assert.equal((await client('/v3/configs/config/secret?name=KEY', { token })).value.computed, 'dummy-value')
})

test('HTTPS failures discard provider messages and bound responses', async () => {
  for (const [status, code] of [[401, 'DOPPLER_AUTH_REQUIRED'], [403, 'DOPPLER_ACCESS_DENIED'], [404, 'DOPPLER_ENDPOINT_UNAVAILABLE'], [429, 'DOPPLER_REQUEST_FAILED'], [500, 'DOPPLER_REQUEST_FAILED']]) {
    const client = createClient(async () => new Response('dummy-sensitive-provider-body', { status }))
    await assert.rejects(client('/v3/me', { token }), error => error.code === code && !error.message.includes('sensitive'))
  }
  const pending = createClient(async () => new Response('', { status: 409 }))
  assert.equal(await pending('/v3/auth/cli/authorize', { pending: true }), null)
  for (const value of ['not-json', JSON.stringify({ success: false, error: 'dummy-sensitive' }), 'x'.repeat(1048577)]) {
    await assert.rejects(createClient(async () => new Response(value))('/v3/me'), error => !error.message.includes('dummy-sensitive') && error.code.startsWith('DOPPLER_'))
  }
  await assert.rejects(createClient(async () => { throw new Error('dummy-sensitive-network-error') })('/v3/me'), error => !error.message.includes('sensitive'))
})

test('HTTPS rejects malformed UTF-8 instead of changing a secret', async () => {
  const body = Buffer.concat([Buffer.from('{"value":{"computed":"'), Buffer.from([0xff]), Buffer.from('"}}')])
  await assert.rejects(createClient(async () => new Response(body))('/v3/me'), { code: 'DOPPLER_INVALID_RESPONSE' })
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
    if (reason === 'endpoint') deps.request = async () => { throw failure('DOPPLER_ENDPOINT_UNAVAILABLE') }
    assert.equal(await login({ cli: reason === 'explicit' }, deps), 'cli')
    assert.equal(events.filter(([kind]) => kind === 'cli').length, 1)
    assert.equal(events.filter(([kind]) => kind === 'browser').length, 0)
  }
  for (const code of ['DOPPLER_ACCESS_DENIED', 'DOPPLER_AUTH_REQUIRED', 'DOPPLER_REQUEST_FAILED']) {
    const { events, deps } = loginFixture({ request: async () => { throw failure(code) } })
    await assert.rejects(login({}, deps), { code })
    assert.equal(events.filter(([kind]) => kind === 'cli').length, 0)
  }
})

test('login refuses unattended sessions and explicit credential overrides', async () => {
  for (const [options, code] of [[{ interactive: false }, 'DOPPLER_INTERACTIVE_REQUIRED'], [{ interactive: true, env: { CI: 'true' } }, 'DOPPLER_INTERACTIVE_REQUIRED'], [{ env: { DOPPLER_TOKEN: token } }, 'DOPPLER_TOKEN_OVERRIDE']]) {
    const { events, deps } = loginFixture(options)
    await assert.rejects(login({}, deps), { code })
    assert.deepEqual(events, [])
  }
})

test('invalid authorization URLs cannot launch a browser or trigger CLI fallback', async () => {
  for (const auth_url of ['http://dashboard.doppler.com/workplace/auth/cli', 'https://example.invalid/auth', 'https://user@dashboard.doppler.com/workplace/auth/cli', 'https://dashboard.doppler.com/elsewhere']) {
    const { events, deps } = loginFixture({ request: async () => ({ ...challenge, auth_url }) })
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
  const requests = []
  failed.deps.request = async (path, options) => {
    requests.push([path, options])
    return path.includes('generate') ? challenge : { token }
  }
  await assert.rejects(login({}, failed.deps), { code: 'DOPPLER_KEYRING_UNAVAILABLE' })
  assert.deepEqual(requests.at(-1), ['/v3/auth/revoke', { token, body: { token } }])
})

test('OS credential helpers keep tokens out of argv and inherited application environment', () => {
  for (const platform of ['darwin', 'linux']) {
    const calls = []
    let saved
    const system = createSystem({ platform, exists: () => true, run: (file, args, options) => {
      calls.push({ file, args, options })
      if (options.input) saved = token
      const reading = args.includes('find-generic-password') || args.includes('lookup')
      return { status: reading && !saved ? (platform === 'darwin' ? 44 : 1) : 0, stdout: reading && saved ? `${saved}\n` : '', stderr: '' }
    } })
    assert.equal(system.read(), undefined)
    system.write(token)
    assert.equal(system.read(), token)
    assert.ok(calls.some(({ options }) => options.input?.includes(token)))
    for (const { args, options } of calls) {
      assert.ok(!args.join(' ').includes(token))
      assert.equal(options.shell, false)
      assert.equal(options.env.DOPPLER_TOKEN, undefined)
      assert.equal(options.env.NODE_OPTIONS, undefined)
    }
    assert.equal(system.canStore, true)
  }
})

test('credential helper errors are safe and missing CLIs produce actionable errors', () => {
  const absent = createSystem({ platform: 'win32', exists: () => false })
  assert.equal(absent.canStore, false)
  assert.equal(absent.cliToken(), undefined)
  assert.throws(() => absent.cliLogin(), { code: 'DOPPLER_CLI_UNAVAILABLE' })
  const broken = createSystem({ platform: 'darwin', exists: () => true, run: () => ({ status: 1, stdout: token, stderr: 'dummy-secret' }) })
  assert.throws(() => broken.read(), error => error.code === 'DOPPLER_KEYRING_UNAVAILABLE' && !error.message.includes('dummy-secret'))
})

test('API resolution fetches only named secrets, deduplicates and preserves literal outputs', async () => {
  const paths = []
  const input = { ...env, AGAIN: env.TOKEN, PLAIN: 'keep' }
  const values = await resolveReferences(input, { request: async (path, options) => {
    assert.equal(options.token, token)
    paths.push(path)
    return { value: { computed: '$(must-not-run)\nencrypted:literal' } }
  } })
  assert.equal(paths.length, 1)
  const query = new URLSearchParams(paths[0].split('?')[1])
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
  await assert.rejects(resolveReferences({ ...env, BAD: 'doppler://invalid' }, { getCredential: async () => { accessed = true } }), { code: 'DOPPLER_INVALID_REFERENCE' })
  assert.equal(accessed, false)
  for (const value of [undefined, null, {}, { computed: null }, { computed: 'a\0b' }, { computed: '\ud800' }, { computed: '\udc00' }, { computed: 'x'.repeat(65537) }]) {
    await assert.rejects(resolveReferences(env, { request: async () => ({ value }) }), { code: 'DOPPLER_INVALID_VALUE' })
  }
  const result = await resolveReferences(env, { request: async () => ({ value: { computed: '' } }) })
  assert.equal(result.TOKEN, '')
})

test('API failures never retry using another credential or expose partial results', async () => {
  const input = { ...env, SECOND: 'doppler://my-app/dev/SECOND' }
  let credentials = 0
  let requests = 0
  await assert.rejects(resolveReferences(input, {
    getCredential: async () => { credentials++; return token },
    request: async () => {
      if (++requests === 2) throw failure('DOPPLER_ACCESS_DENIED')
      return { value: { computed: 'dummy-secret' } }
    }
  }), { code: 'DOPPLER_ACCESS_DENIED' })
  assert.equal(credentials, 1)
  assert.equal(input.TOKEN, env.TOKEN)
})

test('API resolution overlaps four unique lookups and shares results for duplicates', async () => {
  const input = Object.fromEntries(Array.from({ length: 16 }, (_, i) => [`KEY_${i}`, `doppler://dummy/dev/KEY_${i % 8}`]))
  const pending = []
  let calls = 0
  let credentials = 0
  const result = resolveReferences(input, {
    getCredential: async () => { credentials++; return token },
    request: async () => {
      calls++
      await new Promise(resolve => pending.push(resolve))
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
  const pending = []
  let calls = 0
  let settled = false
  const result = resolveReferences(input, {
    getCredential: async () => token,
    request: () => { calls++; return new Promise((resolve, reject) => pending.push({ resolve, reject })) }
  })
  const rejection = assert.rejects(result, { code: 'DOPPLER_ACCESS_DENIED' }).then(() => { settled = true })
  await new Promise(resolve => setImmediate(resolve))
  pending.shift().reject(failure('DOPPLER_ACCESS_DENIED'))
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(settled, false)
  for (const task of pending) task.resolve({ value: { computed: 'dummy' } })
  await rejection
  assert.equal(calls, 4)
  assert.equal(input.KEY_0, 'doppler://dummy/dev/KEY_0')
})

test('synchronous bridge sends only references and credential through private stdin', () => {
  const values = resolveDopplerSync({ ...env, UNRELATED: 'dummy-secret' }, (file, args, options) => {
    assert.equal(file, process.execPath)
    assert.ok(args[0].endsWith('dist/doppler-worker.cjs'))
    assert.deepEqual(JSON.parse(options.input), env)
    assert.equal(options.env.DOPPLER_TOKEN, undefined)
    assert.equal(options.env.UNRELATED, undefined)
    assert.equal(options.env.NODE_OPTIONS, undefined)
    return { status: 0, stdout: JSON.stringify({ values: { TOKEN: 'dummy-result' } }) }
  })
  assert.equal(values.TOKEN, 'dummy-result')
  assert.throws(() => resolveDopplerSync(env, () => ({ status: 1, stdout: token, stderr: token })), error => error.code === 'DOPPLER_RESOLUTION_FAILED' && !error.message.includes(token))
})
