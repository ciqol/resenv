import { spawnSync } from 'node:child_process'

function resolveCommands (env, { commandTimeoutMs = 30000 }, EnvrefError, debug) {
  const resolved = Object.assign(Object.create(null), env)
  const entries = Object.entries(env).filter(([, value]) => typeof value === 'string' && value.includes('$('))
  if (!entries.length) return resolved
  if (process.platform === 'win32') {
    throw new EnvrefError('UNSUPPORTED_PLATFORM', 'Command resolution requires a POSIX /bin/sh shell.')
  }
  if (!Number.isSafeInteger(commandTimeoutMs) || commandTimeoutMs < 1 || commandTimeoutMs > 2147483647) {
    throw new EnvrefError('INVALID_OPTIONS', 'commandTimeoutMs must be a positive 32-bit integer.')
  }
  // Validate every expression before starting any command. The shell parses the
  // command body; envref only supports an entire value wrapped in $(...).
  for (const [name, value] of entries) {
    if (!value.startsWith('$(') || !value.endsWith(')') || !value.slice(2, -1).trim()) {
      debug('Failed to replace secret value for %s.', JSON.stringify(name))
      throw new EnvrefError('INVALID_COMMAND_VALUE', `${JSON.stringify(name)} must contain a complete $(command) value. Embedded substitutions are not supported.`)
    }
  }
  for (const [name, value] of entries) {
    let result
    try {
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
          try { process.kill(-result.pid, 'SIGKILL') } catch {}
        }
        const code = result.error?.code === 'ETIMEDOUT' ? 'COMMAND_TIMEOUT' : 'COMMAND_FAILED'
        throw new EnvrefError(code, `Could not resolve ${JSON.stringify(name)}. Check the command and your secret-provider login.`)
      }
      let output
      try {
        output = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(result.stdout)
      } catch {
        throw new EnvrefError('INVALID_ENV_VALUE', `Command output for ${JSON.stringify(name)} is not valid UTF-8.`)
      }
      if (output.includes('\0')) {
        throw new EnvrefError('INVALID_ENV_VALUE', `Command output for ${JSON.stringify(name)} contains a null byte.`)
      }
      // Match POSIX command substitution: remove trailing LF, preserve spaces.
      resolved[name] = output.replace(/\n+$/, '')
      debug('Replaced secret value for %s.', JSON.stringify(name))
    } catch (error) {
      debug('Failed to replace secret value for %s.', JSON.stringify(name))
      if (error instanceof EnvrefError) throw error
      throw new EnvrefError('COMMAND_FAILED', `Could not resolve ${JSON.stringify(name)}. Check the command and your secret-provider login.`)
    } finally {
      result?.stdout?.fill(0)
      result?.stderr?.fill(0)
    }
  }
  return resolved
}

export { resolveCommands }
