import { setTimeout as delay } from 'node:timers/promises'
import { createRequire } from 'node:module'
import { ResenvError } from '../errors.js'
import type { Environment } from '../types.js'
import { hasErrorCode, isRecord } from '../values.js'
import { createClient, validateToken } from './http.js'
import type { Request } from './http.js'
import { createSystem } from './system.js'
import type { CredentialSystem } from './system.js'

type LoginOptions = {
  readonly cli?: boolean
  readonly noBrowser?: boolean
}

type LoginDependencies = {
  readonly request?: Request
  readonly system?: CredentialSystem
  readonly output?: (text: string) => void
  readonly interactive?: boolean
  readonly env?: Readonly<Environment>
  readonly sleep?: (ms: number) => Promise<unknown>
  readonly now?: () => number
}

const manifest: unknown = createRequire(import.meta.url)('@ciqol/resenv/package.json')
if (!isRecord(manifest) || typeof manifest.version !== 'string') throw new Error('Invalid package version')
const { version } = manifest

function credential (env: Readonly<Environment>, system: Pick<CredentialSystem, 'read' | 'cliToken'> = createSystem()): Promise<string> {
  return Promise.resolve().then(() => {
    // An explicitly selected identity is never replaced after an API rejection.
    if (env.DOPPLER_TOKEN !== undefined) return validateToken(env.DOPPLER_TOKEN)
    let saved
    try { saved = system.read() } catch (err) {
      if (!hasErrorCode(err, 'DOPPLER_KEYRING_UNAVAILABLE')) throw err
    }
    if (saved) return saved
    const token = system.cliToken()
    if (token) return token
    throw new ResenvError('DOPPLER_AUTH_REQUIRED', 'Run resenv login doppler, or supply DOPPLER_TOKEN. Startup never opens a login prompt.')
  })
}

async function login ({ cli = false, noBrowser = false }: LoginOptions = {}, {
  request = createClient(), system = createSystem(),
  output = text => process.stderr.write(`${text}\n`),
  interactive = Boolean(process.stdin.isTTY && process.stderr.isTTY),
  env = process.env, sleep = delay, now = Date.now
}: LoginDependencies = {}): Promise<'cli' | 'native'> {
  if (!interactive || env.CI) throw new ResenvError('DOPPLER_INTERACTIVE_REQUIRED', 'Login requires an interactive local terminal outside CI. Supply DOPPLER_TOKEN for unattended runs.')
  if (env.DOPPLER_TOKEN !== undefined) throw new ResenvError('DOPPLER_TOKEN_OVERRIDE', 'Unset DOPPLER_TOKEN before logging in; it overrides saved credentials.')
  const fallback = (): 'cli' => {
    output('Using Doppler CLI login.')
    system.cliLogin()
    if (system.canStore) {
      // Keep the identity chosen by this login ahead of an older resenv token.
      try { system.write(validateToken(system.cliToken())) } catch {
        throw new ResenvError('DOPPLER_KEYRING_UNAVAILABLE', 'CLI login completed, but resenv could not update its saved credential. Unlock the credential store and retry.')
      }
    }
    output('Done: Doppler CLI login completed.')
    return 'cli'
  }
  if (cli || !system.canStore) return fallback()
  // Check keyring access before creating an authorization session.
  try { system.read() } catch (err) {
    if (!hasErrorCode(err, 'DOPPLER_KEYRING_UNAVAILABLE')) throw err
    return fallback()
  }
  let challenge
  try {
    // Observed in Doppler's official MCP client, not a public OAuth contract.
    // Identify resenv honestly rather than impersonating Doppler's MCP client.
    const query = new URLSearchParams({ hostname: 'resenv', version: `v${version}`, os: process.platform, arch: process.arch })
    challenge = await request(`/v3/auth/cli/generate/2?${query.toString()}`)
  } catch (err) {
    if (hasErrorCode(err, 'DOPPLER_ENDPOINT_UNAVAILABLE')) return fallback()
    throw err
  }
  let url
  try { url = new URL(typeof challenge?.auth_url === 'string' ? challenge.auth_url : '') } catch (err) {
    if (!(err instanceof TypeError)) throw err
  }
  if (!challenge || !url || url.origin !== 'https://dashboard.doppler.com' || url.username || url.password || url.pathname !== '/workplace/auth/cli' ||
      typeof challenge.code !== 'string' || !/^[A-Za-z0-9_-]{8,256}$/.test(challenge.code) ||
      typeof challenge.polling_code !== 'string' || !/^[A-Za-z0-9_.-]{8,512}$/.test(challenge.polling_code)) {
    throw new ResenvError('DOPPLER_INVALID_RESPONSE', 'Doppler returned an invalid browser authorization challenge.')
  }
  // Display the human authorization code only in the explicit login command.
  output(`Authorize resenv at ${url.href}`)
  output(`Authorization code: ${challenge.code}`)
  if (!noBrowser) system.openBrowser(url.href)
  const deadline = now() + 300000
  while (now() < deadline) {
    const result = await request('/v3/auth/cli/authorize', { body: { code: challenge.polling_code }, pending: true })
    if (result) {
      const token = validateToken(result.token)
      try { system.write(token) } catch {
        // Do not leave a newly minted, unpersisted credential active if storage fails.
        try { await request('/v3/auth/revoke', { token, body: { token } }) } catch (err) {
          if (!(err instanceof ResenvError)) {
            throw new ResenvError('DOPPLER_KEYRING_UNAVAILABLE', 'Could not save or revoke the login credential. Check Doppler CLI Tokens before retrying.')
          }
        }
        throw new ResenvError('DOPPLER_KEYRING_UNAVAILABLE', 'Could not save the login credential. Revocation was attempted; check Doppler CLI Tokens, then try resenv login doppler --cli.')
      }
      output('Done: Doppler login saved in the OS credential store.')
      return 'native'
    }
    await sleep(2000)
  }
  throw new ResenvError('DOPPLER_LOGIN_TIMEOUT', 'Doppler login timed out. Run resenv login doppler to try again.')
}

export { credential, login }
