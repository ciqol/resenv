import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { verifyArtifact } from '../scripts/release-artifact.mjs'

assert.ok(process.argv.length <= 4, 'Usage: npm run test:package -- [package.tgz [release.json]]')
const suppliedArchive = process.argv[2] ? resolve(process.argv[2]) : undefined
const root = fileURLToPath(new URL('..', import.meta.url))
const plan = process.argv[3] ? verifyArtifact(dirname(resolve(process.argv[3])), { head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', timeout: 10000 }).trim() }).plan : undefined
if (plan) assert.equal(suppliedArchive, resolve(dirname(process.argv[3]), plan.archive), 'Test the archive described by this release plan')
const env = { PATH: `${dirname(process.execPath)}:${process.env.PATH}` }
const source = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const directory = mkdtempSync(join(tmpdir(), 'resenv-package-'))

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
    '--offline', '--no-audit', '--no-fund'
  ]
  const packArgs = suppliedArchive
    ? ['pack', suppliedArchive, '--dry-run', '--json']
    : ['pack', './dist', '--json', '--pack-destination', directory]
  const packed = JSON.parse(run('npm', [...npmOptions, ...packArgs], root).stdout)[0]
  assert.equal(packed.name, source.name)
  assert.equal(packed.version, plan?.version ?? source.version)
  assert.ok(!packed.files.some(file => /\.spec\./.test(file.path)), 'Unit specs must not be packed')
  for (const path of ['index.cjs', 'index.mjs', 'index.d.cts', 'index.d.mts', 'resolve-commands.cjs', 'resolve-commands.mjs', 'resolve-doppler.cjs', 'resolve-doppler.mjs', 'doppler-worker.cjs', 'CONTRIBUTING.md', 'SECURITY.md', 'docs/dependencies.md', 'docs/validation.md', 'docs/releasing.md', 'docs/doppler.md']) {
    assert.ok(packed.files.some(file => file.path === path), `Missing package file: ${path}`)
  }
  assert.ok(packed.files.every(file => !/^(src|test|scripts|node_modules)\//.test(file.path) && !file.path.split('/').some(part => part.startsWith('.env'))))
  assert.ok(packed.files.every(file => !file.path.endsWith('.ts') || file.path.endsWith('.d.ts')), 'TypeScript implementation must not ship')
  for (const path of ['types/src/index.d.ts', 'types/src/types.d.ts', 'types/src/errors.d.ts']) {
    assert.ok(packed.files.some(file => file.path === path), `Missing generated declaration: ${path}`)
  }
  if (source.license !== 'UNLICENSED') assert.ok(packed.files.some(file => file.path === 'LICENSE'))
  assert.ok(packed.files.find(file => file.path === 'bin/resenv.cjs').mode & 0o111, 'CLI must remain executable')
  const archive = suppliedArchive ?? join(directory, packed.filename)
  const readme = run('tar', ['-xOf', archive, 'package/README.md'], root).stdout
  assert.equal(readme, readFileSync(join(root, 'README.md'), 'utf8'), 'Packed README must match the checked-out documentation')
  const install = readme.split(/^## /m).find(section => section.startsWith('Install\n'))
  assert.ok(install, 'README must include application installation instructions')
  assert.match(install, /npm install --save-exact @ciqol\/resenv@beta/, 'Application installation must use the public npm beta')
  assert.doesNotMatch(install, /\.tgz\b|file:|\/path\/to\//, 'Local archive installation belongs in CONTRIBUTING.md')
  assert.doesNotMatch(readme, /not (?:yet )?published|has not been published|once .{0,40}published|currently distributed\s+as a package archive/i, 'README must not describe the public package as unpublished')
  const packedManifest = JSON.parse(run('tar', ['-xOf', archive, 'package/package.json'], root).stdout)
  const dependency = `file:${archive}`
  const dependencies = { [source.name]: dependency }
  // npm ci caches archives, but not necessarily registry metadata. Reuse the
  // reviewed lock entries so the clean consumer also installs offline with ci.
  const sourceLock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'))
  assert.equal(sourceLock.lockfileVersion, 3)
  const runtimePackages = Object.fromEntries(Object.entries(sourceLock.packages).filter(([path, entry]) => path && !entry.dev))
  writeFileSync(join(directory, 'package.json'), JSON.stringify({ private: true, dependencies, overrides: source.overrides }))
  writeFileSync(join(directory, 'package-lock.json'), JSON.stringify({
    lockfileVersion: 3,
    requires: true,
    packages: {
      '': { dependencies },
      ...runtimePackages,
      [`node_modules/${source.name}`]: {
        version: packedManifest.version,
        resolved: dependency,
        integrity: `sha512-${createHash('sha512').update(readFileSync(archive)).digest('base64')}`,
        dependencies: packedManifest.dependencies,
        bin: packedManifest.bin,
        engines: packedManifest.engines
      }
    }
  }))
  run('npm', [...npmOptions, 'ci'], directory)
  const packageRoot = join(directory, 'node_modules/@ciqol/resenv')
  const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'))
  assert.equal(manifest.private, plan?.publish ? undefined : true)
  assert.deepEqual(manifest.publishConfig, source.publishConfig)
  assert.equal(manifest.name, source.name)
  assert.equal(manifest.version, plan?.version ?? source.version)
  assert.equal(manifest.license, source.license)
  assert.deepEqual(manifest.dependencies, {})
  assert.deepEqual(Object.keys(runtimePackages), [])
  for (const field of ['scripts', 'devDependencies', 'type', 'overrides']) assert.equal(manifest[field], undefined)
  assert.equal(existsSync(join(directory, 'node_modules/rollup')), false)
  assert.equal(existsSync(join(directory, 'node_modules/typescript')), false)
  assert.equal(existsSync(join(directory, 'node_modules/eslint')), false)
  assert.equal(existsSync(join(directory, 'node_modules/typescript-eslint')), false)
  for (const dependency of ['@rollup/plugin-typescript', '@types/node', 'tslib', 'vitest', '@vitest/coverage-v8', 'vite', 'semantic-release', '@semantic-release/commit-analyzer', '@semantic-release/release-notes-generator']) {
    assert.equal(existsSync(join(directory, 'node_modules', dependency)), false)
  }
  for (const file of packed.files.filter(file => /\.(cjs|mjs)$/.test(file.path))) {
    assert.ok(!/\b(?:require\(['"]tslib['"]\)|from ['"]tslib['"])/.test(readFileSync(join(packageRoot, file.path), 'utf8')), 'Runtime output must not depend on compiler helpers')
  }
  for (const entry of Object.values(manifest.exports)) {
    if (typeof entry !== 'object') continue
    assert.equal(Object.keys(entry)[0], 'types')
    for (const target of [entry.import, entry.require, entry.types.import, entry.types.require]) assert.ok(existsSync(resolve(packageRoot, target)))
  }

  const help = run('npx', [...npmOptions, '--no-install', 'resenv', '--help'], directory)
  assert.match(help.stdout, /Usage: resenv run/)
  assert.equal(help.stderr, '')

  const childEnv = { ...env, TOKEN: 'dummy-package-secret', COMMAND_VALUE: "$(printf 'dummy-command-secret')" }
  const check = "if (process.env.TOKEN !== 'dummy-package-secret') throw new Error('Token changed')"
  const checkCommand = "if (process.env.COMMAND_VALUE !== 'dummy-command-secret') throw new Error('Command was not resolved')"
  const probes = [
    ['--require', '@ciqol/resenv/resolve', '-e', check],
    ['--import', '@ciqol/resenv/resolve', '-e', check],
    ['-e', `const result = require('@ciqol/resenv').resolve(); if (result.TOKEN !== 'dummy-package-secret' || result === process.env || process.env.TOKEN !== 'dummy-package-secret') throw new Error('Default resolution must return a copy without replacing the input')`],
    ['--input-type=module', '-e', `import { resolve } from '@ciqol/resenv'; const result = resolve(); if (result.TOKEN !== 'dummy-package-secret' || result === process.env || process.env.TOKEN !== 'dummy-package-secret') throw new Error('Default resolution must return a copy without replacing the input')`],
    ['-e', `require('@ciqol/resenv').resolve(process.env, { replace: true }); ${check}`],
    ['-e', `global.document = { baseURI: 'https://example.invalid/' }; require('@ciqol/resenv').resolve(process.env, { replace: true }); ${check}`],
    ['--input-type=module', '-e', `import { resolve } from '@ciqol/resenv'; resolve(process.env, { replace: true }); ${check}`],
    [join(packageRoot, manifest.bin.resenv), 'run', '--', process.execPath, '-e', check],
    ['--require', '@ciqol/resenv/resolve-commands', '-e', `${check}; ${checkCommand}`],
    ['--import', '@ciqol/resenv/resolve-commands', '-e', `${check}; ${checkCommand}`],
    [join(packageRoot, manifest.bin.resenv), 'run', '--commands', '--', process.execPath, '-e', `${check}; ${checkCommand}`],
    ['--input-type=module', '-e', `
      import assert from 'node:assert/strict';
      import { createRequire } from 'node:module';
      import * as esm from '@ciqol/resenv';
      const cjs = createRequire(import.meta.url)('@ciqol/resenv');
      for (const name of ['ResenvError', 'resolve', 'formatError']) assert.equal(esm[name], cjs[name]);
      assert.equal(Object.hasOwn(esm, 'resolveEnv'), false);
      assert.equal(Object.hasOwn(esm, 'resolveEnvInPlace'), false);
      assert.equal(Object.hasOwn(cjs, 'resolveEnv'), false);
      assert.equal(Object.hasOwn(cjs, 'resolveEnvInPlace'), false);
      const error = new cjs.ResenvError('DUMMY', 'dummy');
      assert.ok(error instanceof esm.ResenvError);
      assert.match(esm.formatError(error), /DUMMY/);
    `]
  ]
  for (const args of probes) {
    const result = run(process.execPath, args, directory, childEnv)
    assert.equal(result.stdout, '')
    assert.equal(result.stderr, '')
  }
  const once = run(process.execPath, [
    '--require', '@ciqol/resenv/resolve-commands', '--import', '@ciqol/resenv/resolve-commands',
    '-e', "if (process.env.COMMAND_VALUE !== '$(exit 7)') throw new Error('Preload ran more than once')"
  ], directory, { ...env, COMMAND_VALUE: "$(printf '%s' '$(exit 7)')" })
  assert.equal(once.stdout, '')
  assert.equal(once.stderr, '')

  // Exercise the installed private worker without contacting a provider or
  // reading this machine's Doppler CLI login: an explicit invalid token fails first.
  for (const preload of ['--require', '--import']) {
    const failed = spawnSync(process.execPath, [preload, '@ciqol/resenv/resolve', '-e', "process.stdout.write('must-not-start')"], {
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
    import { ResenvError, resolve, formatError } from '@ciqol/resenv';
    import type { Environment, ResolveOptions } from '@ciqol/resenv';
    import '@ciqol/resenv/resolve';
    import '@ciqol/resenv/resolve-commands';
    import '@ciqol/resenv/resolve-doppler';
    const options: ResolveOptions = { commands: true, commandTimeoutMs: 1000 };
    const env: Environment = resolve({ TOKEN: 'plain' }, options);
    const updated: Environment = resolve(env, { replace: true });
    const message: string = formatError(new ResenvError('DUMMY', 'dummy'));
    // @ts-expect-error the old mutation option is removed
    resolve(env, { inPlace: true });
    // @ts-expect-error the old resolver name is removed
    import { resolveEnv } from '@ciqol/resenv';
    // @ts-expect-error provider selection is inferred from values
    resolve(env, { doppler: true });
    // @ts-expect-error command opt-in must be boolean
    resolve(env, { commands: 'yes' });
    // @ts-expect-error in-place opt-in must be boolean
    resolve(env, { replace: 'yes' });
    // @ts-expect-error environment values must be strings or undefined
    resolve({ TOKEN: 42 });
    // @ts-expect-error resolver options are immutable
    options.commands = false;
    const resolvedLiteral = resolve({ TOKEN: 'doppler://dummy/dev/API_KEY' as const }, { replace: true });
    // @ts-expect-error resolved values cannot retain the original reference's literal type
    const staleLiteral: 'doppler://dummy/dev/API_KEY' = resolvedLiteral.TOKEN;
  `
  const consumers = ['consumer.cts', 'consumer.mts'].map(name => join(directory, name))
  for (const file of consumers) writeFileSync(file, consumer)
  const program = ts.createProgram(consumers, { strict: true, noUncheckedIndexedAccess: true, noEmit: true, types: [], module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, target: ts.ScriptTarget.ES2022 })
  const diagnostics = ts.getPreEmitDiagnostics(program)
  assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: file => file, getCurrentDirectory: () => directory, getNewLine: () => '\n'
  }))
  process.stdout.write(`Packed package: ${probes.length + 4} runtime checks and 2 typed consumers passed.\n`)
} finally {
  rmSync(directory, { recursive: true, force: true })
}
