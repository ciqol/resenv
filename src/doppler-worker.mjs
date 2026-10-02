import { readFileSync } from 'node:fs'
import { EnvrefError } from './errors.mjs'
import { resolveReferences } from './doppler/resolve.mjs'

// Private pipe protocol for the synchronous Node preload. Tokens and resolved
// values never appear in process arguments, inherited env, or worker diagnostics.
async function main () {
  try {
    const input = readFileSync(0, 'utf8')
    if (Buffer.byteLength(input) > 1048576) throw new Error('Input exceeds limit')
    const values = await resolveReferences(JSON.parse(input))
    process.stdout.write(JSON.stringify({ values }))
  } catch (error) {
    process.stdout.write(JSON.stringify({ error: error instanceof EnvrefError
      ? { code: error.code, message: error.message }
      : { code: 'DOPPLER_RESOLUTION_FAILED', message: 'Doppler resolution failed.' } }))
    process.exitCode = 1
  }
}

main()
