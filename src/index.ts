import { debuglog, types } from 'node:util'
import { resolveCommands } from './commands.js'
import { ResenvError } from './errors.js'
import { references } from './doppler/references.js'
import { resolveDopplerSync } from './doppler/bridge.js'
import { copyEnvironment } from './values.js'
import type { Environment, ResolveOptions } from './types.js'

export type { Environment, ResolveOptions } from './types.js'

const debug = debuglog('ciqol:resenv')
/** Always return a resolved copy; optionally commit replacements to the input. */
function resolve (env: Readonly<Environment> = process.env, options: ResolveOptions = {}): Environment {
  const replace = options.replace === true
  // Proxy traps can fail during a later write after earlier values were changed.
  if (replace && types.isProxy(env)) {
    throw new ResenvError('INVALID_ENV_TARGET', 'In-place resolution requires process.env or a record with writable data properties, not a Proxy.')
  }
  const snapshot = copyEnvironment(env)
  const commandReferences = options.commands === true
    ? Object.values(snapshot).filter(value => typeof value === 'string' && value.includes('$(')).length
    : 0
  const dopplerCount = Object.values(snapshot).filter(value => typeof value === 'string' && value.startsWith('doppler://')).length
  const total = commandReferences + dopplerCount
  if (total === 0) {
    if (replace) replaceEnvironment(env, snapshot)
    debug('Nothing to handle.')
    return snapshot
  }

  try {
    // Reject invalid references before any optional command can have effects.
    const dopplerEntries = references(snapshot)
    const resolved = options.commands === true
      ? resolveCommands(snapshot, options, debug)
      : copyEnvironment(snapshot)
    if (dopplerEntries.length) {
      // Resolve only original references. Command and cloud output stays literal.
      const cloudInput = Object.fromEntries(dopplerEntries.map(({ name }) => [name, snapshot[name]]))
      if (resolved.DOPPLER_TOKEN !== undefined) cloudInput.DOPPLER_TOKEN = resolved.DOPPLER_TOKEN
      let values
      try { values = resolveDopplerSync(cloudInput) } catch (err) {
        debug('Failed to resolve Doppler references.')
        throw err
      }
      for (const { name } of dopplerEntries) {
        resolved[name] = values[name]
        debug('Replaced secret value for %s.', JSON.stringify(name))
      }
    }
    if (replace) replaceEnvironment(env, resolved)
    debug('Done: replaced %d secret value(s).', total)
    return resolved
  } catch (err) {
    debug('Done: failed (%s); environment unchanged.', err instanceof ResenvError ? err.code : 'STARTUP_FAILED')
    throw err
  }
}

function replaceEnvironment (env: Readonly<Environment>, resolved: Readonly<Environment>): void {
  const updates: [string, PropertyDescriptor][] = []
  for (const [name, value] of Object.entries(resolved)) {
    const descriptor = Object.getOwnPropertyDescriptor(env, name)
    if (descriptor && 'value' in descriptor && descriptor.value === value) continue
    if (descriptor ? !descriptor.writable : !Object.isExtensible(env)) {
      throw new ResenvError('INVALID_ENV_TARGET', `Cannot replace ${JSON.stringify(name)} on a target without a writable data property.`)
    }
    updates.push([name, { ...(descriptor || { writable: true, enumerable: true, configurable: true }), value }])
  }
  // Preflight every write. No setters or Proxy traps run during this commit.
  for (const [name, descriptor] of updates) {
    Object.defineProperty(env, name, descriptor)
  }
}

function formatError (error: unknown): string {
  if (error instanceof ResenvError) return `[resenv] ${error.code}: ${error.message}`
  return '[resenv] STARTUP_FAILED: Environment resolution failed.'
}

export { ResenvError, resolve, formatError }
