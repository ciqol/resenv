import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

export function validateEnvironment (env, now = Date.now()) {
  const policy = JSON.parse(readFileSync(new URL('../docs/security-exceptions.json', import.meta.url), 'utf8'))
  assert.ok(now < Date.parse(policy.expires), 'Release-tool security review has expired')
  assert.equal(env.GITHUB_ACTIONS, 'true')
  assert.equal(env.GITHUB_EVENT_NAME, 'push')
  assert.equal(env.GITHUB_REPOSITORY, 'ciqol/resenv')
  assert.equal(env.GITHUB_REF, 'refs/heads/main')
  assert.equal(env.GITHUB_WORKFLOW_REF, 'ciqol/resenv/.github/workflows/ci.yml@refs/heads/main')
  assert.equal(env.RELEASE_ENABLED, 'true')
  assert.match(env.GITHUB_SHA ?? '', /^[a-f0-9]{40}$/)
  for (const key of ['GITHUB_TOKEN', 'ACTIONS_ID_TOKEN_REQUEST_URL', 'ACTIONS_ID_TOKEN_REQUEST_TOKEN']) assert.ok(env[key], `Missing ${key}`)
}

export function verifyConditions (_, { env }) {
  validateEnvironment(env)
}

export function verifyRelease (_, { nextRelease }) {
  assert.match(nextRelease.version, /^0\.\d+\.\d+$/, 'Keep releases on 0.x until a reviewed 1.0 migration')
}

export function prepare (_, { nextRelease }) {
  // The npm plugin has versioned and packed the already-built output.
  execFileSync('npm', ['run', 'test:package', '--', `release/ciqol-resenv-${nextRelease.version}.tgz`, nextRelease.version], { stdio: 'inherit' })
}
