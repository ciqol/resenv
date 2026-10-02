import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrivateKey, encrypt } from 'eciesjs'
import ts from 'typescript'

const root = fileURLToPath(new URL('..', import.meta.url))
const directory = mkdtempSync(join(tmpdir(), 'envref-package-'))
const env = { PATH: `${dirname(process.execPath)}:${process.env.PATH}` }
const source = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

function run (command, args, cwd, environment = env) {
  const result = spawnSync(command, args, { cwd, env: environment, encoding: 'utf8', timeout: 30000 })
  assert.equal(result.error, undefined)
  assert.equal(result.status, 0, result.stderr)
  return result
}

try {
  const userConfig = join(directory, 'user.npmrc')
  const globalConfig = join(directory, 'global.npmrc')
  writeFileSync(userConfig, '')
  writeFileSync(globalConfig, '')
  const npmOptions = [
    '--userconfig', userConfig, '--globalconfig', globalConfig,
    '--cache', process.env.npm_config_cache || join(homedir(), '.npm'),
    '--ignore-scripts', '--offline', '--no-audit', '--no-fund'
  ]
  const packed = JSON.parse(run('npm', [...npmOptions, 'pack', './dist', '--json', '--pack-destination', directory], root).stdout)[0]
  for (const path of ['index.cjs', 'index.mjs', 'index.d.cts', 'index.d.mts', 'register-commands.cjs', 'register-commands.mjs', 'register-doppler.cjs', 'register-doppler.mjs', 'doppler-worker.cjs', 'CONTRIBUTING.md', 'SECURITY.md', 'docs/dependencies.md', 'docs/validation.md', 'docs/releasing.md', 'docs/doppler.md']) {
    assert.ok(packed.files.some(file => file.path === path), `Missing package file: ${path}`)
  }
  assert.ok(packed.files.every(file => !/^(src|test|scripts|node_modules)\//.test(file.path) && !file.path.split('/').some(part => part.startsWith('.env'))))
  // Use the same reviewed runtime versions as the repository, without linking
  // its node_modules. npm ci populates the cache before this offline install.
  writeFileSync(join(directory, 'package.json'), JSON.stringify({ private: true, overrides: source.overrides }))
  run('npm', [...npmOptions, 'install', join(directory, packed.filename)], directory)
  const packageRoot = join(directory, 'node_modules/@ciqol/envref')
  const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'))
  assert.equal(manifest.private, true)
  for (const field of ['scripts', 'devDependencies', 'type', 'overrides']) assert.equal(manifest[field], undefined)
  assert.equal(existsSync(join(directory, 'node_modules/rollup')), false)
  assert.equal(existsSync(join(directory, 'node_modules/typescript')), false)
  for (const entry of Object.values(manifest.exports)) {
    if (typeof entry !== 'object') continue
    assert.equal(Object.keys(entry)[0], 'types')
    for (const target of [entry.import, entry.require, entry.types.import, entry.types.require]) assert.ok(existsSync(resolve(packageRoot, target)))
  }

  const key = new PrivateKey()
  const ciphertext = `encrypted:${Buffer.from(encrypt(key.publicKey.toHex(), Buffer.from('dummy-package-secret'))).toString('base64')}`
  const childEnv = { ...env, TOKEN: ciphertext, DOTENV_PRIVATE_KEY: key.toHex(), COMMAND_VALUE: "$(printf 'dummy-command-secret')" }
  const check = "if (process.env.TOKEN !== 'dummy-package-secret') throw new Error('Token was not resolved')"
  const checkCommand = "if (process.env.COMMAND_VALUE !== 'dummy-command-secret') throw new Error('Command was not resolved')"
  const probes = [
    ['--require', '@ciqol/envref/register', '-e', check],
    ['--import', '@ciqol/envref/register', '-e', check],
    ['-e', `require('@ciqol/envref').resolveEnvInPlace(); ${check}`],
    ['-e', `global.document = { baseURI: 'https://example.invalid/' }; require('@ciqol/envref').resolveEnvInPlace(); ${check}`],
    ['--input-type=module', '-e', `import { resolveEnvInPlace } from '@ciqol/envref'; resolveEnvInPlace(); ${check}`],
    [join(packageRoot, manifest.bin.envref), 'run', '--', process.execPath, '-e', check],
    ['--require', '@ciqol/envref/register-commands', '-e', `${check}; ${checkCommand}`],
    ['--import', '@ciqol/envref/register-commands', '-e', `${check}; ${checkCommand}`],
    [join(packageRoot, manifest.bin.envref), 'run', '--commands', '--', process.execPath, '-e', `${check}; ${checkCommand}`],
    ['--input-type=module', '-e', `
      import assert from 'node:assert/strict';
      import { createRequire } from 'node:module';
      import * as esm from '@ciqol/envref';
      const cjs = createRequire(import.meta.url)('@ciqol/envref');
      for (const name of ['EnvrefError', 'resolveEnv', 'resolveEnvInPlace', 'formatError']) assert.equal(esm[name], cjs[name]);
      const error = new cjs.EnvrefError('DUMMY', 'dummy');
      assert.ok(error instanceof esm.EnvrefError);
      assert.match(esm.formatError(error), /DUMMY/);
    `]
  ]
  for (const args of probes) {
    const result = run(process.execPath, args, directory, childEnv)
    assert.equal(result.stdout, '')
    assert.equal(result.stderr, '')
  }
  const once = run(process.execPath, [
    '--require', '@ciqol/envref/register-commands', '--import', '@ciqol/envref/register-commands',
    '-e', "if (process.env.COMMAND_VALUE !== '$(exit 7)') throw new Error('Preload ran more than once')"
  ], directory, { ...env, COMMAND_VALUE: "$(printf '%s' '$(exit 7)')" })
  assert.equal(once.stdout, '')
  assert.equal(once.stderr, '')

  // Exercise the installed private worker without contacting a provider or
  // reading this machine's keyring: an explicit invalid token fails first.
  for (const preload of ['--require', '--import']) {
    const failed = spawnSync(process.execPath, [preload, '@ciqol/envref/register', '-e', "process.stdout.write('must-not-start')"], {
      cwd: directory, env: { ...env, TOKEN: 'doppler://dummy/dev/TOKEN', DOPPLER_TOKEN: 'dummy-invalid' },
      encoding: 'utf8', timeout: 10000
    })
    assert.equal(failed.error, undefined)
    assert.equal(failed.status, 1)
    assert.match(failed.stderr, /DOPPLER_INVALID_TOKEN/)
    assert.ok(!failed.stderr.includes('dummy-invalid'))
    assert.equal(failed.stdout, '')
  }

  const consumer = `
    import { EnvrefError, resolveEnv, resolveEnvInPlace, formatError } from '@ciqol/envref';
    import type { Environment, ResolveOptions } from '@ciqol/envref';
    import '@ciqol/envref/register';
    import '@ciqol/envref/register-commands';
    import '@ciqol/envref/register-doppler';
    const options: ResolveOptions = { commands: true, doppler: true, commandTimeoutMs: 1000 };
    const env: Environment = resolveEnv({ TOKEN: 'plain' }, options);
    const same: Environment = resolveEnvInPlace(env);
    const message: string = formatError(new EnvrefError('DUMMY', 'dummy'));
    // @ts-expect-error command opt-in must be boolean
    resolveEnv(env, { commands: 'yes' });
    // @ts-expect-error environment values must be strings or undefined
    resolveEnv({ TOKEN: 42 });
  `
  const consumers = ['consumer.cts', 'consumer.mts'].map(name => join(directory, name))
  for (const file of consumers) writeFileSync(file, consumer)
  const program = ts.createProgram(consumers, { strict: true, noEmit: true, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, target: ts.ScriptTarget.ES2022 })
  const diagnostics = ts.getPreEmitDiagnostics(program)
  assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: file => file, getCurrentDirectory: () => directory, getNewLine: () => '\n'
  }))
  process.stdout.write(`Packed package: ${probes.length + 3} runtime checks and 2 typed consumers passed.\n`)
} finally {
  rmSync(directory, { recursive: true, force: true })
}
