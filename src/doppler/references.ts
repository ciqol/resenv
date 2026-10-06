import { ResenvError } from '../errors.js'
import type { Environment } from '../types.js'

type Reference = {
  readonly name: string
  readonly project: string
  readonly config: string
  readonly key: string
}

function references (env: Readonly<Environment>): Reference[] {
  const entries = Object.entries(env).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].startsWith('doppler://'))
  if (entries.length > 128) throw new ResenvError('DOPPLER_TOO_MANY_REFERENCES', 'At most 128 Doppler references can be resolved per process.')
  return entries.map(([name, value]) => {
    // Parse the literal spelling: URL would lowercase hosts and normalize ../.
    const match = /^doppler:\/\/([a-z0-9_-]+)\/([a-z0-9_-]+)\/([A-Za-z0-9_.:/%-]+)$/.exec(value)
    let key
    try { if (match?.[3]) key = decodeURIComponent(match[3]) } catch (err) {
      if (!(err instanceof URIError)) throw err
    }
    if (!match?.[1] || !match[2] || !key || key.length > 200 || !/^[A-Za-z0-9_.:/-]+$/.test(key) || key === '.' || key === '..') {
      throw new ResenvError('DOPPLER_INVALID_REFERENCE', `${JSON.stringify(name)} must use doppler://project/config/SECRET_NAME.`)
    }
    return { name, project: match[1], config: match[2], key }
  })
}

export { references }
