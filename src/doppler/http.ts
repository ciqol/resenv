import { ResenvError } from '../errors.js'
import { isRecord } from '../values.js'

export type RequestOptions = {
  readonly token?: string
}

export type Request = (path: string, options?: RequestOptions) => Promise<Record<string, unknown>>

const API_ORIGIN = 'https://api.doppler.com'

// No environment-controlled endpoint or redirects: credentials stay at Doppler.
function createClient (fetchImpl: typeof globalThis.fetch = globalThis.fetch): Request {
  return async function request (path, { token } = {}) {
    let response
    try {
      response = await fetchImpl(new URL(path, API_ORIGIN), {
        method: 'GET',
        headers: {
          'content-type': 'application/json',
          'user-agent': 'ciqol-resenv',
          ...(token ? { authorization: `Bearer ${token}` } : {})
        },
        redirect: 'error',
        signal: AbortSignal.timeout(10000)
      })
      if (!response.ok) {
        await response.body?.cancel()
        const code = response.status === 401 ? 'DOPPLER_AUTH_REQUIRED'
          : response.status === 403 ? 'DOPPLER_ACCESS_DENIED'
            : [404, 405, 501].includes(response.status) ? 'DOPPLER_ENDPOINT_UNAVAILABLE'
              : 'DOPPLER_REQUEST_FAILED'
        throw new ResenvError(code, `Doppler request failed (HTTP ${response.status}). Check your login and access.`)
      }
      const chunks = []
      let size = 0
      if (!response.body) throw new ResenvError('DOPPLER_INVALID_RESPONSE', 'Doppler returned an empty response.')
      for await (const raw of response.body) {
        const chunk: unknown = raw
        if (!(chunk instanceof Uint8Array)) throw new ResenvError('DOPPLER_INVALID_RESPONSE', 'Doppler returned invalid response bytes.')
        size += chunk.length
        if (size > 1048576) throw new ResenvError('DOPPLER_INVALID_RESPONSE', 'Doppler response exceeded the size limit.')
        chunks.push(chunk)
      }
      let result: unknown
      try {
        result = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)))
      } catch (err) {
        if (!(err instanceof TypeError || err instanceof SyntaxError)) throw err
        throw new ResenvError('DOPPLER_INVALID_RESPONSE', 'Doppler returned invalid UTF-8 or JSON.')
      }
      if (!isRecord(result) || result.success === false || result.error) {
        throw new ResenvError('DOPPLER_INVALID_RESPONSE', 'Doppler returned an unsuccessful or malformed response.')
      }
      return result
    } catch (err) {
      if (err instanceof ResenvError) throw err
      throw new ResenvError('DOPPLER_REQUEST_FAILED', 'Could not complete the HTTPS request to Doppler. Check your connection and retry.')
    }
  }
}

function validateToken (token: unknown): string {
  if (typeof token !== 'string' || !/^dp\.[a-z]+\.[A-Za-z0-9_.-]{10,512}$/.test(token)) {
    throw new ResenvError('DOPPLER_INVALID_TOKEN', 'The Doppler credential is malformed. Check your Doppler CLI login or supply a valid DOPPLER_TOKEN.')
  }
  return token
}

export { createClient, validateToken }
