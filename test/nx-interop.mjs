import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

if (!process.argv[2]) {
  process.stderr.write('Usage: npm run test:nx -- /absolute/path/to/workspace/node_modules\n')
  process.exit(2)
}

const modules = resolve(process.argv[2])
const nxPackage = JSON.parse(readFileSync(join(modules, 'nx/package.json'), 'utf8'))
const nx = resolve(modules, 'nx', nxPackage.bin.nx)
const preload = resolve(__dirname, '../dist/resolve-commands.cjs')
const directory = mkdtempSync(join(tmpdir(), 'resenv-nx-'))
const project = join(directory, 'app')
const env = {
  PATH: `${dirname(process.execPath)}:${process.env.PATH}`,
  CI: 'true',
  NX_DAEMON: 'false',
  NX_TUI: 'false',
  NX_SKIP_REMOTE_CACHE: 'true',
  NX_NO_CLOUD: 'true',
  NX_INTERACTIVE: 'false'
}

function run (target, extraEnv = {}) {
  const result = spawnSync(process.execPath, [nx, 'run', `app:${target}`, '--skipRemoteCache', '--outputStyle=static'], {
    cwd: directory, env: { ...env, ...extraEnv }, encoding: 'utf8', timeout: 60000
  })
  assert.equal(result.error, undefined)
  return result
}

try {
  mkdirSync(project)
  symlinkSync(modules, join(directory, 'node_modules'), 'dir')
  writeFileSync(join(directory, 'package.json'), JSON.stringify({ name: 'resenv-nx-fixture', private: true }))
  writeFileSync(join(directory, 'nx.json'), '{}')
  const quote = value => `'${value.replace(/'/g, "'\\''")}'`
  const command = `${quote(process.execPath)} --require=${quote(preload)} app.cjs`
  writeFileSync(join(project, 'project.json'), JSON.stringify({
    name: 'app', targets: Object.fromEntries(['serve', 'check'].map(target => [target, {
      executor: 'nx:run-commands', cache: false,
      options: { command, cwd: '{projectRoot}' }
    }]))
  }))
  writeFileSync(join(project, 'app.cjs'), "require('node:assert/strict').equal(process.env.TOKEN, process.env.EXPECTED_TOKEN); process.stdout.write('resenv-nx-ok\\n')")
  writeFileSync(join(directory, '.env'), 'TOKEN=root-value\n')
  writeFileSync(join(project, '.env.serve'), 'TOKEN="$(printf target-value)"\n')
  writeFileSync(join(project, '.env.serve.local'), 'TOKEN="$(printf local-value)"\n')

  for (const [target, extraEnv] of [
    ['serve', { EXPECTED_TOKEN: 'local-value' }],
    ['serve', { TOKEN: 'shell-value', EXPECTED_TOKEN: 'shell-value' }],
    ['check', { EXPECTED_TOKEN: 'root-value' }]
  ]) {
    const result = run(target, extraEnv)
    assert.equal(result.status, 0, result.stdout + result.stderr)
    assert.ok(result.stdout.includes('resenv-nx-ok'))
  }
  rmSync(join(project, '.env.serve.local'))
  const target = run('serve', { EXPECTED_TOKEN: 'target-value' })
  assert.equal(target.status, 0, target.stdout + target.stderr)
  writeFileSync(join(project, '.env.serve'), 'TOKEN="$(exit 7)"\n')
  const failed = run('serve')
  assert.notEqual(failed.status, 0)
  assert.ok(!failed.stdout.includes('resenv-nx-ok'))
  // Repeat the loader boundary with API references and a private dummy transport.
  const cloudPackage = join(directory, 'resenv')
  cpSync(resolve(__dirname, '../dist'), cloudPackage, { recursive: true })
  const worker = join(cloudPackage, 'doppler-worker.cjs')
  writeFileSync(worker, `globalThis.fetch = async url => {
    const name = url.searchParams.get('name');
    return name === 'FAIL' ? new Response('{}', {status:403})
      : new Response(JSON.stringify({value:{computed:'api-' + name}}));
  };\n` + readFileSync(worker, 'utf8'))
  const cloudCommand = `${quote(process.execPath)} --require=${quote(join(cloudPackage, 'resolve.cjs'))} app.cjs`
  writeFileSync(join(project, 'project.json'), JSON.stringify({
    name: 'app', targets: Object.fromEntries(['serve', 'check'].map(target => [target, {
      executor: 'nx:run-commands', cache: false,
      options: { command: cloudCommand, cwd: '{projectRoot}' }
    }]))
  }))
  writeFileSync(join(project, '.env.serve'), 'TOKEN=doppler://dummy/dev/TARGET\n')
  writeFileSync(join(project, '.env.serve.local'), 'TOKEN=doppler://dummy/dev/LOCAL\n')
  const auth = { DOPPLER_TOKEN: 'dp.ct.dummy0123456789' }
  for (const [target, extraEnv] of [
    ['serve', { EXPECTED_TOKEN: 'api-LOCAL' }],
    ['serve', { TOKEN: 'shell-value', EXPECTED_TOKEN: 'shell-value' }],
    ['check', { EXPECTED_TOKEN: 'root-value' }]
  ]) {
    const result = run(target, { ...auth, ...extraEnv })
    assert.equal(result.status, 0, result.stdout + result.stderr)
    assert.ok(result.stdout.includes('resenv-nx-ok'))
  }
  rmSync(join(project, '.env.serve.local'))
  const cloudTarget = run('serve', { ...auth, EXPECTED_TOKEN: 'api-TARGET' })
  assert.equal(cloudTarget.status, 0, cloudTarget.stdout + cloudTarget.stderr)
  writeFileSync(join(project, '.env.serve'), 'TOKEN=doppler://dummy/dev/FAIL\n')
  const cloudFailed = run('serve', auth)
  assert.notEqual(cloudFailed.status, 0)
  assert.ok(!cloudFailed.stdout.includes('resenv-nx-ok'))
  process.stdout.write(`Nx ${nxPackage.version}: command and Doppler modes passed target loading, local/shell precedence, target isolation and strict failure.\n`)
} finally {
  rmSync(directory, { recursive: true, force: true })
}
