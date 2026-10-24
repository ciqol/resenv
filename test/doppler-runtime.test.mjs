import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

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

function cliFixture (t, program) {
  const { directory, pkg } = fixture(t, { API_KEY: { body: { value: { computed: 'dummy-cloud' } } } })
  const home = join(directory, 'cli-home')
  const executable = join(home, 'bin', 'doppler')
  const record = join(directory, 'cli-calls.json')
  mkdirSync(join(home, 'bin'), { recursive: true })
  writeFileSync(executable, `#!${process.execPath}\nconst fs = require('node:fs');
    fs.writeFileSync(${JSON.stringify(record)}, JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd(), home: process.env.HOME, unrelated: process.env.UNRELATED, token: process.env.DOPPLER_TOKEN, loader: process.env.NODE_OPTIONS }));
    ${program}\n`, { mode: 0o700 })
  // The private package copy points only at a dummy executable. It cannot
  // discover an installed Doppler CLI or read the developer's credentials.
  const system = join(pkg, 'doppler/system.cjs')
  writeFileSync(system, readFileSync(system, 'utf8') + `
    const originalCreateSystem = exports.createSystem;
    exports.createSystem = () => originalCreateSystem({ home: ${JSON.stringify(home)}, exists: file => file === ${JSON.stringify(executable)} });
  `)
  return { directory, pkg, home, record }
}

test('runtime reads the CLI identity for the application directory without forwarding app secrets', { skip: process.platform === 'win32' }, t => {
  const { directory, pkg, home, record } = cliFixture(t, `process.stdout.write('${token}\\n');`)
  const application = join(directory, 'application')
  mkdirSync(application)
  const check = "if(process.env.TOKEN!=='dummy-cloud') process.exit(9)"
  const env = { TOKEN: 'doppler://dummy/dev/API_KEY', UNRELATED: 'dummy-sensitive-unrelated', NODE_DEBUG: 'ciqol:resenv' }
  for (const args of [
    ['--require', '@ciqol/resenv/resolve', '-e', check],
    ['--import', '@ciqol/resenv/resolve', '-e', check],
    [join(pkg, 'bin/resenv.cjs'), 'run', '--', process.execPath, '-e', check],
    ['-e', "const {resolve}=require('@ciqol/resenv'); if(resolve().TOKEN!=='dummy-cloud') process.exit(9)"]
  ]) {
    const result = run(args, application, env)
    assert.equal(result.status, 0, result.stderr)
    assert.deepEqual(JSON.parse(readFileSync(record, 'utf8')), {
      args: ['configure', 'get', 'token', '--plain', '--no-check-version', '--no-read-env'], cwd: realpathSync(application), home
    })
    assert.equal(result.stdout, '')
    for (const value of [token, env.UNRELATED]) assert.ok(!result.stderr.includes(value))
    rmSync(record)
  }
})

test('a failed CLI token lookup blocks startup without exposing captured output or trying login', { skip: process.platform === 'win32' }, t => {
  const { directory, record } = cliFixture(t, `process.stdout.write('${token}'); process.stderr.write('dummy-sensitive-helper-detail'); process.exit(1);`)
  const result = run(['--require', '@ciqol/resenv/resolve', '-e', "throw new Error('application-must-not-start')"], directory, { TOKEN: 'doppler://dummy/dev/API_KEY' })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /DOPPLER_AUTH_REQUIRED/)
  assert.match(result.stderr, /doppler login/)
  assert.deepEqual(JSON.parse(readFileSync(record, 'utf8')).args, ['configure', 'get', 'token', '--plain', '--no-check-version', '--no-read-env'])
  for (const value of [token, 'dummy-sensitive', 'application-must-not-start']) assert.ok(!result.stderr.includes(value))
  assert.equal(result.stdout, '')
})

