import { createRequire } from 'node:module'
// Optional verification against a separately installed, pinned upstream package.
// Usage: node test/interop.mjs /absolute/path/to/@dotenvx/primitives
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { join, resolve, isAbsolute } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolveEnv } from '../dist/index.mjs'

const require = createRequire(import.meta.url)
const __dirname = fileURLToPath(new URL('.', import.meta.url))

const upstreamPath = process.argv[2]
assert.ok(upstreamPath && isAbsolute(upstreamPath), 'Provide an absolute path to the separately installed upstream primitives package.')
const upstream = require(upstreamPath)
const cli = resolve(__dirname, '../dist/bin/envref.cjs')
const register = resolve(__dirname, '../dist/register.cjs')
const cwd = mkdtempSync(join(tmpdir(), 'envref-interop-'))
const { privateKey, publicKey } = upstream.keypair()
const plain = ['', '\uFEFFleading BOM', 'dummy 🌍\n$(echo literal) ${HOME}', 'normal-dummy-token']
let checks = 0

try {
  for (const expected of plain) {
    const ciphertext = upstream.encrypt(publicKey, expected)
    assert.equal(upstream.decrypt(privateKey, ciphertext), expected)
    const env = { PATH: process.env.PATH, DOTENV_PRIVATE_KEY: privateKey, TOKEN: ciphertext }
    assert.equal(resolveEnv(env).TOKEN, expected)
    checks++
    for (const prefix of [[cli, 'run', '--', process.execPath], ['--require', register], ['--import', pathToFileURL(register.replace(/\.cjs$/, '.mjs')).href]]) {
      const result = spawnSync(process.execPath, [...prefix, '-e', 'process.stdout.write(JSON.stringify(process.env.TOKEN))'], { cwd, env, encoding: 'utf8', timeout: 10000 })
      assert.equal(result.error, undefined)
      assert.equal(result.status, 0, result.stderr)
      assert.equal(JSON.parse(result.stdout), expected)
      assert.equal(result.stderr, '')
      checks++
    }
  }
  assert.deepEqual(readdirSync(cwd), [])
  console.log(`${checks} upstream ciphertext compatibility checks passed on ${process.version}; no files created.`)
} finally {
  rmSync(cwd, { recursive: true, force: true })
}
