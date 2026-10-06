import { ResenvError } from '../errors.mjs'

function references (env) {
  const entries = Object.entries(env).filter(([, value]) => typeof value === 'string' && value.startsWith('doppler://'))
  if (entries.length > 128) throw new ResenvError('DOPPLER_TOO_MANY_REFERENCES', 'At most 128 Doppler references can be resolved per process.')
  return entries.map(([name, value]) => {
    // Parse the literal spelling: URL would lowercase hosts and normalize ../.
    const match = /^doppler:\/\/([a-z0-9_-]+)\/([a-z0-9_-]+)\/([A-Za-z0-9_.:/%-]+)$/.exec(value)
    let key
    try { if (match) key = decodeURIComponent(match[3]) } catch (err) {
      if (!(err instanceof URIError)) throw err
    }
    if (!key || key.length > 200 || !/^[A-Za-z0-9_.:/-]+$/.test(key) || key === '.' || key === '..') {
      throw new ResenvError('DOPPLER_INVALID_REFERENCE', `${JSON.stringify(name)} must use doppler://project/config/SECRET_NAME.`)
    }
    return { name, project: match[1], config: match[2], key }
  })
}

export { references }
