#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { constants } from 'node:os'
import { resolveEnv, formatError } from '../src/index.mjs'
import { login } from '../src/doppler/auth.mjs'
import { createSystem } from '../src/doppler/system.mjs'
import { references } from '../src/doppler/references.mjs'

const usage = 'Usage: envref run [--commands] -- <command> [arguments...]\n       envref login [doppler] [--cli] [--no-browser]\n       envref logout doppler\nInfer secret providers from values already in the environment.\n--doppler remains accepted for compatibility.\n--commands enables whole-value $(command) expressions using /bin/sh.\n'

async function main () {
  const args = process.argv.slice(2)
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
    process.stdout.write(usage)
    return
  }
  const explicitProvider = args[1] === 'doppler'
  if (args[0] === 'login' && args.slice(explicitProvider ? 2 : 1).every(arg => ['--cli', '--no-browser'].includes(arg))) {
    if (!explicitProvider && !references(process.env).length) {
      process.stderr.write('Nothing to handle: no cloud secret references in the environment. Load your target environment first, or use envref login doppler.\n')
      return
    }
    await login({ cli: args.includes('--cli'), noBrowser: args.includes('--no-browser') })
    return
  }
  if (args.length === 2 && args[0] === 'logout' && args[1] === 'doppler') {
    createSystem().remove()
    process.stderr.write('Removed the envref credential. Doppler CLI credentials and DOPPLER_TOKEN are unchanged; revoke the token in Doppler to invalidate it.\n')
    return
  }
  const options = { doppler: true }
  while (args[0] === 'run' && ['--commands', '--doppler'].includes(args[1])) {
    options[args[1].slice(2)] = true
    args.splice(1, 1)
  }
  if (args[0] !== 'run' || args[1] !== '--' || !args[2]) {
    process.stderr.write(usage)
    process.exitCode = 2
    return
  }

  let env
  try {
    env = resolveEnv(process.env, options)
  } catch (error) {
    process.stderr.write(`${formatError(error)}\n`)
    process.exitCode = 1
    return
  }

  const child = spawn(args[2], args.slice(3), { env, stdio: 'inherit', shell: false })
  const signals = ['SIGINT', 'SIGTERM', 'SIGHUP']
  const handlers = new Map()
  for (const signal of signals) {
    const handler = () => { child.kill(signal) }
    handlers.set(signal, handler)
    process.on(signal, handler)
  }
  function cleanup () {
    for (const [signal, handler] of handlers) process.removeListener(signal, handler)
  }
  child.once('error', error => {
    cleanup()
    const code = error.code === 'ENOENT' ? 'COMMAND_NOT_FOUND' : 'COMMAND_START_FAILED'
    process.stderr.write(`[envref] ${code}: Could not start the requested command.\n`)
    process.exitCode = error.code === 'ENOENT' ? 127 : 126
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

main().catch(error => {
  process.stderr.write(`${formatError(error)}\n`)
  process.exitCode = 1
})
