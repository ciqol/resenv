import assert from 'node:assert/strict'
import { appendFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { githubRequest, registryMetadata, listReleases, downloadAsset } from './release-services.mjs'
import { reconcileRelease } from './release-lifecycle.mjs'

export function validateFinalizer (env, expires, now = Date.now()) {
  assert.ok(now < Date.parse(expires), 'Publishing platform security review has expired')
  assert.equal(env.GITHUB_ACTIONS, 'true')
  assert.ok(['schedule', 'workflow_run', 'workflow_dispatch'].includes(env.GITHUB_EVENT_NAME))
  assert.equal(env.GITHUB_REPOSITORY, 'ciqol/resenv')
  assert.equal(env.GITHUB_REF, 'refs/heads/beta')
  assert.equal(env.GITHUB_WORKFLOW_REF, 'ciqol/resenv/.github/workflows/finalize-release.yml@refs/heads/beta')
  assert.equal(env.RELEASE_ENABLED, 'true')
  assert.ok(env.GITHUB_TOKEN)
  if (env.REJECT_VERSION) {
    assert.equal(env.GITHUB_EVENT_NAME, 'workflow_dispatch', 'Rejection requires an explicit maintainer dispatch')
    assert.match(env.REJECT_VERSION, /^0\.1\.0-beta\.[1-9]\d*$/)
  }
}

async function main () {
  assert.equal(process.argv.length, 2, 'Usage: node scripts/finalize-release.mjs')
  const policy = JSON.parse(readFileSync(new URL('../docs/security-exceptions.json', import.meta.url), 'utf8'))
  validateFinalizer(process.env, policy.expires)
  const reject = process.env.REJECT_VERSION || undefined
  const directory = mkdtempSync(join(tmpdir(), 'resenv-finalize-'))
  try {
    const result = await reconcileRelease(directory, { github: githubRequest, registry: registryMetadata, releases: listReleases, download: downloadAsset }, { reject })
    const message = result.pending ? `Release ${result.version}: ${result.state}; waiting for npm publication. A staging intent without a receipt requires maintainer review before any retry.` : `Release lifecycle: ${result.state}${result.version ? ` (${result.version})` : ''}`
    console.log(message)
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${message}\n`)
  } finally { rmSync(directory, { recursive: true, force: true }) }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main()
