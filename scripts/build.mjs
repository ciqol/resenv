import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { rollup } from 'rollup'
import config, { esmFacadeConfig } from '../rollup.config.mjs'
import { validatePlan } from './release-artifact.mjs'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'

const root = fileURLToPath(new URL('..', import.meta.url))
process.chdir(root)
assert.ok(process.argv.length === 2 || (process.argv.length === 4 && process.argv[2] === '--release-plan'), 'Usage: npm run build -- [--release-plan <release.json>]')
const plan = process.argv[3] ? validatePlan(JSON.parse(readFileSync(resolve(process.argv[3]), 'utf8')), execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()) : undefined
const directory = resolve(root, 'dist')
rmSync(directory, { recursive: true, force: true })

async function build (configuration) {
  const { output, ...input } = configuration
  const bundle = await rollup(input)
  try { return await bundle.write(output) } finally { await bundle.close() }
}

try {
  const result = await build(config)
  await build(esmFacadeConfig(result.output))
  const source = JSON.parse(readFileSync('package.json', 'utf8'))
  const { devDependencies, scripts, type, overrides, files, ...manifest } = source
  if (plan?.publish) {
    manifest.version = plan.version
    delete manifest.private
  } else manifest.private = true
  const rebase = value => {
    if (typeof value === 'string') return value.replace(/^(\.\/)?dist\//, './')
    return Object.fromEntries(Object.entries(value).map(([name, entry]) => [name, rebase(entry)]))
  }
  for (const field of ['main', 'module', 'types', 'exports', 'bin']) manifest[field] = rebase(source[field])
  manifest.files = ['*.cjs', '*.mjs', '*.d.cts', '*.d.mts', 'doppler', 'bin', 'types', 'README.md', 'LICENSE', 'CONTRIBUTING.md', 'SECURITY.md', 'docs']
  writeFileSync(resolve(directory, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)

  for (const [entry, paths] of Object.entries(manifest.exports)) {
    if (typeof paths !== 'object') continue
    const name = entry === '.' ? 'index' : entry.slice(2)
    const declaration = `export * from './types/src/${name}.js'\n`
    if (!existsSync(resolve(directory, `types/src/${name}.d.ts`))) throw new Error(`Missing generated declaration for ${entry}`)
    for (const path of [paths.types.import, paths.types.require]) {
      const target = resolve(directory, path)
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, declaration)
    }
  }
  for (const file of ['README.md', 'LICENSE', 'CONTRIBUTING.md', 'SECURITY.md', 'docs']) {
    if (existsSync(file)) cpSync(file, resolve(directory, file), { recursive: true })
  }
  chmodSync(resolve(directory, manifest.bin.resenv), 0o755)
  process.stdout.write(`Built CommonJS, ESM facades, declarations and ${manifest.private ? 'private prototype' : 'release candidate'} manifest in dist/.\n`)
} catch (err) {
  rmSync(directory, { recursive: true, force: true })
  throw err
}
