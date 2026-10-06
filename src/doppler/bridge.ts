import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { ResenvError } from '../errors.js'
import { assertSafeDiagnostics } from '../assert-safe-diagnostics.js'
import type { Environment } from '../types.js'
import { copyEnvironment, hasErrorCode, isEnvironment, isRecord } from '../values.js'
import { references } from './references.js'
import { helperEnvironment } from './system.js'
import type { SyncRunner } from './system.js'

const require = createRequire(import.meta.url)

function resolveDopplerSync (env: Readonly<Environment>, run: SyncRunner = spawnSync): Environment {
  const entries = references(env)
  if (!entries.length) return copyEnvironment({})
  assertSafeDiagnostics()
  const input = Object.fromEntries(entries.map(({ name }) => [name, env[name]]))
  if (env.DOPPLER_TOKEN !== undefined) input.DOPPLER_TOKEN = env.DOPPLER_TOKEN
  // Package self-resolution works both in the checkout and the packed artifact.
  const manifestPath = require.resolve('@ciqol/resenv/package.json')
  const manifest: unknown = require(manifestPath)
  if (!isRecord(manifest) || typeof manifest.main !== 'string') throw new ResenvError('DOPPLER_RESOLUTION_FAILED', 'Invalid package entry point.')
  const worker = join(dirname(manifestPath), dirname(manifest.main), 'doppler-worker.cjs')
  const result = run(process.execPath, [worker], {
    input: JSON.stringify(input), env: helperEnvironment(),
    encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], shell: false,
    timeout: 60000, killSignal: 'SIGKILL', maxBuffer: 1048576,
    detached: process.platform !== 'win32'
  })
  if (result.error || result.signal) {
    if (result.pid && process.platform !== 'win32') {
      try { process.kill(-result.pid, 'SIGKILL') } catch (err) {
        if (!hasErrorCode(err, 'ESRCH')) {
          throw new ResenvError('DOPPLER_RESOLUTION_FAILED', 'Could not stop resolver child processes after a resolution failure.')
        }
      }
    }
    throw new ResenvError('DOPPLER_RESOLUTION_FAILED', 'Doppler resolution exceeded its startup time or output limit.')
  }
  let response: unknown
  try { response = JSON.parse(result.stdout) } catch (err) {
    if (!(err instanceof SyntaxError)) throw err
  }
  const error = isRecord(response) ? response.error : undefined
  if (isRecord(error) && typeof error.code === 'string' && /^DOPPLER_[A-Z_]+$/.test(error.code) && typeof error.message === 'string') {
    throw new ResenvError(error.code, error.message)
  }
  const values = isRecord(response) ? response.values : undefined
  if (result.status !== 0 || !isEnvironment(values) || Object.keys(values).length !== entries.length ||
      entries.some(({ name }) => typeof values[name] !== 'string' || values[name]?.includes('\0'))) {
    throw new ResenvError('DOPPLER_RESOLUTION_FAILED', 'Doppler resolution returned an invalid result.')
  }
  return values
}

export { resolveDopplerSync }
