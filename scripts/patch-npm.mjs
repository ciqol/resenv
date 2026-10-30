import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const patches = { undici: '6.29.1', 'ip-address': '10.7.5' }
const json = path => JSON.parse(readFileSync(path, 'utf8'))

function fingerprint (directory, prefix = '') {
  return readdirSync(join(directory, prefix), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
    const path = join(prefix, entry.name)
    if (entry.isDirectory()) return fingerprint(directory, path)
    assert.ok(entry.isFile(), 'Patch packages must contain only regular files and directories')
    return [[path, createHash('sha256').update(readFileSync(join(directory, path))).digest('hex')]]
  })
}

export function patchNpm (root, checkOnly = false) {
  const modules = join(root, 'node_modules')
  const npm = join(modules, 'npm')
  if (!existsSync(npm) && !checkOnly && process.env.npm_config_omit?.split(/\s+/).includes('dev')) return
  assert.equal(json(join(npm, 'package.json')).version, '11.21.1', 'Review/remove the temporary bundle repair when npm changes')
  const lock = json(join(root, 'package-lock.json'))
  for (const [name, version] of Object.entries(patches)) {
    const alias = `npm-${name}-patch`
    const source = join(modules, alias)
    const target = join(npm, 'node_modules', name)
    const manifest = json(join(source, 'package.json'))
    assert.equal(manifest.name, name)
    assert.equal(manifest.version, version)
    assert.deepEqual(manifest.dependencies ?? {}, {}, 'Review any new patch dependencies')
    const original = json(join(target, 'package.json'))
    assert.equal(original.name, name)
    assert.ok([version, name === 'undici' ? '6.29.0' : '10.7.2'].includes(original.version), 'Unexpected bundled version')
    const expected = lock.packages[`node_modules/${alias}`]
    const bundled = lock.packages[`node_modules/npm/node_modules/${name}`]
    assert.equal(expected.version, version)
    assert.equal(bundled.version, version, 'The lockfile must describe the repaired installation')
    assert.ok(expected.integrity)
    assert.equal(bundled.integrity, expected.integrity)
    assert.equal(bundled.resolved, expected.resolved)
    if (!checkOnly) {
      rmSync(target, { recursive: true })
      cpSync(source, target, { recursive: true })
    }
    assert.deepEqual(fingerprint(target), fingerprint(source), `${name}: installed bundle differs from the locked upstream fix`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assert.ok(process.argv.length === 2 || (process.argv.length === 3 && process.argv[2] === '--check'))
  patchNpm(fileURLToPath(new URL('..', import.meta.url)), process.argv[2] === '--check')
}
