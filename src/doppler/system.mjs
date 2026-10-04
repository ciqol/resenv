import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { userInfo } from 'node:os'
import { ResenvError } from '../errors.mjs'
import { validateToken } from './http.mjs'

// Preserve saved logins from before the package rename.
const SERVICE = 'ciqol.envref.doppler'
const ACCOUNT = 'default'

// Do not pass application secrets, NODE_OPTIONS, loader variables or a
// repository's PATH to credential helpers. No helper is invoked via a shell.
function helperEnvironment () {
  const env = { HOME: userInfo().homedir, PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' }
  for (const key of ['SystemRoot', 'USERPROFILE', 'DBUS_SESSION_BUS_ADDRESS', 'XDG_RUNTIME_DIR', 'DISPLAY', 'WAYLAND_DISPLAY']) {
    if (process.env[key]) env[key] = process.env[key]
  }
  return env
}

function createSystem ({ platform = process.platform, run = spawnSync, exists = existsSync } = {}) {
  const invoke = (file, args, options = {}) => run(file, args, {
    env: helperEnvironment(), encoding: 'utf8', timeout: 15000,
    maxBuffer: 16384, stdio: ['pipe', 'pipe', 'pipe'], shell: false, ...options
  })
  const mac = platform === 'darwin' && exists('/usr/bin/security')
  const linux = platform === 'linux' && exists('/usr/bin/secret-tool')
  const cli = ['/opt/homebrew/bin/doppler', '/usr/local/bin/doppler', '/usr/bin/doppler'].find(exists)
  const unavailable = () => new ResenvError('DOPPLER_KEYRING_UNAVAILABLE', 'The OS credential store is unavailable. Use the Doppler CLI or supply DOPPLER_TOKEN.')

  function read () {
    if (!mac && !linux) return undefined
    const result = mac
      ? invoke('/usr/bin/security', ['find-generic-password', '-s', SERVICE, '-a', ACCOUNT, '-w'])
      : invoke('/usr/bin/secret-tool', ['lookup', 'service', SERVICE, 'account', ACCOUNT])
    if (!result.error && result.status === 0) return validateToken(result.stdout.trim())
    if (!result.error && ((mac && result.status === 44) || (linux && result.status === 1 && !result.stderr))) return undefined
    throw unavailable()
  }

  function write (token) {
    validateToken(token)
    if (!mac && !linux) throw unavailable()
    // security's interactive interpreter receives the token on stdin, never
    // the OS process argument list. The token alphabet excludes separators.
    const result = mac
      ? invoke('/usr/bin/security', ['-i'], { input: `add-generic-password -U -s ${SERVICE} -a ${ACCOUNT} -w ${token}\n` })
      : invoke('/usr/bin/secret-tool', ['store', '--label=resenv Doppler', 'service', SERVICE, 'account', ACCOUNT], { input: token })
    if (result.error || result.status !== 0) throw unavailable()
    // security -i may report a subcommand failure with a zero process status.
    if (read() !== token) throw unavailable()
  }

  function remove () {
    if (!mac && !linux) throw unavailable()
    const result = mac
      ? invoke('/usr/bin/security', ['delete-generic-password', '-s', SERVICE, '-a', ACCOUNT])
      : invoke('/usr/bin/secret-tool', ['clear', 'service', SERVICE, 'account', ACCOUNT])
    if (result.error || (result.status !== 0 && !(mac && result.status === 44))) throw unavailable()
  }

  function cliToken () {
    if (!cli) return undefined
    const result = invoke(cli, ['configure', 'get', 'token', '--plain'])
    if (result.error || result.status !== 0 || !result.stdout.trim()) return undefined
    return validateToken(result.stdout.trim())
  }

  function cliLogin () {
    if (!cli) throw new ResenvError('DOPPLER_CLI_UNAVAILABLE', 'Doppler CLI fallback is unavailable. Install Doppler or supply DOPPLER_TOKEN.')
    const result = invoke(cli, ['login'], { stdio: 'inherit', timeout: 300000 })
    if (result.error || result.status !== 0) throw new ResenvError('DOPPLER_LOGIN_FAILED', 'Doppler CLI login did not complete.')
    if (!cliToken()) throw new ResenvError('DOPPLER_LOGIN_FAILED', 'Doppler CLI login did not provide a credential.')
  }

  function openBrowser (url) {
    const file = mac ? '/usr/bin/open' : '/usr/bin/xdg-open'
    if (!exists(file)) return false
    const result = invoke(file, [url])
    return !result.error && result.status === 0
  }

  return { read, write, remove, cliToken, cliLogin, openBrowser, canStore: mac || linux }
}

export { createSystem, helperEnvironment }
