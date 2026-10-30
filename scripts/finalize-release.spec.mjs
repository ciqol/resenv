import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { validateFinalizer } from './finalize-release.mjs'

describe('manual finalization boundary', () => {
  it('requires an explicit protected beta dispatch and an exact version', () => {
    const env = { GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REPOSITORY: 'ciqol/resenv', GITHUB_REF: 'refs/heads/beta', GITHUB_WORKFLOW_REF: 'ciqol/resenv/.github/workflows/ci.yml@refs/heads/beta', RELEASE_ENABLED: 'true', RELEASE_VERSION: '0.1.0-beta.3', GITHUB_TOKEN: 'dummy' }
    const now = Date.parse('2026-10-30')
    expect(() => validateFinalizer(env, '2026-11-09', now)).not.toThrow()
    expect(() => validateFinalizer(env, '2026-10-30', now)).toThrow(/expired/)
    for (const change of [{ GITHUB_EVENT_NAME: 'push' }, { GITHUB_EVENT_NAME: 'pull_request' }, { GITHUB_EVENT_NAME: 'schedule' }, { GITHUB_REF: 'refs/heads/main' }, { RELEASE_VERSION: '../archive' }, { RELEASE_ENABLED: '' }, { GITHUB_WORKFLOW_REF: 'other/repo/.github/workflows/ci.yml@refs/heads/beta' }]) expect(() => validateFinalizer({ ...env, ...change }, '2026-11-09', now)).toThrow()
  })
  it('permits the finalize job only for an explicit beta finalize action', () => {
    const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8').split('\n  finalize:\n')[1]
    const condition = workflow.match(/^    if: (.+)$/m)[1]
    for (const event of ['push', 'pull_request', 'workflow_dispatch']) {
      for (const action of ['check', 'release', 'finalize']) {
        for (const ref of ['refs/heads/beta', 'refs/heads/main']) {
          for (const enabled of ['true', 'false']) {
            const context = { vars: { RELEASE_ENABLED: enabled }, github: { event_name: event, ref }, inputs: { action } }
            expect(Boolean(runInNewContext(condition, context))).toBe(enabled === 'true' && event === 'workflow_dispatch' && action === 'finalize' && ref === 'refs/heads/beta')
          }
        }
      }
    }
  })
})
