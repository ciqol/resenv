import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { PrivateKey, encrypt } from 'eciesjs'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const cli = resolve(__dirname, '../dist/bin/resenv.cjs')
const preload = resolve(__dirname, '../dist/resolve.cjs')

function fixture (t) {
  const cwd = mkdtempSync(join(tmpdir(), 'resenv-test-'))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  const key = new PrivateKey()
  const plaintext = 'dummy 🌍\n$(touch must-not-exist) ${HOME}'
  const ciphertext = `encrypted:${Buffer.from(encrypt(key.publicKey.toHex(), Buffer.from(plaintext))).toString('base64')}`
  // Do not inherit developer credentials into test children.
  const env = { PATH: process.env.PATH, TOKEN: ciphertext, DOTENV_PRIVATE_KEY: key.toHex() }
  if (process.platform === 'win32') env.SystemRoot = process.env.SystemRoot
  return { cwd, env, plaintext, ciphertext }
}

function run (args, context) {
  return spawnSync(process.execPath, args, { cwd: context.cwd, env: context.env, encoding: 'utf8', timeout: 10000 })
}

for (const [name, prefix] of [
  ['command wrapper', [cli, 'run', '--', process.execPath]],
  ['CommonJS preload', ['--require', preload]],
  ['ES module preload', ['--import', pathToFileURL(preload.replace(/\.cjs$/, '.mjs')).href]]
]) {
  test(`${name} decrypts before application imports and leaves files unchanged`, t => {
    const context = fixture(t)
    writeFileSync(join(context.cwd, '.env'), 'TOKEN=must-not-load\n')
    writeFileSync(join(context.cwd, '.env.keys'), 'DOTENV_PRIVATE_KEY=invalid-must-not-load\n')
    writeFileSync(join(context.cwd, 'value.mjs'), 'export const value = process.env.TOKEN\n')
    writeFileSync(join(context.cwd, 'app.mjs'), "import { value } from './value.mjs'; process.stdout.write(JSON.stringify(value))\n")
    const before = Object.fromEntries(readdirSync(context.cwd).map(name => [name, readFileSync(join(context.cwd, name), 'utf8')]))
    const result = run([...prefix, 'app.mjs'], context)
    assert.equal(result.error, undefined)
    assert.equal(result.status, 0, result.stderr)
    assert.equal(JSON.parse(result.stdout), context.plaintext)
    assert.equal(result.stderr, '')
    assert.deepEqual(Object.fromEntries(readdirSync(context.cwd).map(name => [name, readFileSync(join(context.cwd, name), 'utf8')])), before)
  })

  test(`${name} blocks application startup when a key is missing`, t => {
    const context = fixture(t)
    delete context.env.DOTENV_PRIVATE_KEY
    const result = run([...prefix, '-e', "require('node:fs').writeFileSync('started', 'yes')"], context)
    assert.equal(result.status, 1)
    assert.match(result.stderr, /MISSING_PRIVATE_KEY/)
    assert.ok(!result.stderr.includes(context.ciphertext))
    assert.equal(result.stdout, '')
    assert.deepEqual(readdirSync(context.cwd), [])
  })
}

test('wrapper preserves arguments, stdin, stdout and exit status', t => {
  const context = fixture(t)
  const args = ['spaces here', '$(touch must-not-exist)', '*', '--flag']
  const result = spawnSync(process.execPath, [cli, 'run', '--', process.execPath, '-e', "process.stdout.write(JSON.stringify({args:process.argv.slice(1),input:require('node:fs').readFileSync(0,'utf8')})); process.exitCode=23", '--', ...args], {
    cwd: context.cwd, env: context.env, input: 'input-data', encoding: 'utf8', timeout: 10000
  })
  assert.equal(result.status, 23)
  assert.deepEqual(JSON.parse(result.stdout), { args, input: 'input-data' })
  assert.equal(result.stderr, '')
  assert.deepEqual(readdirSync(context.cwd), [])
})

test('missing executable and invalid CLI usage return conventional error codes', t => {
  const context = fixture(t)
  assert.equal(run([cli], context).status, 2)
  const missing = run([cli, 'run', '--', join(context.cwd, 'absent-command'), 'dummy-sensitive-argument'], context)
  assert.equal(missing.status, 127)
  assert.match(missing.stderr, /COMMAND_NOT_FOUND/)
  assert.ok(!missing.stderr.includes('dummy-sensitive-argument'))
})

test('plaintext-only startup succeeds without loading the encryption library', t => {
  const context = fixture(t)
  context.env = { PATH: process.env.PATH, TOKEN: 'plain' }
  const result = run(['--require', preload, '-e', "if (Object.keys(require.cache).some(p=>p.includes('eciesjs'))) process.exit(9); process.stdout.write(process.env.TOKEN)"], context)
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout, 'plain')
})

