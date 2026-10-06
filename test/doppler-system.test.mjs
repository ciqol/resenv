import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSystem } from '../dist/doppler/system.cjs'

const token = 'dp.ct.dummy0123456789'
const otherToken = 'dp.ct.other0123456789'
const failure = { status: 1, stdout: token, stderr: 'dummy-sensitive-helper-detail' }
const success = { status: 0, stdout: '', stderr: '' }

function fixture (platform, results, available = () => true) {
  const calls = []
  const system = createSystem({ platform, exists: available, run: (file, args, options) => {
    calls.push({ file, args, options })
    assert.ok(results.length > 0, 'unexpected helper invocation')
    return results.shift()
  } })
  return { system, calls }
}

function unavailable (action) {
  assert.throws(action, err => {
    assert.equal(err.code, 'DOPPLER_KEYRING_UNAVAILABLE')
    assert.ok(!err.stack.includes(token))
    assert.ok(!err.stack.includes('dummy-sensitive'))
    assert.equal(err.cause, undefined)
    return true
  })
}

test('an unsupported or missing credential store never invokes a helper', () => {
  for (const platform of ['win32', 'darwin', 'linux']) {
    const { system, calls } = fixture(platform, [], () => false)
    assert.equal(system.canStore, false)
    assert.equal(system.read(), undefined)
    unavailable(() => system.write(token))
    unavailable(() => system.remove())
    assert.deepEqual(calls, [])
  }
})

test('credential lookup distinguishes missing entries from helper failures', () => {
  for (const platform of ['darwin', 'linux']) {
    const missing = { ...success, status: platform === 'darwin' ? 44 : 1 }
    assert.equal(fixture(platform, [missing]).system.read(), undefined)
    for (const result of [failure, { ...missing, error: new Error('dummy-sensitive-spawn-detail') }, { ...success, status: null, signal: 'SIGTERM' }]) {
      unavailable(() => fixture(platform, [result]).system.read())
    }
    assert.equal(fixture(platform, [{ ...success, stdout: ` ${token}\n` }]).system.read(), token)
    assert.throws(() => fixture(platform, [{ ...success, stdout: 'dummy-malformed-token' }]).system.read(), { code: 'DOPPLER_INVALID_TOKEN' })
  }
  unavailable(() => fixture('linux', [{ ...success, status: 1, stderr: 'dummy-sensitive-locked-store' }]).system.read())
})

test('credential writes require a successful write and matching readback', () => {
  for (const platform of ['darwin', 'linux']) {
    for (const result of [failure, { ...success, error: new Error('dummy-sensitive-spawn-detail') }]) {
      const { system, calls } = fixture(platform, [result])
      unavailable(() => system.write(token))
      assert.equal(calls.length, 1)
    }
    for (const stdout of [otherToken, '']) {
      const readback = stdout ? { ...success, stdout } : { ...success, status: platform === 'darwin' ? 44 : 1 }
      const { system, calls } = fixture(platform, [success, readback])
      unavailable(() => system.write(token))
      assert.equal(calls.length, 2)
    }
    const { system, calls } = fixture(platform, [])
    assert.throws(() => system.write(`${token}\nhelp`), { code: 'DOPPLER_INVALID_TOKEN' })
    assert.deepEqual(calls, [])
  }
})

test('credential deletion accepts an absent macOS entry and rejects other failures', () => {
  for (const platform of ['darwin', 'linux']) {
    const { system, calls } = fixture(platform, [success])
    system.remove()
    assert.ok(calls[0].args.includes(platform === 'darwin' ? 'delete-generic-password' : 'clear'))
    for (const result of [failure, { ...success, error: new Error('dummy-sensitive-spawn-detail') }]) {
      unavailable(() => fixture(platform, [result]).system.remove())
    }
  }
  fixture('darwin', [{ ...success, status: 44 }]).system.remove()
  unavailable(() => fixture('linux', [{ ...success, status: 1 }]).system.remove())
})

test('CLI credentials use the first installed absolute path and validate successful output', () => {
  const paths = ['/opt/homebrew/bin/doppler', '/usr/local/bin/doppler', '/usr/bin/doppler']
  for (let index = 0; index < paths.length; index++) {
    const { system, calls } = fixture('win32', [{ ...success, stdout: ` ${token}\n` }], file => paths.slice(index).includes(file))
    assert.equal(system.cliToken(), token)
    assert.equal(calls[0].file, paths[index])
    assert.deepEqual(calls[0].args, ['configure', 'get', 'token', '--plain'])
  }
  for (const result of [failure, { ...success, stdout: ' \n' }, { ...success, error: new Error('dummy-sensitive-spawn-detail') }]) {
    assert.equal(fixture('linux', [result]).system.cliToken(), undefined)
  }
  assert.throws(() => fixture('linux', [{ ...success, stdout: 'dummy-malformed-token' }]).system.cliToken(), { code: 'DOPPLER_INVALID_TOKEN' })
})

test('CLI login inherits terminal IO and must leave a usable credential', () => {
  const { system, calls } = fixture('linux', [success, { ...success, stdout: token }])
  system.cliLogin()
  assert.deepEqual(calls[0].args, ['login'])
  assert.equal(calls[0].options.stdio, 'inherit')
  assert.equal(calls[0].options.timeout, 300000)
  assert.equal(calls[1].options.timeout, 15000)
  for (const result of [failure, { ...success, error: new Error('dummy-sensitive-spawn-detail') }]) {
    const failed = fixture('linux', [result])
    assert.throws(() => failed.system.cliLogin(), { code: 'DOPPLER_LOGIN_FAILED' })
    assert.equal(failed.calls.length, 1)
  }
  assert.throws(() => fixture('linux', [success, success]).system.cliLogin(), { code: 'DOPPLER_LOGIN_FAILED' })
})

test('browser launching uses fixed executables and reports missing or failed openers', () => {
  const url = 'https://dashboard.doppler.com/workplace/auth/cli'
  for (const platform of ['darwin', 'linux']) {
    const { system, calls } = fixture(platform, [success])
    assert.equal(system.openBrowser(url), true)
    assert.equal(calls[0].file, platform === 'darwin' ? '/usr/bin/open' : '/usr/bin/xdg-open')
    assert.deepEqual(calls[0].args, [url])
    assert.equal(calls[0].options.shell, false)
    for (const result of [failure, { ...success, error: new Error('dummy-sensitive-spawn-detail') }]) {
      assert.equal(fixture(platform, [result]).system.openBrowser(url), false)
    }
    const absent = fixture(platform, [], file => !file.endsWith('open'))
    assert.equal(absent.system.openBrowser(url), false)
    assert.deepEqual(absent.calls, [])
  }
})
