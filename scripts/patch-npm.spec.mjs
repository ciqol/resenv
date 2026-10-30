import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { patchNpm } from './patch-npm.mjs'

const roots = []
const write = (path, value) => {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, typeof value === 'string' ? value : JSON.stringify(value))
}
const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), 'resenv-npm-repair-'))
  roots.push(root)
  write(join(root, 'node_modules/npm/package.json'), { name: 'npm', version: '11.21.1' })
  const lock = { packages: {} }
  for (const [name, version, original] of [['undici', '6.29.1', '6.29.0'], ['ip-address', '10.7.5', '10.7.2']]) {
    const alias = `node_modules/npm-${name}-patch`
    const target = `node_modules/npm/node_modules/${name}`
    write(join(root, alias, 'package.json'), { name, version })
    write(join(root, alias, 'lib/index.js'), 'patched fixture')
    write(join(root, target, 'package.json'), { name, version: original })
    write(join(root, target, 'obsolete.js'), 'original fixture')
    lock.packages[alias] = { version, resolved: `https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`, integrity: 'fixture-integrity' }
    lock.packages[target] = { ...lock.packages[alias], inBundle: true }
  }
  write(join(root, 'package-lock.json'), lock)
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

it('replaces the original bundle, removes obsolete files and is idempotent', () => {
  const root = fixture()
  expect(() => patchNpm(root, true)).toThrow(/differs/)
  patchNpm(root)
  patchNpm(root, true)
  patchNpm(root)
  patchNpm(root, true)
  for (const name of ['undici', 'ip-address']) {
    expect(readFileSync(join(root, `node_modules/npm/node_modules/${name}/lib/index.js`), 'utf8')).toBe('patched fixture')
    expect(() => readFileSync(join(root, `node_modules/npm/node_modules/${name}/obsolete.js`))).toThrow()
  }
})

it.each(['modified', 'missing', 'extra', 'symlink'])('rejects a %s installed file without silently repairing it', change => {
  const root = fixture()
  patchNpm(root)
  const target = join(root, 'node_modules/npm/node_modules/undici')
  const path = join(target, 'lib/index.js')
  if (change === 'modified') write(path, 'modified fixture')
  if (change === 'missing') rmSync(path)
  if (change === 'extra') write(join(target, 'extra.js'), 'extra fixture')
  if (change === 'symlink') symlinkSync('lib/index.js', join(target, 'linked.js'))
  expect(() => patchNpm(root, true)).toThrow()
})

it.each(['version', 'resolved', 'integrity'])('rejects mismatched lockfile %s before replacing files', field => {
  const root = fixture()
  const path = join(root, 'package-lock.json')
  const lock = JSON.parse(readFileSync(path, 'utf8'))
  lock.packages['node_modules/npm/node_modules/undici'][field] = 'unexpected'
  write(path, lock)
  expect(() => patchNpm(root)).toThrow()
  expect(JSON.parse(readFileSync(join(root, 'node_modules/npm/node_modules/undici/package.json'), 'utf8')).version).toBe('6.29.0')
})

it('requires a new review when npm changes', () => {
  const root = fixture()
  write(join(root, 'node_modules/npm/package.json'), { name: 'npm', version: '11.21.2' })
  expect(() => patchNpm(root)).toThrow(/Review\/remove/)
})

it('rejects a patch that adds dependencies', () => {
  const root = fixture()
  write(join(root, 'node_modules/npm-undici-patch/package.json'), { name: 'undici', version: '6.29.1', dependencies: { unexpected: '1.0.0' } })
  expect(() => patchNpm(root)).toThrow(/new patch dependencies/)
})
