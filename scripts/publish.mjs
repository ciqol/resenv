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
  assert.match(env.GITHUB_SHA ?? '', /^[a-f0-9]{40}$/)
  for (const key of ['GITHUB_TOKEN', 'ACTIONS_ID_TOKEN_REQUEST_URL', 'ACTIONS_ID_TOKEN_REQUEST_TOKEN']) assert.ok(env[key], `Missing ${key}`)
  for (const key of ['PLAN_SHA256', 'ARCHIVE_SHA256']) assert.match(env[key] ?? '', /^[a-f0-9]{64}$/)
}

export function npmEnvironment (env, directory) {
  const allowed = Object.fromEntries(Object.entries(env).filter(([key]) => /^(?:PATH|SystemRoot|GITHUB_(?!TOKEN$)|ACTIONS_ID_TOKEN_REQUEST_|RUNNER_)/.test(key)))
  return { ...allowed, HOME: directory, NPM_CONFIG_USERCONFIG: join(directory, 'user.npmrc'), NPM_CONFIG_GLOBALCONFIG: join(directory, 'global.npmrc'), NPM_CONFIG_CACHE: join(directory, 'cache'), NPM_CONFIG_REGISTRY: 'https://registry.npmjs.org/' }
}

// Effects are injected so failure ordering and idempotent recovery can be tested.
export async function publishRelease ({ plan, archive }, effects) {
  assert.equal(plan.publish, true, 'No release was planned')
  const repository = await effects.github('GET', '')
  assert.equal(repository.private, false, 'Public source is required for provenance')
  assert.equal(repository.default_branch, 'beta')
  const branch = await effects.github('GET', '/git/ref/heads/beta')
  assert.equal(branch.object.sha, plan.gitHead, 'The beta branch has changed; review the newer candidate')
  let published = await effects.registry(plan.version)
  if (!published) {
    await effects.npm(archive)
    published = await effects.registry(plan.version, true)
  }
  assert.equal(published?.dist?.integrity, plan.integrity, 'Registry archive differs from the tested candidate; refusing tag/release')
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
      async registry (version, retry = false) {
        for (let attempt = 0; attempt < (retry ? 6 : 1); attempt++) {
          const response = await fetch(`https://registry.npmjs.org/@ciqol%2fresenv/${version}`, { redirect: 'error', signal: AbortSignal.timeout(30000) })
          if (response.ok) return response.json()
          assert.equal(response.status, 404, `Registry lookup failed (${response.status})`)
          if (retry) await new Promise(resolve => setTimeout(resolve, 5000))
        }
        return null
      },
      npm (archive) {
        const version = spawnSync('npm', ['--version'], { env: npmEnv, encoding: 'utf8', timeout: 10000 })
        assert.equal(version.status, 0)
        assert.equal(process.version, 'v24.19.0', 'Re-review the publishing platform before changing Node.js')
        assert.equal(version.stdout.trim(), '11.17.0', 'Re-review the publishing platform before changing npm')
        const result = spawnSync('npm', ['publish', archive, '--access', 'public', '--tag', 'beta', '--provenance'], { cwd: temporary, env: npmEnv, encoding: 'utf8', timeout: 180000, maxBuffer: 4 * 1024 * 1024 })
        assert.equal(result.error, undefined)
        // npm may authenticate only during publish. Do not use whoami as an OIDC probe.
        assert.equal(result.status, 0, 'npm publication failed; check the npm trusted publisher for ciqol/resenv, ci.yml, environment release')
        console.log('npm accepted the archive through trusted publishing.')
      }
    }
    const release = await publishRelease(candidate, effects)
    console.log(`Published @ciqol/resenv@${candidate.plan.version} on beta; ${release.html_url}`)
  } finally { rmSync(temporary, { recursive: true, force: true }) }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main()
