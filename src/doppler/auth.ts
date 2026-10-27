import { ResenvError } from '../errors.js'
import type { Environment } from '../types.js'
import { validateToken } from './http.js'
import { createSystem } from './system.js'
import type { CredentialSystem } from './system.js'

function credential (env: Readonly<Environment>, system?: CredentialSystem): Promise<string> {
  return Promise.resolve().then(() => {
    // An explicit identity is never replaced after validation or API rejection.
    if (env.DOPPLER_TOKEN !== undefined) return validateToken(env.DOPPLER_TOKEN)
    const token = (system || createSystem()).cliToken()
    if (token) return token
    throw new ResenvError('DOPPLER_AUTH_REQUIRED', 'Run doppler login from your application directory, or supply DOPPLER_TOKEN. Startup never opens a login prompt.')
  })
}

export { credential }