test('built Doppler preloads and CLI resolve before imports without executing secret output', t => {
  const value = '$(must-not-run)\nencrypted:literal\n'
  const { directory, pkg } = fixture(t, { API_KEY: { body: { value: { computed: value } } } })
  writeFileSync(join(directory, '.env.serve'), 'TOKEN=must-not-read-this-file\n')
  writeFileSync(join(directory, 'value.mjs'), 'export const value = process.env.TOKEN\n')
  writeFileSync(join(directory, 'app.mjs'), "import { value } from './value.mjs'; process.stdout.write(JSON.stringify(value))")
  const env = { TOKEN: 'doppler://my-app/dev/API_KEY', DOPPLER_TOKEN: token, NODE_DEBUG: 'ciqol:resenv' }
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
    const logs = result.stderr.replace(/^CIQOL:RESENV \d+: /gm, '').trim().split('\n')
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
  const program = "const {resolve}=require('@ciqol/resenv'); try { resolve(process.env,{replace:true}); process.exit(9) } catch(e) { if(e.code!=='DOPPLER_ACCESS_DENIED'||!process.env.FIRST.startsWith('doppler://')) process.exit(8) }"
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

test('default CJS and ESM preloads leave shell expressions literal without credentials or side effects', t => {
  const { directory, pkg } = fixture(t, {})
  writeFileSync(join(pkg, 'doppler-worker.cjs'), "throw new Error('worker-must-not-start')")
  const marker = join(directory, 'command-must-not-create-this')
  const value = `$(printf dummy > '${marker}')`
  for (const preload of ['--require', '--import']) {
    for (const entry of ['resolve', 'resolve-doppler']) {
      const result = run([preload, `@ciqol/resenv/${entry}`, '-e', 'process.stdout.write(process.env.TOKEN)'], directory, {
        TOKEN: value, RESENV_COMMANDS: 'true', CI: 'true'
      })
      assert.equal(result.status, 0, result.stderr)
      assert.equal(result.stdout, value)
      assert.equal(existsSync(marker), false)
    }
  }
})

test('built library without references never starts the credential worker', t => {
  const { directory, pkg } = fixture(t, {})
  writeFileSync(join(pkg, 'doppler-worker.cjs'), "throw new Error('worker-must-not-start')")
  const result = run(['-e', "const {resolve}=require('@ciqol/resenv'); const result=resolve(); if(result.TOKEN!==process.env.TOKEN||result===process.env) process.exit(9)"], directory, { TOKEN: '$(must-not-run)', CI: 'true' })
  assert.equal(result.status, 0, result.stderr)
})

test('removed authentication commands direct users to Doppler without starting helpers', t => {
  const { directory, pkg } = fixture(t, {})
  const cli = join(pkg, 'bin/resenv.cjs')
  const system = join(pkg, 'doppler/system.cjs')
  writeFileSync(system, readFileSync(system, 'utf8') + "\nexports.createSystem = () => { throw new Error('helper-must-not-run'); };\n")
  for (const args of [['login'], ['login', 'doppler'], ['login', 'doppler', '--cli'], ['logout', 'doppler']]) {
    const result = run([cli, ...args], directory, { TOKEN: 'doppler://dummy/dev/API_KEY' })
    assert.equal(result.status, 2)
    assert.match(result.stderr, /doppler login and doppler logout/)
    assert.ok(!result.stderr.includes('helper-must-not-run'))
    assert.equal(result.stdout, '')
  }
  const help = run([cli, '--help'], directory, {})
  assert.equal(help.status, 0, help.stderr)
  assert.match(help.stdout, /doppler login and doppler logout/)
  assert.doesNotMatch(help.stdout, /resenv login|resenv logout/)
})

test('malformed explicit credentials fail without reading the CLI login', t => {
  const { directory } = fixture(t, {})
  const result = run(['--require', '@ciqol/resenv/resolve-doppler', '-e', ''], directory, { TOKEN: 'doppler://my-app/dev/API_KEY', DOPPLER_TOKEN: 'dummy-invalid' })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /DOPPLER_INVALID_TOKEN/)
  assert.ok(!result.stderr.includes('dummy-invalid'))
})

test('built CommonJS and ESM library calls infer cloud references without options', t => {
  const { directory } = fixture(t, { API_KEY: { body: { value: { computed: 'dummy-cloud' } } } })
  const check = "const result=resolve(); if(result.TOKEN!=='dummy-cloud'||result===process.env||process.env.TOKEN!=='doppler://dummy/dev/API_KEY') process.exit(9)"
  for (const args of [
    ['-e', "const {resolve}=require('@ciqol/resenv'); " + check],
    ['--input-type=module', '-e', "import {resolve} from '@ciqol/resenv'; " + check]
  ]) {
    const result = run(args, directory, { TOKEN: 'doppler://dummy/dev/API_KEY', DOPPLER_TOKEN: token })
    assert.equal(result.status, 0, result.stderr)
  }
})

test('commands opt-in combines original shell and cloud references in one pass', t => {
  const literal = '$(must-not-run)'
  const { directory, pkg } = fixture(t, { API_KEY: { body: { value: { computed: literal } } } })
  const env = {
    TOKEN: 'doppler://dummy/dev/API_KEY',
    DOPPLER_TOKEN: `$(printf '%s' '${token}')`,
    LOCAL: '$(printf dummy-local)'
  }
  const check = "if(process.env.TOKEN!=='$(must-not-run)'||process.env.LOCAL!=='dummy-local') process.exit(9)"
  for (const args of [
    ['--require', '@ciqol/resenv/resolve-commands', '-e', check],
    ['--import', '@ciqol/resenv/resolve-commands', '-e', check],
    [join(pkg, 'bin/resenv.cjs'), 'run', '--commands', '--', process.execPath, '-e', check],
    ['-e', "const {resolve}=require('@ciqol/resenv'); const result=resolve(process.env,{commands:true}); if(result.TOKEN!=='$(must-not-run)'||result.LOCAL!=='dummy-local'||process.env.LOCAL!=='$(printf dummy-local)') process.exit(9)"]
  ]) {
    const result = run(args, directory, env)
    assert.equal(result.status, 0, result.stderr)
  }
})
