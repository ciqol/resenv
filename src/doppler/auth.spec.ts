import assert from 'node:assert/strict'
import { test } from 'vitest'
import { ResenvError } from '../errors.js'
import { credential } from './auth.js'

const token = 'dp.ct.dummy0123456789'

test('explicit credentials bypass CLI discovery and are never replaced when invalid', async () => {
  const system = { cliToken: () => assert.fail('CLI must not run') }
  assert.equal(await credential({ DOPPLER_TOKEN: token }, system), token)
  for (const value of ['', 'dummy-sensitive-invalid']) {
    await assert.rejects(credential({ DOPPLER_TOKEN: value }, system), { code: 'DOPPLER_INVALID_TOKEN' })
  }
})

test('runtime uses the existing CLI identity without managing its lifecycle', async () => {
  let calls = 0
  assert.equal(await credential({}, { cliToken: () => { calls++; return token } }), token)
  assert.equal(calls, 1)
  await assert.rejects(credential({}, { cliToken: () => undefined }), (err: unknown) => {
    assert.ok(err instanceof ResenvError)
    assert.equal(err.code, 'DOPPLER_AUTH_REQUIRED')
    assert.match(err.message, /doppler login/)
    return true
  })
})

test('CLI discovery and validation failures propagate without selecting another identity', async () => {
  for (const code of ['DOPPLER_CLI_UNAVAILABLE', 'DOPPLER_INVALID_TOKEN']) {
    const err = new ResenvError(code, 'Dummy failure')
    await assert.rejects(credential({}, { cliToken: () => { throw err } }), (thrown: unknown) => thrown === err)
  }
})
