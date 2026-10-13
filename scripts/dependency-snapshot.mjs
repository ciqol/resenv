import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export function createSnapshot (bom, env) {
  assert.equal(env.GITHUB_REF, 'refs/heads/beta')
  assert.match(env.SNAPSHOT_SHA, /^[a-f0-9]{40}$/)
  const components = new Map(bom.components.map(component => [component['bom-ref'], component]))
  const dependencies = new Map(bom.dependencies.map(entry => [entry.ref, entry.dependsOn ?? []]))
  const root = bom.metadata.component['bom-ref']
  assert.ok(dependencies.has(root), 'Dependency snapshot is missing the root dependency list')
  const direct = new Set(dependencies.get(root))
  const packageUrl = ref => {
    const url = components.get(ref)?.purl
    assert.ok(url?.startsWith('pkg:npm/'), 'Dependency snapshot contains an unresolved npm package')
    return url
  }
  for (const ref of direct) packageUrl(ref)
  const resolved = Object.fromEntries([...components].map(([ref, component]) => [packageUrl(ref), {
    package_url: packageUrl(ref),
    relationship: direct.has(ref) ? 'direct' : 'indirect',
    scope: component.properties?.some(property => property.name === 'cdx:npm:package:development' && property.value === 'true') ? 'development' : 'runtime',
    dependencies: (dependencies.get(ref) ?? []).map(packageUrl)
  }]))
  return {
    version: 0,
    sha: env.SNAPSHOT_SHA,
    ref: env.GITHUB_REF,
    job: {
      id: `${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}`,
      correlator: 'resenv-beta-lockfile',
      html_url: `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
    },
    detector: { name: 'npm-sbom-api', version: bom.metadata.tools.find(tool => tool.vendor === 'npm').version, url: 'https://docs.npmjs.com/cli/v11/commands/npm-sbom' },
    scanned: bom.metadata.timestamp,
    manifests: { 'package-lock.json': { name: 'package-lock.json', file: { source_location: 'package-lock.json' }, resolved } }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(createSnapshot(JSON.parse(readFileSync(process.argv[2], 'utf8')), process.env)))
}
