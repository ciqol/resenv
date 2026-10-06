import assert from 'node:assert/strict'
import type { SpawnSyncReturns } from 'node:child_process'
import { test } from 'vitest'
import { afterEach, vi } from 'vitest'
import { ResenvError } from '../errors.js'
import type { Environment } from '../types.js'
import { resolveDopplerSync as resolveSync } from './bridge.js'
import { resolveReferences } from './resolve.js'
import type { SyncRunner } from './system.js'

const token = 'dp.ct.dummy0123456789'
const env = { TOKEN: 'doppler://my-app/dev/API_KEY', DOPPLER_TOKEN: token }

afterEach(() => vi.restoreAllMocks())

function resolveDopplerSync (input: Readonly<Environment>, run: (...args: Parameters<SyncRunner>) => Partial<SpawnSyncReturns<string>>) {
  return resolveSync(input, (...args) => ({ pid: 0, output: [], stdout: '', stderr: '', status: 0, signal: null, ...run(...args) }))
}

test('synchronous bridge sends only references and credential through private stdin', () => {
  const values = resolveDopplerSync({ ...env, UNRELATED: 'dummy-secret' }, (file, args, options) => {
    assert.equal(file, process.execPath)
    assert.ok(args[0]?.endsWith('dist/doppler-worker.cjs'))
    assert.ok(typeof options.input === 'string')
    assert.deepEqual(JSON.parse(options.input), env)
    assert.equal(options.env?.DOPPLER_TOKEN, undefined)
    assert.equal(options.env?.UNRELATED, undefined)
    assert.equal(options.env?.NODE_OPTIONS, undefined)
    return { status: 0, stdout: JSON.stringify({ values: { TOKEN: 'dummy-result' } }) }
  })
  assert.equal(values.TOKEN, 'dummy-result')
  assert.throws(() => resolveDopplerSync(env, () => ({ status: 1, stdout: token, stderr: token })), (err: unknown) => err instanceof ResenvError && err.code === 'DOPPLER_RESOLUTION_FAILED' && !err.message.includes(token))
})

test('worker cleanup distinguishes an exited process group from an unexpected failure', () => {
  let code = 'ESRCH'
  vi.spyOn(process, 'kill').mockImplementation(() => { throw Object.assign(new Error('dummy-sensitive-cleanup-detail'), { code }) })
  const run = () => ({ error: new Error('dummy-sensitive-spawn-detail'), pid: 123 })
  assert.throws(() => resolveDopplerSync(env, run), (err: unknown) => err instanceof ResenvError && err.code === 'DOPPLER_RESOLUTION_FAILED' && /startup time/.test(err.message))
  code = 'EPERM'
  assert.throws(() => resolveDopplerSync(env, run), (err: unknown) => {
    assert.ok(err instanceof ResenvError)
    assert.equal(err.code, 'DOPPLER_RESOLUTION_FAILED')
    assert.match(err.message, /Could not stop/)
    assert.ok(!err.stack?.includes('dummy-sensitive'))
    return true
  })
})

test('empty cloud resolution skips credentials, requests and worker startup', async () => {
  const input = { TOKEN: 'literal', DOPPLER_TOKEN: 'unused-malformed-token' }
  const unexpected = () => assert.fail('no cloud work should be attempted')
  const values = await resolveReferences(input, { getCredential: unexpected, request: unexpected })
  assert.deepEqual(Object.keys(values), [])
  assert.equal(Object.getPrototypeOf(values), null)
  assert.deepEqual(Object.keys(resolveDopplerSync(input, unexpected)), [])
})

test('worker responses must match every requested name with string values', () => {
  const input = { ...env, SECOND: 'doppler://my-app/dev/SECOND' }
  for (const response of [null, [], {}, { values: [] }, { values: { TOKEN: 'dummy-result' } }, { values: { TOKEN: 'dummy-result', UNREQUESTED: 'dummy-result' } }, { values: { TOKEN: 'dummy-result', SECOND: 'dummy-result', EXTRA: 'dummy-result' } }, { values: { TOKEN: 'dummy-result', SECOND: null } }, { values: { TOKEN: 'dummy-result', SECOND: 'dummy\0result' } }]) {
    assert.throws(() => resolveDopplerSync(input, () => ({ status: 0, stdout: JSON.stringify(response) })), { code: 'DOPPLER_RESOLUTION_FAILED' })
  }
  assert.throws(() => resolveDopplerSync(env, () => ({ status: 0, stdout: 'not JSON' })), { code: 'DOPPLER_RESOLUTION_FAILED' })
  assert.throws(() => resolveDopplerSync(env, () => ({ status: 1, stdout: JSON.stringify({ values: { TOKEN: 'dummy-result' } }) })), { code: 'DOPPLER_RESOLUTION_FAILED' })
})

test('worker failures preserve valid provider error codes and reject malformed error envelopes', () => {
  const message = 'Dummy access denied'
  assert.throws(() => resolveDopplerSync(env, () => ({ status: 1, stdout: JSON.stringify({ error: { code: 'DOPPLER_ACCESS_DENIED', message } }) })), { code: 'DOPPLER_ACCESS_DENIED', message })
  for (const err of [null, [], { code: 'OTHER_ERROR', message: token }, { code: 'DOPPLER_bad', message: token }, { code: 'DOPPLER_ACCESS_DENIED', message: 1 }, { code: 1, message: token }]) {
    assert.throws(() => resolveDopplerSync(env, () => ({ status: 1, stdout: JSON.stringify({ error: err }), stderr: token })), (err: unknown) => {
      assert.ok(err instanceof ResenvError)
      assert.equal(err.code, 'DOPPLER_RESOLUTION_FAILED')
      assert.ok(!err.stack?.includes(token))
      return true
    })
  }
})
