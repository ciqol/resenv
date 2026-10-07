import { debuglog, types } from 'node:util'
import { createRequire } from 'node:module'
import type { decrypt as eciesDecrypt } from 'eciesjs'
import { resolveCommands } from './commands.js'
import { ResenvError } from './errors.js'
import { references } from './doppler/references.js'
import { resolveDopplerSync } from './doppler/bridge.js'
import { copyEnvironment } from './values.js'
import type { Environment, ResolveOptions } from './types.js'

export type { Environment, ResolveOptions } from './types.js'

const debug = debuglog('resenv')
// Preserve synchronous resolution without loading cryptography for plain values.
const require = createRequire(import.meta.url)

const PREFIX = 'encrypted:'
const PRIVATE_KEY_NAME = /^DOTENV_PRIVATE_KEY(?:_.+)?$/
const PRIVATE_KEY_HEX = /^[a-fA-F0-9]{64}$/

function variableName (name: string): string {
  return JSON.stringify(name)
}

function privateKeys (env: Readonly<Environment>): string[] {
  const keys = new Set<string>()
  for (const [name, value] of Object.entries(env)) {
    if (!PRIVATE_KEY_NAME.test(name) || value === undefined || value === '') continue
    if (typeof value !== 'string') {
      throw new ResenvError('INVALID_PRIVATE_KEY', `${variableName(name)} must contain a hexadecimal private key.`)
    }
    for (const key of value.split(',').map(value => value.trim())) {
      if (!PRIVATE_KEY_HEX.test(key)) {
        throw new ResenvError('INVALID_PRIVATE_KEY', `${variableName(name)} must contain 64-character hexadecimal keys, separated by commas.`)
      }
      keys.add(key.toLowerCase())
    }
  }
  if (keys.size === 0) {
    throw new ResenvError('MISSING_PRIVATE_KEY', 'Set DOTENV_PRIVATE_KEY or DOTENV_PRIVATE_KEY_<name> in the environment before starting the application.')
  }
  return [...keys]
}

function decryptValue (name: string, value: string, keys: readonly string[]): string {
  const encoded = value.slice(PREFIX.length)
  const payload = Buffer.from(encoded, 'base64')
  // Dotenvx uses an uncompressed secp256k1 point, a 16-byte nonce and a 16-byte tag.
  if (payload.length < 97 || payload[0] !== 4 || payload.toString('base64') !== encoded) {
    throw new ResenvError('INVALID_CIPHERTEXT', `Encrypted value for ${variableName(name)} is malformed.`)
  }

  const { decrypt } = require('eciesjs') as { readonly decrypt: typeof eciesDecrypt }
  // Pass a private configuration so another dependency cannot change our format
  // by mutating eciesjs's shared ECIES_CONFIG object.
  const config: NonNullable<Parameters<typeof decrypt>[2]> = {
    ellipticCurve: 'secp256k1',
    isEphemeralKeyCompressed: false,
    isHkdfKeyCompressed: false,
    symmetricAlgorithm: 'aes-256-gcm',
    symmetricNonceLength: 16,
    ephemeralKeySize: 65
  }

  for (const key of keys) {
    let bytes
    try {
      bytes = decrypt(key, payload, config)
    } catch {
      continue
    }
    let plaintext
    try {
      plaintext = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
    } catch {
      throw new ResenvError('INVALID_ENV_VALUE', `Decrypted value for ${variableName(name)} is not valid UTF-8.`)
    } finally {
      bytes.fill(0)
    }
    if (plaintext.includes('\0')) {
      throw new ResenvError('INVALID_ENV_VALUE', `Decrypted value for ${variableName(name)} contains a null byte.`)
    }
    return plaintext
  }
  throw new ResenvError('DECRYPTION_FAILED', `Could not decrypt ${variableName(name)} with the supplied private keys.`)
}

/** Always return a resolved copy; optionally commit replacements to the input. */
function resolve (env: Readonly<Environment> = process.env, options: ResolveOptions = {}): Environment {
  const replace = options.replace === true
  // Proxy traps can fail during a later write after earlier values were changed.
  if (replace && types.isProxy(env)) {
    throw new ResenvError('INVALID_ENV_TARGET', 'In-place resolution requires process.env or a record with writable data properties, not a Proxy.')
  }
  const snapshot = copyEnvironment(env)
  // Only original ciphertext is decrypted. Fetched secrets remain literal data.
  const entries = Object.entries(snapshot).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].startsWith(PREFIX))
  const commandReferences = options.commands === true
    ? Object.values(snapshot).filter(value => typeof value === 'string' && value.includes('$(')).length
    : 0
  const dopplerCount = Object.values(snapshot).filter(value => typeof value === 'string' && value.startsWith('doppler://')).length
  const total = commandReferences + entries.length + dopplerCount
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
        debug('Replaced secret value for %s.', variableName(name))
      }
    }
    if (entries.length > 0) {
      let keys
      // Resolve into a copy; a failed value must never leave the caller half updated.
      for (const [name, value] of entries) {
        try {
          keys ??= privateKeys(resolved)
          resolved[name] = decryptValue(name, value, keys)
          debug('Replaced secret value for %s.', variableName(name))
        } catch (err) {
          debug('Failed to replace secret value for %s.', variableName(name))
          throw err
        }
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
      throw new ResenvError('INVALID_ENV_TARGET', `Cannot replace ${variableName(name)} on a target without a writable data property.`)
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
