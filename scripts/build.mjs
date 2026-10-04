import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { rollup } from 'rollup'
import config, { esmFacadeConfig } from '../rollup.config.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
process.chdir(root)
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
  // Keep publication disabled in both manifests until separately authorized.
  manifest.private = true
  const rebase = value => {
    if (typeof value === 'string') return value.replace(/^(\.\/)?dist\//, './')
    return Object.fromEntries(Object.entries(value).map(([name, entry]) => [name, rebase(entry)]))
  }
  for (const field of ['main', 'module', 'types', 'exports', 'bin']) manifest[field] = rebase(source[field])
  manifest.files = ['*.cjs', '*.mjs', '*.d.cts', '*.d.mts', 'chunks', 'bin', 'README.md', 'LICENSE', 'CONTRIBUTING.md', 'SECURITY.md', 'docs']
  writeFileSync(resolve(directory, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)

  for (const [entry, paths] of Object.entries(manifest.exports)) {
    if (typeof paths !== 'object') continue
    const declaration = entry === '.' ? readFileSync('src/index.d.ts', 'utf8') : 'export {}\n'
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
  process.stdout.write('Built CommonJS, ESM facades, declarations and private package manifest in dist/.\n')
} catch (error) {
  rmSync(directory, { recursive: true, force: true })
  throw error
}
