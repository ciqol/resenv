import { spawnSync } from 'node:child_process'
import { assertSafeDiagnostics } from './assert-safe-diagnostics.mjs'
import { ResenvError } from './errors.mjs'

function resolveCommands (env, { commandTimeoutMs = 30000 }, debug) {
  const resolved = Object.assign(Object.create(null), env)
  const entries = Object.entries(env).filter(([, value]) => typeof value === 'string' && value.includes('$('))
  if (!entries.length) return resolved
  if (process.platform === 'win32') {
    throw new ResenvError('UNSUPPORTED_PLATFORM', 'Command resolution requires a POSIX /bin/sh shell.')
  }
  if (!Number.isSafeInteger(commandTimeoutMs) || commandTimeoutMs < 1 || commandTimeoutMs > 2147483647) {
    throw new ResenvError('INVALID_OPTIONS', 'commandTimeoutMs must be a positive 32-bit integer.')
  }
  // Validate every expression before starting any command. The shell parses the
  // command body; resenv only supports an entire value wrapped in $(...).
  for (const [name, value] of entries) {
    if (!value.startsWith('$(') || !value.endsWith(')') || !value.slice(2, -1).trim()) {
      debug('Failed to replace secret value for %s.', JSON.stringify(name))
      throw new ResenvError('INVALID_COMMAND_VALUE', `${JSON.stringify(name)} must contain a complete $(command) value. Embedded substitutions are not supported.`)
    }
  }
  for (const [name, value] of entries) {
    let result
    try {
      assertSafeDiagnostics()
      result = spawnSync('/bin/sh', ['-c', value.slice(2, -1)], {
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: commandTimeoutMs,
        killSignal: 'SIGKILL',
        maxBuffer: 65536,
        detached: true
      })
      if (result.error || result.signal || result.status !== 0) {
        // Each command has its own process group. Clean up surviving children
        // after a timeout, output limit, signal or failed command.
        if (result.pid) {
          try { process.kill(-result.pid, 'SIGKILL') } catch (err) {
            if (err.code !== 'ESRCH') {
              throw new ResenvError('COMMAND_CLEANUP_FAILED', 'Could not stop the command process group after a resolution failure.')
            }
          }
        }
        const code = result.error?.code === 'ETIMEDOUT' ? 'COMMAND_TIMEOUT' : 'COMMAND_FAILED'
        throw new ResenvError(code, `Could not resolve ${JSON.stringify(name)}. Check the command and your secret-provider login.`)
      }
      let output
      try {
        output = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(result.stdout)
      } catch {
        throw new ResenvError('INVALID_ENV_VALUE', `Command output for ${JSON.stringify(name)} is not valid UTF-8.`)
      }
      if (output.includes('\0')) {
        throw new ResenvError('INVALID_ENV_VALUE', `Command output for ${JSON.stringify(name)} contains a null byte.`)
      }
      // Match POSIX command substitution: remove trailing LF, preserve spaces.
      resolved[name] = output.replace(/\n+$/, '')
      debug('Replaced secret value for %s.', JSON.stringify(name))
    } catch (err) {
      debug('Failed to replace secret value for %s.', JSON.stringify(name))
      if (err instanceof ResenvError) throw err
      throw new ResenvError('COMMAND_FAILED', `Could not resolve ${JSON.stringify(name)}. Check the command and your secret-provider login.`)
    } finally {
      result?.stdout?.fill(0)
      result?.stderr?.fill(0)
    }
  }
  return resolved
}

export { resolveCommands }
