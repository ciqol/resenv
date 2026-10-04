import { ResenvError } from '../errors.mjs'
import { references } from './references.mjs'
import { credential } from './auth.mjs'
import { createClient } from './http.mjs'

async function resolveReferences (env, { request = createClient(), getCredential = credential } = {}) {
  const entries = references(env)
  const values = Object.create(null)
  if (!entries.length) return values
  const token = await getCredential(env)
  const cache = new Map()
  for (const entry of entries) {
    const query = new URLSearchParams({ project: entry.project, config: entry.config, name: entry.key })
    const path = `/v3/configs/config/secret?${query}`
    if (!cache.has(path)) {
      const result = await request(path, { token })
      const value = result.value?.computed
      if (typeof value !== 'string' || value.includes('\0') || Buffer.byteLength(value) > 65536) {
        throw new ResenvError('DOPPLER_INVALID_VALUE', `Doppler did not return a usable value for ${JSON.stringify(entry.name)}.`)
      }
      cache.set(path, value)
    }
    values[entry.name] = cache.get(path)
  }
  return values
}

export { resolveReferences }
