import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { npmEnvironment, validatePublisher, validateStageReceipt } from './publish.mjs'

describe('publication ordering and recovery', () => {
  it('gates staging on trusted beta events and the consolidated CI outputs', () => {
    const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')
    const release = workflow.slice(workflow.indexOf('\n  release:\n'))
    const condition = release.match(/^    if: (vars.RELEASE_ENABLED.+)$/m)[1]
    const approved = release.match(/RELEASE_APPROVED:.*\$\{\{ (.*?) \}\}/)[1]
    for (const event of ['push', 'workflow_dispatch', 'pull_request', 'pull_request_target', 'workflow_run', 'schedule']) {
      for (const ref of ['refs/heads/beta', 'refs/heads/main', 'refs/heads/titan/test', 'refs/tags/v0.1.0-beta.1']) {
        for (const enabled of ['true', 'false']) {
          for (const publish of [true, false, undefined]) {
            for (const candidate of ['true', 'false']) {
              const context = { vars: { RELEASE_ENABLED: enabled }, github: { event_name: event, ref }, inputs: { publish }, needs: { ci: { outputs: { publish: candidate } } } }
              const expected = enabled === 'true' && ref === 'refs/heads/beta' && candidate === 'true' && (event === 'push' || (event === 'workflow_dispatch' && publish === true))
              const actual = Boolean(runInNewContext(condition, context))
              expect(actual).toBe(expected)
              if (actual) expect(runInNewContext(approved, context)).toBe(true)
            }
          }
        }
      }
    }
  })
})

it.each(['push', 'workflow_dispatch'])('requires the exact trusted workflow and hashes for %s', event => {
  const env = { GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: event, GITHUB_REPOSITORY: 'ciqol/resenv', GITHUB_REF: 'refs/heads/beta', GITHUB_WORKFLOW_REF: 'ciqol/resenv/.github/workflows/ci.yml@refs/heads/beta', RELEASE_APPROVED: 'true', GITHUB_SHA: 'a'.repeat(40), GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1', GITHUB_TOKEN: 'dummy', ACTIONS_ID_TOKEN_REQUEST_URL: 'dummy', ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'dummy', PLAN_SHA256: 'b'.repeat(64), ARCHIVE_SHA256: 'c'.repeat(64) }
  env.RELEASE_ENABLED = 'true'
  const now = Date.parse('2026-10-10')
  expect(() => validatePublisher(env, '2026-11-09', now)).not.toThrow()
  expect(() => validatePublisher(env, '2026-10-10', now)).toThrow(/expired/)
  expect(() => validatePublisher(env, 'invalid', now)).toThrow(/expired/)
  const rejected = [
    { RELEASE_ENABLED: '' }, { GITHUB_ACTIONS: 'false' }, { GITHUB_REPOSITORY: 'other/repo' }, { RELEASE_APPROVED: 'false' },
    { GITHUB_REF: 'refs/heads/other' }, { GITHUB_REF: 'refs/heads/main' }, { GITHUB_REF: 'refs/tags/v0.1.0-beta.1' },
    { PLAN_SHA256: '' }, { ARCHIVE_SHA256: '' },
    { GITHUB_WORKFLOW_REF: 'other/repo/.github/workflows/ci.yml@refs/heads/beta' },
    { GITHUB_WORKFLOW_REF: 'ciqol/resenv/.github/workflows/other.yml@refs/heads/beta' },
    { GITHUB_WORKFLOW_REF: 'ciqol/resenv/.github/workflows/ci.yml@refs/heads/other' },
    ...['pull_request', 'pull_request_target', 'workflow_run', 'schedule', undefined].map(GITHUB_EVENT_NAME => ({ GITHUB_EVENT_NAME }))
  ]
  for (const change of rejected) expect(() => validatePublisher({ ...env, ...change }, '2026-11-09', now)).toThrow()
})

it('allows durable recovery only for an explicit manual publishing dispatch', () => {
  const env = { GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REPOSITORY: 'ciqol/resenv', GITHUB_REF: 'refs/heads/beta', GITHUB_WORKFLOW_REF: 'ciqol/resenv/.github/workflows/ci.yml@refs/heads/beta', RELEASE_ENABLED: 'true', RELEASE_APPROVED: 'true', RELEASE_RESUME: 'true', RESUME_VERSION: '0.1.0-beta.3', GITHUB_SHA: 'a'.repeat(40), GITHUB_RUN_ID: '456', GITHUB_RUN_ATTEMPT: '1', GITHUB_TOKEN: 'dummy', ACTIONS_ID_TOKEN_REQUEST_URL: 'dummy', ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'dummy' }
  const now = Date.parse('2026-10-30')
  expect(() => validatePublisher(env, '2026-11-09', now)).not.toThrow()
  for (const change of [{ GITHUB_EVENT_NAME: 'push' }, { RELEASE_APPROVED: 'false' }, { RESUME_VERSION: '../archive' }, { GITHUB_REF: 'refs/heads/other' }]) expect(() => validatePublisher({ ...env, ...change }, '2026-11-09', now)).toThrow()
})

it('passes OIDC to npm but removes publishing tokens and inherited npm configuration', () => {
  const env = npmEnvironment({ PATH: '/dummy/bin', GITHUB_TOKEN: 'dummy-private', GH_TOKEN: 'dummy-private', NPM_TOKEN: 'dummy-private', NODE_AUTH_TOKEN: 'dummy-private', npm_config_userconfig: '/dummy/private', ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'dummy-oidc', GITHUB_REPOSITORY: 'ciqol/resenv' }, '/dummy/temporary')
  expect(env.ACTIONS_ID_TOKEN_REQUEST_TOKEN).toBe('dummy-oidc')
  for (const key of ['GITHUB_TOKEN', 'GH_TOKEN', 'NPM_TOKEN', 'NODE_AUTH_TOKEN', 'npm_config_userconfig']) expect(env[key]).toBeUndefined()
  expect(env.NPM_CONFIG_REGISTRY).toBe('https://registry.npmjs.org/')
})

it('checks the staged archive receipt without trusting its reported version or integrity', () => {
  const candidate = { plan: { name: '@ciqol/resenv', version: '0.1.0-beta.1', integrity: 'sha512-dummy' } }
  const receipt = { name: '@ciqol/resenv', version: candidate.plan.version, integrity: candidate.plan.integrity, stageId: '00000000-0000-4000-8000-000000000000' }
  const output = value => JSON.stringify({ '@ciqol/resenv': value })
  expect(validateStageReceipt(output(receipt), candidate.plan).staged).toBe(true)
  expect(() => validateStageReceipt('{}', candidate.plan)).toThrow(/Missing/)
  for (const change of [{ name: '@other/package' }, { version: '1.0.0' }, { integrity: 'other' }, { stageId: 'invalid' }]) {
    expect(() => validateStageReceipt(output({ ...receipt, ...change }), candidate.plan)).toThrow()
  }
})