test('wrapper forwards SIGTERM and preserves the child termination signal', { skip: process.platform === 'win32', timeout: 10000 }, async t => {
  const context = fixture(t)
  const child = spawn(process.execPath, [cli, 'run', '--', process.execPath, '-e', "process.stdout.write(String(process.pid)+'\\n'); setInterval(()=>{},1000)"], {
    cwd: context.cwd, env: context.env, stdio: ['ignore', 'pipe', 'pipe']
  })
  let applicationPid
  t.after(() => {
    child.kill('SIGKILL')
    if (applicationPid) { try { process.kill(applicationPid, 'SIGKILL') } catch {} }
  })
  const result = await new Promise((resolve, reject) => {
    let ready = ''
    child.once('error', reject)
    child.once('exit', (code, signal) => resolve({ code, signal }))
    child.stdout.on('data', data => {
      ready += data.toString()
      if (ready.includes('\n') && !applicationPid) {
        applicationPid = Number(ready.trim())
        child.kill('SIGTERM')
      }
    })
  })
  assert.deepEqual(result, { code: null, signal: 'SIGTERM' })
  assert.throws(() => process.kill(applicationPid, 0), { code: 'ESRCH' })
  applicationPid = undefined
})

test('NODE_DEBUG reports each result and a summary without exposing sensitive data', { skip: process.platform === 'win32' }, t => {
  const context = fixture(t)
  context.env.NODE_DEBUG = 'resenv'
  context.env.COMMAND_VALUE = "$(printf 'dummy-command-secret')"
  const result = run([cli, 'run', '--commands', '--', process.execPath, '-e', ''], context)
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout, '')
  assert.deepEqual(result.stderr.replace(/^RESENV \d+: /gm, '').trim().split('\n'), [
    'Replaced secret value for "COMMAND_VALUE".', 'Replaced secret value for "TOKEN".', 'Done: replaced 2 secret value(s).'
  ])
  for (const sensitive of [context.plaintext, context.ciphertext, context.env.DOTENV_PRIVATE_KEY, context.env.COMMAND_VALUE, 'dummy-command-secret']) {
    assert.ok(!result.stderr.includes(sensitive))
  }
})

test('NODE_DEBUG reports command failure while suppressing command text and output', { skip: process.platform === 'win32' }, t => {
  const context = fixture(t)
  context.env.NODE_DEBUG = 'resenv'
  const name = 'COMMAND\nVALUE'
  context.env[name] = "$(printf 'private-stdout'; printf 'private-stderr' >&2; exit 7)"
  const result = run([cli, 'run', '--commands', '--', process.execPath, '-e', "process.stdout.write('must-not-start')"], context)
  assert.equal(result.status, 1)
  assert.equal(result.stdout, '')
  const messages = result.stderr.split('\n').filter(line => line.startsWith('RESENV ')).map(line => line.replace(/^RESENV \d+: /, ''))
  assert.deepEqual(messages, [
    `Failed to replace secret value for ${JSON.stringify(name)}.`, 'Done: failed (COMMAND_FAILED); environment unchanged.'
  ])
  assert.equal(result.stderr.trim().split('\n').length, 3)
  for (const sensitive of ['private-stdout', 'private-stderr', context.env[name], context.env.DOTENV_PRIVATE_KEY, context.ciphertext]) {
    assert.ok(!result.stderr.includes(sensitive))
  }
})

test('NODE_DEBUG prints only nothing to handle when no enabled references exist', t => {
  const context = fixture(t)
  context.env = { NODE_DEBUG: 'resenv', VALUE: '$(must-not-run)' }
  const result = run(['--require', preload, '-e', ''], context)
  assert.equal(result.status, 0)
  assert.match(result.stderr, /^RESENV \d+: Nothing to handle\.\n$/)
  delete context.env.VALUE
  const empty = run(['--require', preload, '-e', ''], context)
  assert.equal(empty.status, 0)
  assert.match(empty.stderr, /^RESENV \d+: Nothing to handle\.\n$/)
})

test('NODE_DEBUG reports missing keys and invalid ciphertext as failures', t => {
  for (const code of ['MISSING_PRIVATE_KEY', 'INVALID_CIPHERTEXT']) {
    const context = fixture(t)
    context.env.NODE_DEBUG = 'resenv'
    if (code === 'MISSING_PRIVATE_KEY') delete context.env.DOTENV_PRIVATE_KEY
    else context.env.TOKEN = 'encrypted:dummy-invalid-ciphertext'
    const result = run(['--require', preload, '-e', "process.stdout.write('must-not-start')"], context)
    assert.equal(result.status, 1)
    assert.equal(result.stdout, '')
    const messages = result.stderr.split('\n').filter(line => line.startsWith('RESENV ')).map(line => line.replace(/^RESENV \d+: /, ''))
    assert.deepEqual(messages, ['Failed to replace secret value for "TOKEN".', `Done: failed (${code}); environment unchanged.`])
    for (const sensitive of [context.env.TOKEN, context.env.DOTENV_PRIVATE_KEY, context.plaintext].filter(Boolean)) {
      assert.ok(!result.stderr.includes(sensitive))
    }
  }
})
