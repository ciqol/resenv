import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { validateEnvironment, verifyRelease } from './verify-release.mjs'

const env = { GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'push', GITHUB_REPOSITORY: 'ciqol/resenv', GITHUB_REF: 'refs/heads/main', GITHUB_WORKFLOW_REF: 'ciqol/resenv/.github/workflows/ci.yml@refs/heads/main', GITHUB_SHA: 'a'.repeat(40), RELEASE_ENABLED: 'true', GITHUB_TOKEN: 'dummy', ACTIONS_ID_TOKEN_REQUEST_URL: 'dummy', ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'dummy' }

it('permits only enabled main pushes and preserves the security review deadline', () => {
  const now = Date.parse('2026-10-30')
  expect(() => validateEnvironment(env, now)).not.toThrow()
  for (const change of [{ GITHUB_EVENT_NAME: 'pull_request' }, { GITHUB_EVENT_NAME: 'workflow_dispatch' }, { GITHUB_REF: 'refs/heads/beta' }, { RELEASE_ENABLED: 'false' }, { GITHUB_TOKEN: '' }, { ACTIONS_ID_TOKEN_REQUEST_TOKEN: '' }, { GITHUB_REPOSITORY: 'other/repo' }]) expect(() => validateEnvironment({ ...env, ...change }, now)).toThrow()
  expect(() => validateEnvironment(env, Date.parse('2026-11-09'))).toThrow(/expired/)
})

it('keeps the public version on regular 0.x releases', () => {
  expect(() => verifyRelease({}, { nextRelease: { version: '0.2.0' } })).not.toThrow()
  for (const version of ['1.0.0', '0.1.0-beta.3', '../archive']) expect(() => verifyRelease({}, { nextRelease: { version } })).toThrow()
})

it('never starts the release job for a PR or manual dispatch', () => {
  const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')
  const condition = workflow.split('\n  release:')[1].match(/\n    if: (.+)/)[1]
  for (const event of ['push', 'pull_request', 'workflow_dispatch']) {
    for (const ref of ['refs/heads/main', 'refs/heads/beta', 'refs/heads/titan/test']) {
      for (const enabled of ['true', 'false', '']) {
        expect(Boolean(runInNewContext(condition, { vars: { RELEASE_ENABLED: enabled }, github: { event_name: event, ref } }))).toBe(enabled === 'true' && event === 'push' && ref === 'refs/heads/main')
      }
    }
  }
})
