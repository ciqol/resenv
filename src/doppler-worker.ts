import { readFileSync } from 'node:fs'
import { ResenvError } from './errors.js'
import { isEnvironment } from './values.js'
import { resolveReferences } from './doppler/resolve.js'

// Private pipe protocol for the synchronous Node preload. Tokens and resolved
// values never appear in process arguments, inherited env, or worker diagnostics.
async function main (): Promise<void> {
  try {
    const input = readFileSync(0, 'utf8')
    if (Buffer.byteLength(input) > 1048576) throw new Error('Input exceeds limit')
    const env: unknown = JSON.parse(input)
    if (!isEnvironment(env)) throw new Error('Invalid environment input')
    const values = await resolveReferences(env)
    process.stdout.write(JSON.stringify({ values }))
  } catch (err) {
    process.stdout.write(JSON.stringify({ error: err instanceof ResenvError
      ? { code: err.code, message: err.message }
      : { code: 'DOPPLER_RESOLUTION_FAILED', message: 'Doppler resolution failed.' } }))
    process.exitCode = 1
  }
}

void main()
