import assert from 'node:assert/strict'
import { appendFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { githubRequest, registryMetadata, listReleases, downloadAsset } from './release-services.mjs'
import { finalizeRelease } from './release-candidate.mjs'

export function validateFinalizer (env, expires, now = Date.now()) {
  assert.ok(now < Date.parse(expires), 'Publishing platform security review has expired')
  assert.equal(env.GITHUB_ACTIONS, 'true')
  assert.equal(env.GITHUB_EVENT_NAME, 'workflow_dispatch')
  assert.equal(env.GITHUB_REPOSITORY, 'ciqol/resenv')
  assert.equal(env.GITHUB_REF, 'refs/heads/beta')
  assert.equal(env.GITHUB_WORKFLOW_REF, 'ciqol/resenv/.github/workflows/ci.yml@refs/heads/beta')
  assert.equal(env.RELEASE_ENABLED, 'true')
  assert.ok(env.GITHUB_TOKEN)
  assert.match(env.RELEASE_VERSION ?? '', /^0\.1\.0-beta\.[1-9]\d*$/)
}

async function main () {
  assert.equal(process.argv.length, 2, 'Usage: node scripts/finalize-release.mjs')
  const policy = JSON.parse(readFileSync(new URL('../docs/security-exceptions.json', import.meta.url), 'utf8'))
  validateFinalizer(process.env, policy.expires)
  const directory = mkdtempSync(join(tmpdir(), 'resenv-finalize-'))
  try {
    const result = await finalizeRelease(directory, process.env.RELEASE_VERSION, { github: githubRequest, registry: registryMetadata, releases: listReleases, download: downloadAsset })
    const message = `Recorded GitHub prerelease: ${result.html_url}`
    console.log(message)
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${message}\n`)
  } finally { rmSync(directory, { recursive: true, force: true }) }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main()
