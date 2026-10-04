import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { ResenvError } from '../errors.mjs'
import { references } from './references.mjs'
import { helperEnvironment } from './system.mjs'

const require = createRequire(import.meta.url)

function resolveDopplerSync (env, run = spawnSync) {
  const entries = references(env)
  if (!entries.length) return Object.create(null)
  const input = Object.fromEntries(entries.map(({ name }) => [name, env[name]]))
  if (env.DOPPLER_TOKEN !== undefined) input.DOPPLER_TOKEN = env.DOPPLER_TOKEN
  // Package self-resolution works both in the checkout and the packed artifact.
  const manifestPath = require.resolve('@ciqol/resenv/package.json')
  const manifest = require(manifestPath)
  const worker = join(dirname(manifestPath), dirname(manifest.main), 'doppler-worker.cjs')
  const result = run(process.execPath, [worker], {
    input: JSON.stringify(input), env: helperEnvironment(),
    encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], shell: false,
    timeout: 60000, killSignal: 'SIGKILL', maxBuffer: 1048576,
    detached: process.platform !== 'win32'
  })
  if (result.error || result.signal) {
    if (result.pid && process.platform !== 'win32') {
      try { process.kill(-result.pid, 'SIGKILL') } catch {}
    }
    throw new ResenvError('DOPPLER_RESOLUTION_FAILED', 'Doppler resolution exceeded its startup time or output limit.')
  }
  let response
  try { response = JSON.parse(result.stdout) } catch {}
  if (response?.error && /^DOPPLER_[A-Z_]+$/.test(response.error.code) && typeof response.error.message === 'string') {
    throw new ResenvError(response.error.code, response.error.message)
  }
  if (result.status !== 0 || !response?.values || Object.keys(response.values).length !== entries.length ||
      entries.some(({ name }) => typeof response.values[name] !== 'string' || response.values[name].includes('\0'))) {
    throw new ResenvError('DOPPLER_RESOLUTION_FAILED', 'Doppler resolution returned an invalid result.')
  }
  return response.values
}

export { resolveDopplerSync }
