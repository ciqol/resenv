import { ResenvError } from '../errors.js'
import type { Environment } from '../types.js'
import { copyEnvironment, isRecord } from '../values.js'
import { references } from './references.js'
import { credential } from './auth.js'
import { createClient } from './http.js'
import type { Request } from './http.js'

type ResolveDependencies = {
  readonly request?: Request
  readonly getCredential?: typeof credential
}

type ReferenceGroup = {
  readonly path: string
  readonly names: string[]
}

// 2026-10-06: cap startup fan-out at four to overlap latency without a burst of
// all 128 permitted references. The overall startup deadline still applies.
const CONCURRENT_REQUESTS = 4

async function resolveReferences (env: Readonly<Environment>, { request = createClient(), getCredential = credential }: ResolveDependencies = {}): Promise<Environment> {
  const entries = references(env)
  const values = copyEnvironment({})
  if (!entries.length) return values
  const groups = new Map<string, ReferenceGroup>()
  for (const entry of entries) {
    const query = new URLSearchParams({ project: entry.project, config: entry.config, name: entry.key })
    const path = `/v3/configs/config/secret?${query.toString()}`
    const group = groups.get(path) || { path, names: [] }
    group.names.push(entry.name)
    groups.set(path, group)
  }
  const tasks = [...groups.values()]
  const token = await getCredential(env)
  let next = 0
  let failure: { readonly err: unknown } | undefined
  const worker = async (): Promise<void> => {
    while (!failure && next < tasks.length) {
      const task = tasks[next++]
      if (!task) return
      const { path, names } = task
      try {
        const result = await request(path, { token })
        const value = isRecord(result?.value) ? result.value.computed : undefined
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
