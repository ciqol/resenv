import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrivateKey, encrypt } from 'eciesjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const token = 'dp.ct.dummy0123456789'

test('private worker rejects malformed environment input before credential lookup', () => {
  for (const input of [null, [], { TOKEN: 42 }, { TOKEN: { secret: 'dummy-sensitive-input' } }]) {
    const result = spawnSync(process.execPath, [join(root, 'dist/doppler-worker.cjs')], {
      input: JSON.stringify(input), env: {}, encoding: 'utf8', timeout: 10000
    })
    assert.equal(result.error, undefined)
    assert.equal(result.status, 1)
    assert.equal(JSON.parse(result.stdout).error.code, 'DOPPLER_RESOLUTION_FAILED')
    assert.ok(!result.stdout.includes('dummy-sensitive'))
    assert.equal(result.stderr, '')
  }
})

function fixture (t, responses) {
  const directory = mkdtempSync(join(tmpdir(), 'resenv-cloud-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const pkg = join(directory, 'node_modules/@ciqol/resenv')
  cpSync(join(root, 'dist'), pkg, { recursive: true })
  // This private copy supplies an in-memory HTTPS stub; the production package
  // has no endpoint override or NODE_OPTIONS hook that could redirect secrets.
  const worker = join(pkg, 'doppler-worker.cjs')
  const stub = `globalThis.fetch = async (url, options) => {
    if (url.origin !== 'https://api.doppler.com' || options.redirect !== 'error' || options.headers.authorization !== 'Bearer ${token}') throw new Error('Unexpected request');
    const name = url.searchParams.get('name');
    const fixture = ${JSON.stringify(responses)}[name];
    if (!fixture) throw new Error('Unexpected secret');
    return new Response(JSON.stringify(fixture.body), { status: fixture.status || 200 });
  };\n`
  writeFileSync(worker, stub + readFileSync(worker, 'utf8'))
  return { directory, pkg }
}

function run (args, cwd, env) {
  return spawnSync(process.execPath, args, { cwd, env, encoding: 'utf8', timeout: 10000 })
}

test('built Doppler preloads and CLI resolve before imports without executing secret output', t => {
  const value = '$(must-not-run)\nencrypted:literal\n'
  const { directory, pkg } = fixture(t, { API_KEY: { body: { value: { computed: value } } } })
  writeFileSync(join(directory, '.env.serve'), 'TOKEN=must-not-read-this-file\n')
  writeFileSync(join(directory, 'value.mjs'), 'export const value = process.env.TOKEN\n')
  writeFileSync(join(directory, 'app.mjs'), "import { value } from './value.mjs'; process.stdout.write(JSON.stringify(value))")
  const env = { TOKEN: 'doppler://my-app/dev/API_KEY', DOPPLER_TOKEN: token, NODE_DEBUG: 'resenv' }
  for (const args of [
    ['--require', '@ciqol/resenv/resolve', 'app.mjs'],
    ['--import', '@ciqol/resenv/resolve', 'app.mjs'],
    [join(pkg, 'bin/resenv.cjs'), 'run', '--', process.execPath, 'app.mjs'],
    ['--require', '@ciqol/resenv/resolve-doppler', 'app.mjs'],
    ['--import', '@ciqol/resenv/resolve-doppler', 'app.mjs'],
    [join(pkg, 'bin/resenv.cjs'), 'run', '--doppler', '--', process.execPath, 'app.mjs'],
    ['--require', '@ciqol/resenv/resolve-doppler', '--import', '@ciqol/resenv/resolve-doppler', 'app.mjs']
  ]) {
    const result = run(args, directory, env)
    assert.equal(result.status, 0, result.stderr)
    assert.equal(JSON.parse(result.stdout), value)
    const logs = result.stderr.replace(/^RESENV \d+: /gm, '').trim().split('\n')
    assert.deepEqual(logs, ['Replaced secret value for "TOKEN".', 'Done: replaced 1 secret value(s).'])
    for (const secret of [value, token, env.TOKEN]) assert.ok(!result.stderr.includes(secret))
  }
  assert.equal(readFileSync(join(directory, '.env.serve'), 'utf8'), 'TOKEN=must-not-read-this-file\n')
})

test('partial API failure leaves caller untouched and blocks application startup', t => {
  const { directory, pkg } = fixture(t, {
    FIRST: { body: { value: { computed: 'dummy-first' } } },
    SECOND: { status: 403, body: { messages: ['dummy-sensitive-body'] } }
  })
  const env = { FIRST: 'doppler://my-app/dev/FIRST', SECOND: 'doppler://my-app/dev/SECOND', DOPPLER_TOKEN: token }
  const program = "const {resolveEnvInPlace}=require('@ciqol/resenv'); try { resolveEnvInPlace(process.env,{doppler:true}); process.exit(9) } catch(e) { if(e.code!=='DOPPLER_ACCESS_DENIED'||!process.env.FIRST.startsWith('doppler://')) process.exit(8) }"
  const result = run(['-e', program], directory, env)
  assert.equal(result.status, 0, result.stderr)
  for (const args of [
    ['--require', '@ciqol/resenv/resolve', '-e', "throw new Error('must-not-start')"],
    ['--require', '@ciqol/resenv/resolve-doppler', '-e', "throw new Error('must-not-start')"],
    [join(pkg, 'bin/resenv.cjs'), 'run', '--doppler', '--', process.execPath, '-e', "throw new Error('must-not-start')"]
  ]) {
    const failed = run(args, directory, env)
    assert.equal(failed.status, 1)
    assert.match(failed.stderr, /DOPPLER_ACCESS_DENIED/)
    for (const value of ['dummy-sensitive-body', 'must-not-start', token]) assert.ok(!failed.stderr.includes(value))
    assert.equal(failed.stdout, '')
  }
})

test('cloud secrets can provide a decryption key while fetched output remains literal', t => {
  const key = new PrivateKey()
  const { directory, pkg } = fixture(t, {
    PRIVATE_KEY: { body: { value: { computed: key.toHex() } } },
    LITERAL: { body: { value: { computed: 'encrypted:not-ciphertext' } } }
  })
  // Reuse only the already reviewed runtime dependency tree in this fixture.
  const env = {
    DOPPLER_TOKEN: token,
    DOTENV_PRIVATE_KEY: 'doppler://my-app/dev/PRIVATE_KEY',
    LITERAL: 'doppler://my-app/dev/LITERAL',
    TOKEN: `encrypted:${Buffer.from(encrypt(key.publicKey.toHex(), Buffer.from('dummy-decrypted'))).toString('base64')}`
  }
  // Copy runtime dependencies only; this consumer has no build dependencies.
  for (const name of ['eciesjs', '@ecies', '@noble']) {
    cpSync(join(root, 'node_modules', name), join(pkg, 'node_modules', name), { recursive: true })
  }
  const result = run(['--require', '@ciqol/resenv/resolve-doppler', '-e', "if(process.env.TOKEN!=='dummy-decrypted'||process.env.LITERAL!=='encrypted:not-ciphertext') process.exit(9)"], directory, env)
  assert.equal(result.status, 0, result.stderr)
})

test('canonical and compatibility preloads do not resolve fetched references twice', t => {
  const literal = 'doppler://dummy/dev/DO_NOT_FETCH'
  const { directory } = fixture(t, { API_KEY: { body: { value: { computed: literal } } } })
  const result = run([
    '--require', '@ciqol/resenv/resolve', '--import', '@ciqol/resenv/resolve',
    '--require', '@ciqol/resenv/resolve-doppler', '--import', '@ciqol/resenv/resolve-doppler',
    '-e', 'process.stdout.write(process.env.TOKEN)'
  ], directory, { TOKEN: 'doppler://dummy/dev/API_KEY', DOPPLER_TOKEN: token })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout, literal)
})

test('mixing cloud and command preloads cannot execute a fetched shell expression', t => {
  const { directory } = fixture(t, { API_KEY: { body: { value: { computed: '$(printf dummy-expanded)' } } } })
  const result = run([
    '--require', '@ciqol/resenv/resolve', '--require', '@ciqol/resenv/resolve-commands',
    '-e', 'process.stdout.write(process.env.TOKEN)'
  ], directory, { TOKEN: 'doppler://dummy/dev/API_KEY', DOPPLER_TOKEN: token })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /CONFLICTING_PRELOADS/)
  assert.equal(result.stdout, '')
})

