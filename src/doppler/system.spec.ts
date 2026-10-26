import assert from 'node:assert/strict'
import type { SpawnSyncReturns } from 'node:child_process'
import { userInfo } from 'node:os'
import { join, win32 } from 'node:path'
import { afterEach, test, vi } from 'vitest'
import { ResenvError } from '../errors.js'
import { createSystem, helperEnvironment } from './system.js'
import type { SyncRunner } from './system.js'

const token = 'dp.ct.dummy0123456789'
const success = { status: 0, stdout: ` ${token}\n`, stderr: '' }

afterEach(() => vi.unstubAllEnvs())

function fixture (platform: NodeJS.Platform, result: Partial<SpawnSyncReturns<string>>, available: (path: string) => boolean = () => true) {
  const calls: { readonly file: string; readonly args: readonly string[]; readonly options: Parameters<SyncRunner>[2] }[] = []
  const home = platform === 'win32' ? 'C:\\Users\\dummy' : '/home/dummy'
  const system = createSystem({ platform, home, exists: path => available(String(path)), run: (file, args, options) => {
    calls.push({ file, args, options })
    return { pid: 0, output: [], stdout: '', stderr: '', status: 0, signal: null, ...result }
  } })
  return { system, calls, home }
}

test('CLI lookup is read-only, noninteractive, bounded and excludes application secrets', () => {
  vi.stubEnv('DOPPLER_TOKEN', 'dummy-sensitive-app-token')
  vi.stubEnv('DOPPLER_CONFIG_DIR', '/dummy/untrusted')
  vi.stubEnv('NODE_OPTIONS', '--dummy-sensitive-loader')
  vi.stubEnv('PATH', '/dummy/repository/node_modules/.bin')
  for (const platform of ['darwin', 'linux', 'win32'] as const) {
    const { system, calls } = fixture(platform, success)
    assert.equal(system.cliToken(), token)
    assert.equal(calls.length, 1)
    const call = calls[0]
    assert.ok(call)
    assert.deepEqual(call.args, ['configure', 'get', 'token', '--plain', '--no-check-version', '--no-read-env'])
    assert.equal(call.options.shell, false)
    assert.equal(call.options.timeout, 15000)
    assert.equal(call.options.maxBuffer, 16384)
    assert.deepEqual(call.options.stdio, ['pipe', 'pipe', 'pipe'])
    assert.equal(call.options.input, undefined)
    for (const key of ['DOPPLER_TOKEN', 'DOPPLER_CONFIG_DIR', 'NODE_OPTIONS']) assert.equal(call.options.env?.[key], undefined)
    assert.ok(!JSON.stringify(call.options.env).includes('/dummy/repository'))
    assert.ok(!call.args.join(' ').includes(token))
  }
})

test('CLI discovery supports standard macOS, Linux, WinGet and Scoop installations', () => {
  const home = '/home/dummy'
  const windowsHome = 'C:\\Users\\dummy'
  for (const [platform, paths] of <readonly (readonly [NodeJS.Platform, string[]])[]>[
    ['darwin', ['/opt/homebrew/bin/doppler', '/usr/local/bin/doppler', '/usr/bin/doppler', join(home, '.local/bin/doppler'), join(home, 'bin/doppler')]],
    ['linux', ['/opt/homebrew/bin/doppler', '/usr/local/bin/doppler', '/usr/bin/doppler', join(home, '.local/bin/doppler'), join(home, 'bin/doppler')]],
    ['win32', [win32.join(windowsHome, 'AppData/Local/Microsoft/WinGet/Links/doppler.exe'), win32.join(windowsHome, 'scoop/apps/doppler/current/doppler.exe')]]
  ]) {
    for (let index = 0; index < paths.length; index++) {
      const { system, calls } = fixture(platform, success, path => paths.slice(index).includes(path))
      assert.equal(system.cliToken(), token)
      assert.equal(calls[0]?.file, paths[index])
    }
  }
})

test('missing CLI fails with installation guidance without invoking another executable', () => {
  for (const platform of ['darwin', 'linux', 'win32'] as const) {
    const { system, calls } = fixture(platform, success, () => false)
    assert.throws(() => system.cliToken(), (err: unknown) => {
      assert.ok(err instanceof ResenvError)
      assert.equal(err.code, 'DOPPLER_CLI_UNAVAILABLE')
      assert.match(err.message, /Install the Doppler CLI/)
      assert.match(err.message, /doppler login/)
      return true
    })
    assert.deepEqual(calls, [])
  }
})

test('failed, timed out and empty CLI lookups discard all captured details', () => {
  for (const result of [
    { ...success, status: 1, stderr: 'dummy-sensitive-helper-detail' },
    { ...success, error: new Error('dummy-sensitive-spawn-detail') },
    { ...success, status: null, signal: 'SIGTERM' as const },
    { ...success, stdout: ' \n' }
  ]) {
    const { system, calls } = fixture('linux', result)
    assert.equal(system.cliToken(), undefined)
    assert.equal(calls.length, 1)
  }
  assert.throws(() => fixture('linux', { ...success, stdout: 'dummy-sensitive-malformed-token' }).system.cliToken(), (err: unknown) => {
    assert.ok(err instanceof ResenvError)
    assert.equal(err.code, 'DOPPLER_INVALID_TOKEN')
    assert.ok(!err.stack?.includes('dummy-sensitive'))
    assert.equal(err.cause, undefined)
    return true
  })
})

test('helper environment uses the OS home and preserves only required session settings', () => {
  vi.stubEnv('HOME', '/dummy/repository')
  vi.stubEnv('DBUS_SESSION_BUS_ADDRESS', 'dummy-bus')
  vi.stubEnv('XDG_RUNTIME_DIR', '/dummy/runtime')
  const env = helperEnvironment()
  assert.equal(env.HOME, userInfo().homedir)
  assert.equal(env.DBUS_SESSION_BUS_ADDRESS, 'dummy-bus')
  assert.equal(env.XDG_RUNTIME_DIR, '/dummy/runtime')
  const windowsHome = 'C:\\Users\\dummy'
  vi.stubEnv('SystemRoot', 'C:\\Windows')
  const windows = helperEnvironment({ platform: 'win32', home: windowsHome })
  assert.equal(windows.USERPROFILE, windowsHome)
  assert.equal(windows.APPDATA, 'C:\\Users\\dummy\\AppData\\Roaming')
  assert.equal(windows.LOCALAPPDATA, 'C:\\Users\\dummy\\AppData\\Local')
  assert.equal(windows.PATH, 'C:\\Windows\\System32')
  vi.stubEnv('SystemRoot', '')
  assert.equal(helperEnvironment({ platform: 'win32', home: windowsHome }).PATH, 'C:\\Windows\\System32')
})
