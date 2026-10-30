import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { stageRelease } from './release-candidate.mjs'
import { githubRequest, registryMetadata, listReleases, uploadAsset, downloadAsset } from './release-services.mjs'

export function validatePublisher (env, expires, now = Date.now()) {
  assert.ok(now < Date.parse(expires), 'Publishing platform security review has expired')
  assert.equal(env.GITHUB_ACTIONS, 'true')
  assert.ok(['push', 'workflow_dispatch'].includes(env.GITHUB_EVENT_NAME), 'Publishing requires a beta push or manual dispatch')
  assert.equal(env.GITHUB_REPOSITORY, 'ciqol/resenv')
  assert.equal(env.GITHUB_REF, 'refs/heads/beta')
  assert.equal(env.GITHUB_WORKFLOW_REF, 'ciqol/resenv/.github/workflows/ci.yml@refs/heads/beta')
  assert.equal(env.RELEASE_APPROVED, 'true')
  assert.equal(env.RELEASE_ENABLED, 'true')
  assert.match(env.GITHUB_SHA ?? '', /^[a-f0-9]{40}$/)
  for (const key of ['GITHUB_TOKEN', 'ACTIONS_ID_TOKEN_REQUEST_URL', 'ACTIONS_ID_TOKEN_REQUEST_TOKEN']) assert.ok(env[key], `Missing ${key}`)
  for (const key of ['PLAN_SHA256', 'ARCHIVE_SHA256']) assert.match(env[key] ?? '', /^[a-f0-9]{64}$/)
}

export function npmEnvironment (env, directory) {
  const allowed = Object.fromEntries(Object.entries(env).filter(([key]) => /^(?:PATH|SystemRoot|GITHUB_(?!TOKEN$)|ACTIONS_ID_TOKEN_REQUEST_|RUNNER_)/.test(key)))
  return { ...allowed, HOME: directory, NPM_CONFIG_USERCONFIG: join(directory, 'user.npmrc'), NPM_CONFIG_GLOBALCONFIG: join(directory, 'global.npmrc'), NPM_CONFIG_CACHE: join(directory, 'cache'), NPM_CONFIG_REGISTRY: 'https://registry.npmjs.org/' }
}

export function validateStageReceipt (output, plan) {
  const receipt = JSON.parse(output)[plan.name]
  assert.ok(receipt && typeof receipt === 'object', 'Missing npm staging receipt')
  assert.equal(receipt.name, plan.name, 'Staged package name differs from the candidate')
  assert.equal(receipt.version, plan.version, 'Staged version differs from the candidate')
  assert.equal(receipt.integrity, plan.integrity, 'Staged archive differs from the tested candidate')
  assert.match(receipt.stageId ?? '', /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i, 'Missing npm staging identifier')
  return { staged: true, stageId: receipt.stageId, version: plan.version, integrity: plan.integrity }
}

async function main () {
  assert.equal(process.argv.length, 3, 'Usage: node scripts/publish.mjs <candidate-directory>')
  const policy = JSON.parse(readFileSync(new URL('../docs/security-exceptions.json', import.meta.url), 'utf8'))
  validatePublisher(process.env, policy.expires)
  const identity = { head: process.env.GITHUB_SHA, planHash: process.env.PLAN_SHA256, archiveHash: process.env.ARCHIVE_SHA256 }
  const temporary = mkdtempSync(join(tmpdir(), 'resenv-publish-'))
  try {
    for (const name of ['user.npmrc', 'global.npmrc']) writeFileSync(join(temporary, name), '')
    const npmEnv = npmEnvironment(process.env, temporary)
    const version = spawnSync('npm', ['--version'], { env: npmEnv, encoding: 'utf8', timeout: 10000 })
    assert.equal(version.status, 0)
    assert.equal(process.version, 'v24.19.0', 'Re-review the publishing platform before changing Node.js')
    assert.equal(version.stdout.trim(), '11.17.0', 'Re-review the publishing platform before changing npm')
    const effects = {
      github: githubRequest,
      registry: registryMetadata,
      releases: listReleases,
      upload: uploadAsset,
      download: downloadAsset,
      npm (archive, plan) {
        const result = spawnSync('npm', ['stage', 'publish', archive, '--access', 'public', '--tag', 'beta', '--provenance', '--json'], { cwd: temporary, env: npmEnv, encoding: 'utf8', timeout: 180000, maxBuffer: 4 * 1024 * 1024 })
        assert.equal(result.error, undefined)
        // npm may authenticate only during publish. Do not use whoami as an OIDC probe.
        assert.equal(result.status, 0, 'npm staging failed; check the npm trusted publisher for ciqol/resenv, ci.yml, environment release')
        return validateStageReceipt(result.stdout, plan)
      }
    }
    const directory = resolve(process.argv[2])
    const release = await stageRelease(directory, identity, effects)
    writeFileSync(join(directory, 'stage.json'), `${JSON.stringify(release, null, 2)}\n`)
    const message = `Staged @ciqol/resenv@${release.version} on beta.\n\nApprove with npm stage approve ${release.stageId}. After public availability, run npm dist-tag add @ciqol/resenv@${release.version} latest. Then run CI with action finalize and this version to record its GitHub prerelease. The draft retains the original tested archive even after beta advances.\n`
    console.log(message)
    if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, message, { flag: 'a' })
  } finally { rmSync(temporary, { recursive: true, force: true }) }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main()
