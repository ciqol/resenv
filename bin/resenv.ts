#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { constants } from 'node:os'
import { assertSafeDiagnostics } from '../src/assert-safe-diagnostics.js'
import { assertNoPreload } from '../src/preload.js'
import { resolve, formatError } from '../src/index.js'
import { login } from '../src/doppler/auth.js'
import { createSystem } from '../src/doppler/system.js'
import { references } from '../src/doppler/references.js'
import { hasErrorCode } from '../src/values.js'

const usage = 'Usage: resenv run [--commands] -- <command> [arguments...]\n       resenv login [doppler] [--cli] [--no-browser]\n       resenv logout doppler\nInfer secret providers from values already in the environment.\n--doppler remains accepted for compatibility.\n--commands enables whole-value $(command) expressions using /bin/sh.\n'

async function main (): Promise<void> {
  const args = process.argv.slice(2)
  if (args.length === 1 && ['--help', '-h'].includes(args[0] || '')) {
    process.stdout.write(usage)
    return
  }
  const explicitProvider = args[1] === 'doppler'
  if (args[0] === 'login' && args.slice(explicitProvider ? 2 : 1).every(arg => ['--cli', '--no-browser'].includes(arg))) {
    if (!explicitProvider && !references(process.env).length) {
      process.stderr.write('Nothing to handle: no cloud secret references in the environment. Load your target environment first, or use resenv login doppler.\n')
      return
    }
    await login({ cli: args.includes('--cli'), noBrowser: args.includes('--no-browser') })
    return
  }
  if (args.length === 2 && args[0] === 'logout' && args[1] === 'doppler') {
    createSystem().remove()
    process.stderr.write('Removed the resenv credential. Doppler CLI credentials and DOPPLER_TOKEN are unchanged; revoke the token in Doppler to invalidate it.\n')
    return
  }
  let commands = false
  while (args[0] === 'run' && ['--commands', '--doppler'].includes(args[1] || '')) {
    if (args[1] === '--commands') commands = true
    args.splice(1, 1)
  }
  const [operation, separator, command, ...commandArgs] = args
  if (operation !== 'run' || separator !== '--' || !command) {
    process.stderr.write(usage)
    process.exitCode = 2
    return
  }

  let env
  try {
    assertNoPreload()
    env = resolve(process.env, { commands })
  } catch (err) {
    process.stderr.write(`${formatError(err)}\n`)
    process.exitCode = 1
    return
  }

  assertSafeDiagnostics()
  // Isolate the child from terminal group signals; the wrapper forwards them once.
  const child = spawn(command, commandArgs, { env, stdio: 'inherit', shell: false, detached: process.platform !== 'win32' })
  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGHUP']
  const handlers = new Map<NodeJS.Signals, () => void>()
  for (const signal of signals) {
    const handler = () => {
      try {
        if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, signal)
        else child.kill(signal)
      } catch (err) {
        if (!hasErrorCode(err, 'ESRCH')) throw err
      }
    }
    handlers.set(signal, handler)
    process.on(signal, handler)
  }
  function cleanup () {
    for (const [signal, handler] of handlers) process.removeListener(signal, handler)
  }
  child.once('error', err => {
    cleanup()
    const code = hasErrorCode(err, 'ENOENT') ? 'COMMAND_NOT_FOUND' : 'COMMAND_START_FAILED'
    process.stderr.write(`[resenv] ${code}: Could not start the requested command.\n`)
    process.exitCode = hasErrorCode(err, 'ENOENT') ? 127 : 126
  })
  child.once('exit', (code, signal) => {
    cleanup()
    if (signal) {
      process.exitCode = 128 + (constants.signals[signal] || 1)
      if (process.platform !== 'win32') process.kill(process.pid, signal)
    } else {
      process.exitCode = code ?? 1
    }
  })
}

void main().catch(err => {
  process.stderr.write(`${formatError(err)}\n`)
  process.exitCode = 1
})
