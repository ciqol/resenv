import { ResenvError, resolve, formatError } from './index.js'

type PreloadMode = 'commands' | 'doppler'

let activeMode: PreloadMode | undefined

export function assertNoPreload (): void {
  if (activeMode) {
    throw new ResenvError('CONFLICTING_PRELOADS', 'Use the resenv CLI or a resenv preload for this process. Combining them can reinterpret fetched values.')
  }
}

export function resolvePreload (mode: PreloadMode): void {
  try {
    // A second mode could interpret data fetched by the first as executable input.
    if (activeMode && activeMode !== mode) {
      throw new ResenvError('CONFLICTING_PRELOADS', 'Use one resenv preload per process. To combine Doppler and commands, use resenv run --commands or one library call with commands enabled.')
    }
    if (activeMode) {
      return
    }
    activeMode = mode
    resolve(process.env, { replace: true, commands: mode === 'commands' })
  } catch (err) {
    process.stderr.write(`${formatError(err)}\n`)
    process.exit(1)
  }
}
