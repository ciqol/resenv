import { fileURLToPath, pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { PrivateKey, encrypt } from 'eciesjs'
import { resolveEnv, resolveEnvInPlace, formatError } from '../dist/index.mjs'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const options = { commands: true }
const posix = { skip: process.platform === 'win32' }
const quote = value => `'${value.replaceAll("'", "'\\''")}'`
const expression = script => `$(exec ${quote(process.execPath)} -e ${quote(script)})`

test('commands require explicit opt-in and ignore an environment toggle', () => {
  const env = { TOKEN: '$(must-not-run)', RESENV_COMMANDS: 'true' }
  assert.deepEqual({ ...resolveEnv(env) }, env)
})

test('commands preserve whitespace, UTF-8 and literal command-looking output', posix, () => {
  for (const output of ['', ' space \n\n', '\uFEFF🌍\nnext', '$(must-not-run)', 'encrypted:literal']) {
    const env = { TOKEN: expression(`process.stdout.write(${JSON.stringify(output)})`) }
    assert.equal(resolveEnv(env, options).TOKEN, output.replace(/\n+$/, ''))
  }
  assert.equal(resolveEnv({ TOKEN: '$(printf "%s" "$(printf nested)")' }, options).TOKEN, 'nested')
})

test('a command can fetch a private key before ciphertext decryption', posix, () => {
  const key = new PrivateKey()
  const env = {
    TOKEN: `encrypted:${Buffer.from(encrypt(key.publicKey.toHex(), Buffer.from('dummy-decrypted'))).toString('base64')}`,
    DOTENV_PRIVATE_KEY: expression(`process.stdout.write(${JSON.stringify(key.toHex())})`)
  }
  const result = resolveEnv(env, options)
  assert.equal(result.TOKEN, 'dummy-decrypted')
  assert.equal(result.DOTENV_PRIVATE_KEY, key.toHex())
  env.TOKEN = `encrypted:${Buffer.from(encrypt(key.publicKey.toHex(), Buffer.from('$(must-not-run)'))).toString('base64')}`
  assert.equal(resolveEnv(env, options).TOKEN, '$(must-not-run)')
})

test('failures leave the caller unchanged and never expose command output', posix, () => {
  const env = {
    FIRST: '$(printf dummy-first)',
    SECOND: expression("process.stdout.write('sensitive-stdout'); process.stderr.write('sensitive-stderr'); process.exit(2)")
  }
  const before = { ...env }
  assert.throws(() => resolveEnvInPlace(env, options), error => {
    assert.equal(error.code, 'COMMAND_FAILED')
    const message = `${formatError(error)}\n${error.stack}`
    assert.ok(!message.includes('sensitive-stdout'))
    assert.ok(!message.includes('sensitive-stderr'))
    assert.ok(!message.includes(env.SECOND))
    return true
  })
  assert.deepEqual(env, before)
})

test('invalid substitutions are rejected before any command executes', posix, t => {
  const directory = mkdtempSync(join(tmpdir(), 'resenv-command-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  for (const invalid of ['$()', '$(printf missing', 'prefix$(printf embedded)']) {
    const first = expression(`require('node:fs').writeFileSync(${JSON.stringify(join(directory, 'started'))}, 'yes')`)
    assert.throws(() => resolveEnv({ FIRST: first, SECOND: invalid }, options), { code: 'INVALID_COMMAND_VALUE' })
    assert.deepEqual(readdirSync(directory), [])
  }
})

test('commands have bounded time and output and reject invalid environment data', posix, () => {
  assert.throws(() => resolveEnv({ TOKEN: expression('setInterval(()=>{},1000)') }, { commands: true, commandTimeoutMs: 100 }), { code: 'COMMAND_TIMEOUT' })
  assert.throws(() => resolveEnv({ TOKEN: expression("process.stdout.write('x'.repeat(1000000))") }, options), { code: 'COMMAND_FAILED' })
  for (const bytes of [[0], [0xff, 0xfe]]) {
    assert.throws(() => resolveEnv({ TOKEN: expression(`process.stdout.write(Buffer.from(${JSON.stringify(bytes)}))`) }, options), { code: 'INVALID_ENV_VALUE' })
  }
  assert.throws(() => resolveEnv({ TOKEN: '$(printf test)' }, { commands: true, commandTimeoutMs: 0 }), { code: 'INVALID_OPTIONS' })
})

test('invalid command deadlines fail before any command executes', posix, t => {
  const directory = mkdtempSync(join(tmpdir(), 'resenv-deadline-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const command = expression(`require('node:fs').writeFileSync(${JSON.stringify(join(directory, 'started'))}, 'yes')`)
  for (const commandTimeoutMs of [-1, 0, 1.5, NaN, Infinity, 2147483648, '100']) {
    assert.throws(() => resolveEnv({ TOKEN: command }, { commands: true, commandTimeoutMs }), { code: 'INVALID_OPTIONS' })
    assert.deepEqual(readdirSync(directory), [])
  }
})

test('unexpected process-group cleanup failures remain safe and leave the caller unchanged', posix, t => {
  t.mock.method(process, 'kill', () => { throw Object.assign(new Error('dummy-sensitive-cleanup-detail'), { code: 'EPERM' }) })
  const env = { FIRST: '$(printf dummy-result)', SECOND: '$(exit 7)' }
  const before = { ...env }
  assert.throws(() => resolveEnvInPlace(env, options), err => {
    assert.equal(err.code, 'COMMAND_CLEANUP_FAILED')
    assert.ok(!err.stack.includes('dummy-sensitive'))
    assert.equal(err.cause, undefined)
    return true
  })
  assert.deepEqual(env, before)
})

test('command timeout cleans up the spawned process group', { ...posix, timeout: 5000 }, async t => {
  const directory = mkdtempSync(join(tmpdir(), 'resenv-timeout-'))
  const pidPath = join(directory, 'pid')
  let pid
  t.after(() => {
    if (pid) { try { process.kill(pid, 'SIGKILL') } catch {} }
    rmSync(directory, { recursive: true, force: true })
  })
  assert.throws(() => resolveEnv({ TOKEN: `$(sleep 30 & echo $! > ${quote(pidPath)}; wait)` }, { commands: true, commandTimeoutMs: 300 }), { code: 'COMMAND_TIMEOUT' })
  pid = Number(readFileSync(pidPath, 'utf8').trim())
  assert.ok(pid > 0)
  let alive = true
  for (let i = 0; i < 20 && alive; i++) {
    try { process.kill(pid, 0) } catch (error) {
      if (error.code === 'ESRCH') alive = false
      else throw error
    }
    if (alive) await new Promise(resolve => setTimeout(resolve, 25))
  }
  assert.equal(alive, false)
  pid = undefined
})

test('CLI and preloads resolve commands inherited from a dotenv loader', posix, t => {
  const cwd = mkdtempSync(join(tmpdir(), 'resenv-command-runtime-'))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  const file = join(cwd, '.env.serve')
  const source = 'TOKEN="$(printf dummy-provider-value)"\n'
  writeFileSync(file, source)
  // Simulate a dotenv loader passing the value to the app process. Envref must
  // use the inherited value, without requiring the file or loading it again.
  const env = { TOKEN: '$(printf dummy-provider-value)' }
  const starts = [
    [resolve(__dirname, '../dist/bin/resenv.cjs'), 'run', '--commands', '--', process.execPath],
    ['--require', resolve(__dirname, '../dist/resolve-commands.cjs')],
    ['--import', pathToFileURL(resolve(__dirname, '../dist/resolve-commands.mjs')).href]
  ]
  for (const prefix of starts) {
    const result = spawnSync(process.execPath, [...prefix, '-e', "if(process.env.TOKEN !== 'dummy-provider-value') process.exit(9)"], { cwd, env, encoding: 'utf8', timeout: 10000 })
    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.stdout, '')
    assert.equal(result.stderr, '')
    const failure = spawnSync(process.execPath, [...prefix, '-e', "require('node:fs').writeFileSync('started','yes')"], { cwd, env: { TOKEN: '$(printf sensitive-output; exit 7)' }, encoding: 'utf8', timeout: 10000 })
    assert.equal(failure.status, 1)
    assert.match(failure.stderr, /COMMAND_FAILED/)
    assert.ok(!failure.stderr.includes('sensitive-output'))
    assert.deepEqual(readdirSync(cwd), ['.env.serve'])
  }
  assert.equal(readFileSync(file, 'utf8'), source)
})
