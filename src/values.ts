import type { Environment } from './types.js'

export function isRecord (value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isEnvironment (value: unknown): value is Environment {
  return isRecord(value) && Object.values(value).every(item => typeof item === 'string' || item === undefined)
}

export function hasErrorCode (err: unknown, code: string): boolean {
  return isRecord(err) && err.code === code
}

export function copyEnvironment (env: Readonly<Environment>): Environment {
  // This assertion describes the empty dictionary we create, not external data.
  return Object.assign(<Environment>Object.create(null), env)
}
