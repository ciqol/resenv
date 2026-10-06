import assert from 'node:assert/strict'
import type { SpawnSyncReturns } from 'node:child_process'
import { test } from 'vitest'
import { ResenvError } from '../errors.js'
import { createSystem } from './system.js'
import type { SyncRunner } from './system.js'

const token = 'dp.ct.dummy0123456789'

const otherToken = 'dp.ct.other0123456789'
const failure = { status: 1, stdout: token, stderr: 'dummy-sensitive-helper-detail' }
const success = { status: 0, stdout: '', stderr: '' }

function fixture (platform: NodeJS.Platform, results: Partial<SpawnSyncReturns<string>>[], available: (path: string) => boolean = () => true) {
  const calls: { readonly file: string; readonly args: readonly string[]; readonly options: Parameters<SyncRunner>[2] }[] = []
  const system = createSystem({ platform, exists: path => available(String(path)), run: (file, args, options) => {
    calls.push({ file, args, options })
    assert.ok(results.length > 0, 'unexpected helper invocation')
    return { pid: 0, output: [], stdout: '', stderr: '', status: 0, signal: null, ...results.shift() }
  } })
  return { system, calls }
}

function unavailable (action: () => void) {
  assert.throws(action, (err: unknown) => {
    assert.ok(err instanceof ResenvError)
    assert.equal(err.code, 'DOPPLER_KEYRING_UNAVAILABLE')
    assert.ok(!err.stack?.includes(token))
    assert.ok(!err.stack?.includes('dummy-sensitive'))
    assert.equal(err.cause, undefined)
    return true
  })
}

test('OS credential helpers keep tokens out of argv and inherited application environment', () => {
  for (const platform of ['darwin', 'linux'] as const) {
    const calls: { readonly file: string; readonly args: readonly string[]; readonly options: Parameters<SyncRunner>[2] }[] = []
    let saved: string | undefined
    const system = createSystem({ platform, exists: () => true, run: (file, args, options) => {
      calls.push({ file, args, options })
      if (options.input) saved = token
      const reading = args.includes('find-generic-password') || args.includes('lookup')
      return { pid: 0, output: [], signal: null, status: reading && !saved ? (platform === 'darwin' ? 44 : 1) : 0, stdout: reading && saved ? `${saved}\n` : '', stderr: '' }
    } })
    assert.equal(system.read(), undefined)
    system.write(token)
    assert.equal(system.read(), token)
    assert.ok(calls.some(({ options }) => typeof options.input === 'string' && options.input.includes(token)))
    for (const { args, options } of calls) {
      assert.ok(!args.join(' ').includes(token))
      assert.equal(options.shell, false)
      assert.equal(options.env?.DOPPLER_TOKEN, undefined)
      assert.equal(options.env?.NODE_OPTIONS, undefined)
    }
    assert.equal(system.canStore, true)
  }
})

test('credential helper errors are safe and missing CLIs produce actionable errors', () => {
  const absent = createSystem({ platform: 'win32', exists: () => false })
  assert.equal(absent.canStore, false)
  assert.equal(absent.cliToken(), undefined)
  assert.throws(() => absent.cliLogin(), { code: 'DOPPLER_CLI_UNAVAILABLE' })
  const broken = createSystem({ platform: 'darwin', exists: () => true, run: () => ({ pid: 0, output: [], signal: null, status: 1, stdout: token, stderr: 'dummy-secret' }) })
  assert.throws(() => broken.read(), (err: unknown) => err instanceof ResenvError && err.code === 'DOPPLER_KEYRING_UNAVAILABLE' && !err.message.includes('dummy-secret'))
})

test('an unsupported or missing credential store never invokes a helper', () => {
  for (const platform of ['win32', 'darwin', 'linux'] as const) {
    const { system, calls } = fixture(platform, [], () => false)
    assert.equal(system.canStore, false)
    assert.equal(system.read(), undefined)
    unavailable(() => system.write(token))
    unavailable(() => system.remove())
    assert.deepEqual(calls, [])
  }
})