test('command-first mixed preloads also fail before reinterpreting resolved output', t => {
  const { directory } = fixture(t, {})
  const result = run([
    '--require', '@ciqol/resenv/resolve-commands', '--import', '@ciqol/resenv/resolve',
    '-e', 'process.stdout.write(process.env.TOKEN)'
  ], directory, { TOKEN: '$(printf encrypted:literal)' })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /CONFLICTING_PRELOADS/)
  assert.equal(result.stdout, '')
})

test('a preload combined with the CLI cannot resolve fetched values again', t => {
  const { directory, pkg } = fixture(t, { API_KEY: { body: { value: { computed: '$(printf dummy-expanded)' } } } })
  const result = run([
    '--require', '@ciqol/resenv/resolve', join(pkg, 'bin/resenv.cjs'), 'run', '--commands', '--',
    process.execPath, '-e', 'process.stdout.write(process.env.TOKEN)'
  ], directory, { TOKEN: 'doppler://dummy/dev/API_KEY', DOPPLER_TOKEN: token })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /CONFLICTING_PRELOADS/)
  assert.equal(result.stdout, '')
})

test('no-reference startup needs no credentials or worker and shell commands stay literal', t => {
  const { directory, pkg } = fixture(t, {})
  writeFileSync(join(pkg, 'doppler-worker.cjs'), "throw new Error('worker-must-not-start')")
  for (const [entry, value] of [['resolve', '$(must-not-run)'], ['resolve-doppler', 'plain']]) {
    const result = run(['--require', `@ciqol/resenv/${entry}`, '-e', 'process.stdout.write(process.env.TOKEN)'], directory, { TOKEN: value, CI: 'true' })
    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.stdout, value)
  }
})

