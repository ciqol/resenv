import { ResenvError } from '../errors.mjs'

const API_ORIGIN = 'https://api.doppler.com'

// No environment-controlled endpoint or redirects: credentials stay at Doppler.
function createClient (fetchImpl = globalThis.fetch) {
  return async function request (path, { token, body, pending = false } = {}) {
    let response
    try {
      response = await fetchImpl(new URL(path, API_ORIGIN), {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          'content-type': 'application/json',
          'user-agent': 'ciqol-resenv',
          ...(token ? { authorization: `Bearer ${token}` } : {})
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'error',
        signal: AbortSignal.timeout(10000)
      })
      if (pending && response.status === 409) {
        await response.body?.cancel()
        return null
      }
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
      for await (const chunk of response.body) {
        size += chunk.length
        if (size > 1048576) throw new ResenvError('DOPPLER_INVALID_RESPONSE', 'Doppler response exceeded the size limit.')
        chunks.push(chunk)
      }
      const result = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      if (!result || typeof result !== 'object' || Array.isArray(result) || result.success === false || result.error) {
        throw new ResenvError('DOPPLER_INVALID_RESPONSE', 'Doppler returned an unsuccessful or malformed response.')
      }
      return result
    } catch (error) {
      if (error instanceof ResenvError) throw error
      throw new ResenvError('DOPPLER_REQUEST_FAILED', 'Could not complete the HTTPS request to Doppler. Check your connection and retry.')
    }
  }
}

function validateToken (token) {
  if (typeof token !== 'string' || !/^dp\.[a-z]+\.[A-Za-z0-9_.-]{10,512}$/.test(token)) {
    throw new ResenvError('DOPPLER_INVALID_TOKEN', 'The Doppler credential is malformed. Run resenv login doppler or supply a valid DOPPLER_TOKEN.')
  }
  return token
}

export { createClient, validateToken }
