import { ResenvError, resolveEnvInPlace, formatError } from './index.mjs'

let activeMode

export function resolvePreload (mode) {
  try {
    // A second mode could interpret data fetched by the first as executable input.
    if (activeMode && activeMode !== mode) {
      throw new ResenvError('CONFLICTING_PRELOADS', 'Use one resenv preload per process. To combine Doppler and commands, use resenv run --commands or one library call with both options enabled.')
    }
    if (activeMode) {
      return
    }
    activeMode = mode
    resolveEnvInPlace(process.env, mode === 'commands' ? { commands: true } : { doppler: true })
  } catch (err) {
    process.stderr.write(`${formatError(err)}\n`)
    process.exit(1)
  }
}
