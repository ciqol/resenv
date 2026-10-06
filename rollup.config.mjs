import { isBuiltin } from 'node:module'
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import typescript from '@rollup/plugin-typescript'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
const dependencies = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.peerDependencies ?? {})]
const input = Object.fromEntries(Object.values(pkg.exports)
  .filter(entry => typeof entry === 'object')
  .map(entry => {
    const name = entry.require.replace(/^\.\/dist\//, '').replace(/\.cjs$/, '')
    return [name, `src/${name}.ts`]
  }))
input['bin/resenv'] = 'bin/resenv.ts'
input['doppler-worker'] = 'src/doppler-worker.ts'

export default {
  input,
  external: id => isBuiltin(id) || dependencies.some(name => id === name || id.startsWith(`${name}/`)),
  plugins: [typescript({ tsconfig: './tsconfig.json' }), {
    name: 'resenv-node-import-meta',
    resolveImportMeta (property, { format }) {
      if (property === 'url' && format === 'cjs') return "require('node:url').pathToFileURL(__filename).href"
      return null
    }
  }],
  output: {
    dir: 'dist',
    format: 'cjs',
    exports: 'named',
    preserveModules: true,
    preserveModulesRoot: 'src',
    entryFileNames: '[name].cjs',
    chunkFileNames: '[name].cjs'
  }
}

// Both loading modes use the same functions, error class and preload cache.
// Export names come from Rollup's output, so the facade cannot drift from the API.
export function esmFacadeConfig (chunks) {
  const entries = chunks.filter(chunk => chunk.type === 'chunk' && chunk.isEntry)
  const prefix = '\0resenv-facade:'
  return {
    input: Object.fromEntries(entries.map(entry => [entry.name, `${prefix}${entry.name}`])),
    plugins: [{
      name: 'resenv-esm-facades',
      resolveId (id) {
        if (id.startsWith(prefix)) return id
        if (id.endsWith('.cjs')) return { id, external: true }
      },
      load (id) {
        if (!id.startsWith(prefix)) return null
        const entry = entries.find(entry => `${prefix}${entry.name}` === id)
        const target = JSON.stringify(`./${basename(entry.fileName)}`)
        return entry.exports.length
          ? `export { ${entry.exports.join(', ')} } from ${target}\n`
          : `import ${target}\n`
      }
    }],
    output: { dir: 'dist', format: 'es', entryFileNames: '[name].mjs' }
  }
}
