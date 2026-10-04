import { resolveEnvInPlace, formatError } from './index.mjs'

try {
  resolveEnvInPlace(process.env, { doppler: true })
} catch (error) {
  process.stderr.write(`${formatError(error)}\n`)
  process.exit(1)
}
