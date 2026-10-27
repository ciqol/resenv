import { spawnSync } from 'node:child_process'
import type { SpawnSyncOptionsWithStringEncoding, SpawnSyncReturns } from 'node:child_process'
import { existsSync } from 'node:fs'
import { userInfo } from 'node:os'
import { join, win32 } from 'node:path'
import { ResenvError } from '../errors.js'
import { assertSafeDiagnostics } from '../assert-safe-diagnostics.js'
import type { Environment } from '../types.js'
import { validateToken } from './http.js'

// Node's sync implementation accepts detached, which its declarations omit.
type SyncOptions = SpawnSyncOptionsWithStringEncoding & { readonly detached?: boolean }

export type SyncRunner = (file: string, args: readonly string[], options: SyncOptions) => SpawnSyncReturns<string>

type SystemOptions = {
  readonly platform?: NodeJS.Platform
  readonly home?: string
  readonly run?: SyncRunner
  readonly exists?: typeof existsSync
}

export type CredentialSystem = ReturnType<typeof createSystem>

// Do not pass application secrets, loader variables or a repository's PATH to
// the worker or CLI. Keep only the OS session needed by Doppler's own storage.
function helperEnvironment ({ platform = process.platform, home = userInfo().homedir }: Pick<SystemOptions, 'platform' | 'home'> = {}): Environment {
  const env: Environment = { HOME: home, PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' }
  for (const key of ['SystemRoot', 'DBUS_SESSION_BUS_ADDRESS', 'XDG_RUNTIME_DIR', 'DISPLAY', 'WAYLAND_DISPLAY']) {
    if (process.env[key]) env[key] = process.env[key]
  }
  if (platform === 'win32') {
    env.USERPROFILE = home
    env.APPDATA = win32.join(home, 'AppData', 'Roaming')
    env.LOCALAPPDATA = win32.join(home, 'AppData', 'Local')
    env.PATH = win32.join(process.env.SystemRoot || 'C:\\Windows', 'System32')
  }
  return env
}

function createSystem ({ platform = process.platform, home = userInfo().homedir, run = spawnSync, exists = existsSync }: SystemOptions = {}) {
  // Use standard installation locations so npm's repository-local PATH cannot
  // substitute a credential helper. Windows locations cover WinGet and Scoop.
  const paths = platform === 'win32'
    ? [win32.join(home, 'AppData', 'Local', 'Microsoft', 'WinGet', 'Links', 'doppler.exe'), win32.join(home, 'scoop', 'apps', 'doppler', 'current', 'doppler.exe')]
    : ['/opt/homebrew/bin/doppler', '/usr/local/bin/doppler', '/usr/bin/doppler', join(home, '.local', 'bin', 'doppler'), join(home, 'bin', 'doppler')]

  function cliToken () {
    assertSafeDiagnostics()
    const cli = paths.find(exists)
    if (!cli) throw new ResenvError('DOPPLER_CLI_UNAVAILABLE', 'Install the Doppler CLI in a standard location and run doppler login, or supply DOPPLER_TOKEN. See https://docs.doppler.com/docs/cli.')
    const result = run(cli, ['configure', 'get', 'token', '--plain', '--no-check-version', '--no-read-env'], {
      env: helperEnvironment({ platform, home }), encoding: 'utf8', timeout: 15000,
      maxBuffer: 16384, stdio: ['pipe', 'pipe', 'pipe'], shell: false
    })
    if (result.error || result.status !== 0 || !result.stdout.trim()) return undefined
    return validateToken(result.stdout.trim())
  }

  return { cliToken }
}

export { createSystem, helperEnvironment }
