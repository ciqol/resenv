import { expect, it } from 'vitest'
import { createSnapshot } from './dependency-snapshot.mjs'

const env = {
  SNAPSHOT_SHA: 'a'.repeat(40), GITHUB_SHA: 'b'.repeat(40), GITHUB_REF: 'refs/heads/beta',
  GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '2', GITHUB_SERVER_URL: 'https://github.com', GITHUB_REPOSITORY: 'ciqol/resenv'
}
const bom = {
  metadata: { component: { 'bom-ref': 'root' }, timestamp: '2026-10-13T00:00:00Z', tools: [{ vendor: 'npm', version: '11.17.0' }] },
  components: [
    { 'bom-ref': 'dev', purl: 'pkg:npm/%40example/tool@1.0.0', properties: [{ name: 'cdx:npm:package:development', value: 'true' }] },
    { 'bom-ref': 'runtime', purl: 'pkg:npm/runtime@2.0.0' },
    { 'bom-ref': 'child', purl: 'pkg:npm/child@3.0.0', properties: [{ name: 'cdx:npm:package:development', value: 'true' }] }
  ],
  dependencies: [{ ref: 'root', dependsOn: ['dev', 'runtime'] }, { ref: 'dev', dependsOn: ['child'] }]
}

it('preserves scopes and dependency edges while replacing the existing beta snapshot', () => {
  const snapshot = createSnapshot(bom, env)
  expect(snapshot.sha).toBe(env.SNAPSHOT_SHA)
  expect(snapshot.job).toEqual({ id: '123-2', correlator: 'resenv-beta-lockfile', html_url: 'https://github.com/ciqol/resenv/actions/runs/123' })
  expect(snapshot.detector.name).toBe('npm-sbom-api')
  expect(snapshot.manifests['package-lock.json'].resolved).toEqual({
    'pkg:npm/%40example/tool@1.0.0': { package_url: 'pkg:npm/%40example/tool@1.0.0', relationship: 'direct', scope: 'development', dependencies: ['pkg:npm/child@3.0.0'] },
    'pkg:npm/runtime@2.0.0': { package_url: 'pkg:npm/runtime@2.0.0', relationship: 'direct', scope: 'runtime', dependencies: [] },
    'pkg:npm/child@3.0.0': { package_url: 'pkg:npm/child@3.0.0', relationship: 'indirect', scope: 'development', dependencies: [] }
  })
})

it('emits an empty manifest when all dependencies have been removed', () => {
  const snapshot = createSnapshot({ ...bom, components: [], dependencies: [{ ref: 'root' }] }, env)
  expect(snapshot.manifests['package-lock.json'].resolved).toEqual({})
})

it('fails on unresolved dependency edges instead of submitting an incomplete graph', () => {
  expect(() => createSnapshot({ ...bom, dependencies: [...bom.dependencies, { ref: 'dev', dependsOn: ['missing'] }] }, env)).toThrow('unresolved npm package')
})

it('rejects snapshots outside the beta branch', () => {
  expect(() => createSnapshot(bom, { ...env, GITHUB_REF: 'refs/pull/2/merge' })).toThrow()
})
