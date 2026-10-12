import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { verifyArtifact } from './release-artifact.mjs'

export function validatePublisher (env, expires, now = Date.now()) {
  assert.ok(now < Date.parse(expires), 'Publishing platform security review has expired')
  assert.equal(env.GITHUB_ACTIONS, 'true')
  assert.equal(env.GITHUB_EVENT_NAME, 'workflow_dispatch')
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

// Effects are injected so failure ordering and idempotent recovery can be tested.
export async function publishRelease ({ plan, archive }, effects) {
  assert.equal(plan.publish, true, 'No release was planned')
  const repository = await effects.github('GET', '')
  assert.equal(repository.private, false, 'Public source is required for provenance')
  assert.equal(repository.default_branch, 'beta')
  const branch = await effects.github('GET', '/git/ref/heads/beta')
  assert.equal(branch.object.sha, plan.gitHead, 'The beta branch has changed; review the newer candidate')
  const metadata = await effects.registry()
  const published = metadata?.versions?.[plan.version]
  if (!published) {
    return effects.npm(archive, plan)
  }
  assert.equal(published?.dist?.integrity, plan.integrity, 'Registry archive differs from the tested candidate; refusing tag/release')
  assert.deepEqual(metadata['dist-tags'], { beta: plan.version }, 'Registry channels must contain only the tested beta version; correct npm dist-tags before recording this release')
  const tagPath = `/git/ref/tags/${plan.gitTag}`
  const tag = await effects.github('GET', tagPath)
  if (tag) assert.equal(tag.object.sha, plan.gitHead, 'Existing tag points to another commit')
  else await effects.github('POST', '/git/refs', { ref: `refs/tags/${plan.gitTag}`, sha: plan.gitHead })
  const existing = await effects.github('GET', `/releases/tags/${plan.gitTag}`)
  if (existing) {
    assert.equal(existing.tag_name, plan.gitTag)
    assert.equal(existing.draft, false)
    assert.equal(existing.prerelease, true)
    return existing
  }
  return effects.github('POST', '/releases', {
    tag_name: plan.gitTag, target_commitish: plan.gitHead, name: plan.gitTag,
    body: `${plan.notes}\n\nExperimental beta channel.\n\nArchive SHA-256: \`${plan.sha256}\`\n`,
    prerelease: true, make_latest: 'false', draft: false
  })
}

async function main () {
  assert.equal(process.argv.length, 3, 'Usage: node scripts/publish.mjs <candidate-directory>')
  const policy = JSON.parse(readFileSync(new URL('../docs/security-exceptions.json', import.meta.url), 'utf8'))
  validatePublisher(process.env, policy.expires)
  const candidate = verifyArtifact(resolve(process.argv[2]), { head: process.env.GITHUB_SHA, planHash: process.env.PLAN_SHA256, archiveHash: process.env.ARCHIVE_SHA256 })
  const temporary = mkdtempSync(join(tmpdir(), 'resenv-publish-'))
  try {
    for (const name of ['user.npmrc', 'global.npmrc']) writeFileSync(join(temporary, name), '')
    const npmEnv = npmEnvironment(process.env, temporary)
    const effects = {
      async github (method, suffix, body) {
        const response = await fetch(`https://api.github.com/repos/ciqol/resenv${suffix}`, {
          method, headers: { authorization: `Bearer ${process.env.GITHUB_TOKEN}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'content-type': 'application/json' },
          body: body ? JSON.stringify(body) : undefined, redirect: 'error', signal: AbortSignal.timeout(30000)
        })
        if (response.status === 404 && method === 'GET' && /^\/(git\/ref\/tags|releases\/tags)\//.test(suffix)) return null
        assert.ok(response.ok, `GitHub ${method} ${suffix || 'repository'} failed (${response.status})`)
        return response.json()
      },
      async registry () {
        const response = await fetch('https://registry.npmjs.org/@ciqol%2fresenv', { redirect: 'error', signal: AbortSignal.timeout(30000) })
        if (response.ok) return response.json()
        assert.equal(response.status, 404, `Registry lookup failed (${response.status})`)
        return null
      },
      npm (archive, plan) {
        const version = spawnSync('npm', ['--version'], { env: npmEnv, encoding: 'utf8', timeout: 10000 })
        assert.equal(version.status, 0)
        assert.equal(process.version, 'v24.19.0', 'Re-review the publishing platform before changing Node.js')
        assert.equal(version.stdout.trim(), '11.17.0', 'Re-review the publishing platform before changing npm')
        const result = spawnSync('npm', ['stage', 'publish', archive, '--access', 'public', '--tag', 'beta', '--provenance', '--json'], { cwd: temporary, env: npmEnv, encoding: 'utf8', timeout: 180000, maxBuffer: 4 * 1024 * 1024 })
        assert.equal(result.error, undefined)
        // npm may authenticate only during publish. Do not use whoami as an OIDC probe.
        assert.equal(result.status, 0, 'npm staging failed; check the npm trusted publisher for ciqol/resenv, ci.yml, environment release')
        return validateStageReceipt(result.stdout, plan)
      }
    }
    const release = await publishRelease(candidate, effects)
    if (release.staged) {
      writeFileSync(join(resolve(process.argv[2]), 'stage.json'), `${JSON.stringify(release, null, 2)}\n`)
      const message = `Staged @ciqol/resenv@${release.version} on beta.\n\nApprove with npm stage approve ${release.stageId}, then rerun this release job to verify publication and record its tag.\n`
      console.log(message)
      if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, message, { flag: 'a' })
    } else console.log(`Published @ciqol/resenv@${candidate.plan.version} on beta; ${release.html_url}`)
  } finally { rmSync(temporary, { recursive: true, force: true }) }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main()
