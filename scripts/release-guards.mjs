import assert from 'node:assert/strict'
import { createRequire, registerHooks } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const plugins = ['@semantic-release/commit-analyzer', '@semantic-release/release-notes-generator']
const unusedTools = ['semantic-release', '@semantic-release/npm', '@semantic-release/github', 'npm']

// Omitted peers stay in the lockfile, but must not be reachable on disk from
// either the project or either plugin. Fail before audit or release planning.
export function assertReleaseToolIsolation (resolvers = [require.resolve, ...plugins.map(name => createRequire(require.resolve(name)).resolve)]) {
  for (const resolve of resolvers) {
    for (const name of unusedTools) {
      assert.throws(() => resolve(name), { code: 'MODULE_NOT_FOUND' }, `${name} must not be installed. Run npm ci with the committed peer-omission policy.`)
    }
  }
}

export function checkAudit (report, { policy, lock, now = Date.now() }) {
  assert.ok(report && !report.error && report.metadata && report.vulnerabilities, 'Invalid npm audit response')
  const reviewed = []
  for (const finding of Object.values(report.vulnerabilities)) {
    assert.ok(Array.isArray(finding.via) && finding.via.length > 0 && Array.isArray(finding.nodes) && finding.nodes.length > 0, 'Invalid audit finding')
    for (const parent of finding.via.filter(value => typeof value === 'string')) assert.ok(report.vulnerabilities[parent], `Missing propagated advisory: ${parent}`)
    for (const advisory of finding.via.filter(value => typeof value === 'object')) {
      if (!['moderate', 'high', 'critical'].includes(advisory.severity)) continue
      const exception = policy.exceptions.find(value => value.advisory === advisory.url && value.package === advisory.name)
      assert.ok(exception, `Unreviewed advisory: ${advisory.url}`)
      assert.ok(now < Date.parse(policy.expires), 'Release-tool security review has expired')
      for (const path of finding.nodes) {
        const installed = lock.packages[path]
        assert.ok(installed?.dev && exception.nodes.includes(path) && exception.versions.includes(installed.version), `Advisory outside reviewed development path: ${path}`)
      }
      reviewed.push(advisory.url)
    }
  }
  const severe = Object.values(report.vulnerabilities).some(value => ['moderate', 'high', 'critical'].includes(value.severity))
  assert.ok(!severe || reviewed.length > 0, 'Audit reported severe findings without reviewable advisories')
  return [...new Set(reviewed)]
}

export function guardReleaseTools () {
  assertReleaseToolIsolation()
  for (const [name, version] of Object.entries({ '@semantic-release/commit-analyzer': '13.0.1', '@semantic-release/release-notes-generator': '14.1.1', micromatch: '4.0.8', braces: '3.0.3' })) {
    const manifest = JSON.parse(readFileSync(join(dirname(require.resolve(name)), 'package.json'), 'utf8'))
    assert.equal(manifest.version, version, `Re-review release-tool guards before changing ${name}`)
  }
  const bracesPath = require.resolve('braces')
  const original = require(bracesPath)
  const blocked = () => { throw new Error('The reviewed release path must not execute braces') }
  require.cache[bracesPath].exports = new Proxy(original, {
    apply: blocked,
    get: (target, key) => typeof target[key] === 'function' ? blocked : target[key]
  })
  const hook = registerHooks({
    resolve (specifier, context, nextResolve) {
      assert.ok(!unusedTools.some(name => specifier === name || specifier.startsWith(`${name}/`)), 'Unselected release tools must not load in the release planner')
      const result = nextResolve(specifier, context)
      assert.ok(!/\/node_modules\/(?:semantic-release|@semantic-release\/(?:npm|github)|npm)\//.test(result.url), 'Unselected release tools must not load in the release planner')
      return result
    }
  })
  return () => {
    hook.deregister()
    require.cache[bracesPath].exports = original
  }
}
