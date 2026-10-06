import { ResenvError } from '../errors.mjs'
import { references } from './references.mjs'
import { credential } from './auth.mjs'
import { createClient } from './http.mjs'

// 2026-10-06: cap startup fan-out at four to overlap latency without a burst of
// all 128 permitted references. The overall startup deadline still applies.
const CONCURRENT_REQUESTS = 4

async function resolveReferences (env, { request = createClient(), getCredential = credential } = {}) {
  const entries = references(env)
  const values = Object.create(null)
  if (!entries.length) return values
  const groups = new Map()
  for (const entry of entries) {
    const query = new URLSearchParams({ project: entry.project, config: entry.config, name: entry.key })
    const path = `/v3/configs/config/secret?${query}`
    if (!groups.has(path)) groups.set(path, { path, names: [] })
    groups.get(path).names.push(entry.name)
  }
  const tasks = [...groups.values()]
  const token = await getCredential(env)
  let next = 0
  let failure
  const worker = async () => {
    while (!failure && next < tasks.length) {
      const { path, names } = tasks[next++]
      try {
        const result = await request(path, { token })
        const value = result.value?.computed
        if (typeof value !== 'string' || !value.isWellFormed() || value.includes('\0') || Buffer.byteLength(value) > 65536) {
          throw new ResenvError('DOPPLER_INVALID_VALUE', `Doppler did not return a usable value for ${JSON.stringify(names[0])}.`)
        }
        for (const name of names) values[name] = value
      } catch (err) {
        // Stop scheduling, but wait for already started requests to settle.
        // No partial result escapes and no second credential is attempted.
        failure ||= { err }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENT_REQUESTS, tasks.length) }, worker))
  if (failure) {
    throw failure.err
  }

  return values
}

export { resolveReferences }