test('credential lookup distinguishes missing entries from helper failures', () => {
  for (const platform of ['darwin', 'linux'] as const) {
    const missing = { ...success, status: platform === 'darwin' ? 44 : 1 }
    assert.equal(fixture(platform, [missing]).system.read(), undefined)
    for (const result of [failure, { ...missing, error: new Error('dummy-sensitive-spawn-detail') }, { ...success, status: null, signal: 'SIGTERM' as const }]) {
      unavailable(() => fixture(platform, [result]).system.read())
    }
    assert.equal(fixture(platform, [{ ...success, stdout: ` ${token}\n` }]).system.read(), token)
    assert.throws(() => fixture(platform, [{ ...success, stdout: 'dummy-malformed-token' }]).system.read(), { code: 'DOPPLER_INVALID_TOKEN' })
  }
  unavailable(() => fixture('linux', [{ ...success, status: 1, stderr: 'dummy-sensitive-locked-store' }]).system.read())
})

test('credential writes require a successful write and matching readback', () => {
  for (const platform of ['darwin', 'linux'] as const) {
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
  for (const platform of ['darwin', 'linux'] as const) {
    const { system, calls } = fixture(platform, [success])
    system.remove()
    assert.ok(calls.at(0)?.args.includes(platform === 'darwin' ? 'delete-generic-password' : 'clear'))
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
    assert.equal(calls.at(0)?.file, paths[index])
    assert.deepEqual(calls.at(0)?.args, ['configure', 'get', 'token', '--plain'])
  }
  for (const result of [failure, { ...success, stdout: ' \n' }, { ...success, error: new Error('dummy-sensitive-spawn-detail') }]) {
    assert.equal(fixture('linux', [result]).system.cliToken(), undefined)
  }
  assert.throws(() => fixture('linux', [{ ...success, stdout: 'dummy-malformed-token' }]).system.cliToken(), { code: 'DOPPLER_INVALID_TOKEN' })
})

test('CLI login inherits terminal IO and must leave a usable credential', () => {
  const { system, calls } = fixture('linux', [success, { ...success, stdout: token }])
  system.cliLogin()
  assert.deepEqual(calls.at(0)?.args, ['login'])
  assert.equal(calls.at(0)?.options.stdio, 'inherit')
  assert.equal(calls.at(0)?.options.timeout, 300000)
  assert.equal(calls.at(1)?.options.timeout, 15000)
  for (const result of [failure, { ...success, error: new Error('dummy-sensitive-spawn-detail') }]) {
    const failed = fixture('linux', [result])
    assert.throws(() => failed.system.cliLogin(), { code: 'DOPPLER_LOGIN_FAILED' })
    assert.equal(failed.calls.length, 1)
  }
  assert.throws(() => fixture('linux', [success, success]).system.cliLogin(), { code: 'DOPPLER_LOGIN_FAILED' })
})

test('browser launching uses fixed executables and reports missing or failed openers', () => {
  const url = 'https://dashboard.doppler.com/workplace/auth/cli'
  for (const platform of ['darwin', 'linux'] as const) {
    const { system, calls } = fixture(platform, [success])
    assert.equal(system.openBrowser(url), true)
    assert.equal(calls.at(0)?.file, platform === 'darwin' ? '/usr/bin/open' : '/usr/bin/xdg-open')
    assert.deepEqual(calls.at(0)?.args, [url])
    assert.equal(calls.at(0)?.options.shell, false)
    for (const result of [failure, { ...success, error: new Error('dummy-sensitive-spawn-detail') }]) {
      assert.equal(fixture(platform, [result]).system.openBrowser(url), false)
    }
    const absent = fixture(platform, [], file => !file.endsWith('open'))
    assert.equal(absent.system.openBrowser(url), false)
    assert.deepEqual(absent.calls, [])
  }
})