test('login infers Doppler from inherited values without reading dotenv files', t => {
  const { directory, pkg } = fixture(t, {})
  const cli = join(pkg, 'bin/resenv.cjs')
  writeFileSync(join(directory, '.env'), 'TOKEN=doppler://dummy/dev/API_KEY\n')
  const empty = run([cli, 'login'], directory, {})
  assert.equal(empty.status, 0, empty.stderr)
  assert.match(empty.stderr, /Nothing to handle/)
  const inferred = run([cli, 'login'], directory, { TOKEN: 'doppler://dummy/dev/API_KEY', CI: 'true' })
  assert.equal(inferred.status, 1)
  assert.match(inferred.stderr, /DOPPLER_INTERACTIVE_REQUIRED/)
  const invalid = run([cli, 'login'], directory, { TOKEN: 'doppler://missing-config' })
  assert.equal(invalid.status, 1)
  assert.match(invalid.stderr, /DOPPLER_INVALID_REFERENCE/)
})

test('noninteractive login and malformed credentials never open a browser or read local credentials', t => {
  const { directory, pkg } = fixture(t, {})
  const cli = join(pkg, 'bin/resenv.cjs')
  const login = run([cli, 'login', 'doppler'], directory, {})
  assert.equal(login.status, 1)
  assert.match(login.stderr, /DOPPLER_INTERACTIVE_REQUIRED/)
  const resolve = run(['--require', '@ciqol/resenv/resolve-doppler', '-e', ''], directory, { TOKEN: 'doppler://my-app/dev/API_KEY', DOPPLER_TOKEN: 'dummy-invalid' })
  assert.equal(resolve.status, 1)
  assert.match(resolve.stderr, /DOPPLER_INVALID_TOKEN/)
  assert.ok(!resolve.stderr.includes('dummy-invalid'))
})
