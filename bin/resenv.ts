#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { constants } from 'node:os'
import { assertSafeDiagnostics } from '../src/assert-safe-diagnostics.js'
import { assertNoPreload } from '../src/preload.js'
import { resolve, formatError } from '../src/index.js'
import { hasErrorCode } from '../src/values.js'

const usage = 'Usage: resenv run [--commands] -- <command> [arguments...]\nInfer secret providers from values already in the environment.\nManage authentication with doppler login and doppler logout, or supply DOPPLER_TOKEN.\n--doppler remains accepted for compatibility.\n--commands enables whole-value $(command) expressions using /bin/sh.\n'

function main (): void {
  const args = process.argv.slice(2)
  if (args.length === 1 && ['--help', '-h'].includes(args[0] || '')) {
    process.stdout.write(usage)
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

try { main() } catch (err) {
  process.stderr.write(`${formatError(err)}\n`)
  process.exitCode = 1
}
