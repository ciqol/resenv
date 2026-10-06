import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = fileURLToPath(new URL('..', import.meta.url))
const marker = 'dummy-credential-must-not-be-logged'
const cases = [
  ['commands', ['--input-type=module', '-e', `
    import { resolveEnv } from './dist/index.mjs';
    resolveEnv({ TOKEN: '$(printf dummy)', SECRET: process.env.SECRET }, { commands: true });
  `]],
  ['Doppler bridge', ['--require', './dist/resolve.cjs', '-e', "throw new Error('application-must-not-start')"]],
  ['CLI child', ['./dist/bin/resenv.cjs', 'run', '--', process.execPath, '-e', "throw new Error('application-must-not-start')"]],
  ['credential helpers', ['--input-type=module', '-e', `
    import { createSystem } from './src/doppler/system.mjs';
    const system = createSystem({ platform: 'darwin', exists: () => true, run: () => { throw new Error('helper-must-not-start'); } });
    system.write('dp.ct.dummy0123456789');
  `]]
]

for (const [name, args] of cases) {
  test(`${name} rejects Node child-process diagnostics before credentials can leak`, () => {
    for (const selector of ['child_process', 'CHILD_PROCESS,resenv', '*']) {
      const result = spawnSync(process.execPath, args, {
        cwd: root,
        env: { NODE_DEBUG: selector, SECRET: marker, DOPPLER_TOKEN: marker, ...(name === 'Doppler bridge' ? { TOKEN: 'doppler://dummy/dev/KEY' } : {}) },
        encoding: 'utf8', timeout: 10000
      })
      assert.equal(result.status, 1)
      assert.match(result.stderr, /UNSAFE_DEBUG_LOGGING/)
      assert.ok(!result.stderr.includes(marker))
      assert.ok(!result.stderr.includes('dp.ct.dummy0123456789'))
      assert.equal(result.stdout, '')
    }
  })
}

test('cached Node debug state cannot be bypassed by changing process.env', () => {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import { resolveEnv } from './dist/index.mjs';
    delete process.env.NODE_DEBUG;
    resolveEnv({ TOKEN: '$(printf dummy)', SECRET: process.env.SECRET }, { commands: true });
  `], { cwd: root, env: { NODE_DEBUG: 'child_process', SECRET: marker }, encoding: 'utf8', timeout: 10000 })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /UNSAFE_DEBUG_LOGGING/)
  assert.ok(!result.stderr.includes(marker))
})

test('a plain environment does not trigger the child-process diagnostic guard', () => {
  const result = spawnSync(process.execPath, ['--require', './dist/resolve.cjs', '-e', ''], {
    cwd: root, env: { NODE_DEBUG: 'child_process', VALUE: 'plain' }, encoding: 'utf8', timeout: 10000
  })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stderr, '')
})
