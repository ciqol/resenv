import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { validateFinalizer } from './finalize-release.mjs'

describe('finalizer trust boundary', () => {
  it('limits the actual workflow job to enabled beta schedules, dispatches and trusted completions', () => {
    const workflow = readFileSync(new URL('../.github/workflows/finalize-release.yml', import.meta.url), 'utf8')
    const condition = workflow.match(/^    if: (.+)$/m)[1]
    for (const event of ['schedule', 'workflow_dispatch', 'workflow_run', 'pull_request']) {
      for (const source of ['push', 'workflow_dispatch', 'pull_request']) {
        for (const repository of ['ciqol/resenv', 'other/resenv']) {
          for (const ref of ['refs/heads/beta', 'refs/heads/main']) {
            for (const conclusion of ['success', 'failure']) {
              for (const enabled of ['true', 'false']) {
                const context = { vars: { RELEASE_ENABLED: enabled }, github: { repository: 'ciqol/resenv', ref, event_name: event, event: { workflow_run: { event: source, conclusion, head_repository: { full_name: repository } } } } }
                const expected = enabled === 'true' && ref === 'refs/heads/beta' && (['schedule', 'workflow_dispatch'].includes(event) || (event === 'workflow_run' && ['push', 'workflow_dispatch'].includes(source) && repository === 'ciqol/resenv' && conclusion === 'success'))
                expect(Boolean(runInNewContext(condition, context))).toBe(expected)
              }
            }
          }
        }
      }
    }
  })
  it.each(['schedule', 'workflow_run', 'workflow_dispatch'])('accepts the protected recorder on %s without npm credentials', event => {
    const env = { GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: event, GITHUB_REPOSITORY: 'ciqol/resenv', GITHUB_REF: 'refs/heads/beta', GITHUB_WORKFLOW_REF: 'ciqol/resenv/.github/workflows/finalize-release.yml@refs/heads/beta', RELEASE_ENABLED: 'true', GITHUB_TOKEN: 'dummy' }
    const now = Date.parse('2026-10-27')
    expect(() => validateFinalizer(env, '2026-11-09', now)).not.toThrow()
    if (event === 'workflow_dispatch') expect(() => validateFinalizer({ ...env, REJECT_VERSION: '0.1.0-beta.3' }, '2026-11-09', now)).not.toThrow()
    else expect(() => validateFinalizer({ ...env, REJECT_VERSION: '0.1.0-beta.3' }, '2026-11-09', now)).toThrow(/explicit maintainer/)
    expect(() => validateFinalizer(env, '2026-10-27', now)).toThrow(/expired/)
    for (const change of [{ GITHUB_ACTIONS: '' }, { GITHUB_REPOSITORY: 'other/repo' }, { GITHUB_EVENT_NAME: 'pull_request' }, { GITHUB_REF: 'refs/heads/main' }, { GITHUB_WORKFLOW_REF: 'ciqol/resenv/.github/workflows/ci.yml@refs/heads/beta' }, { RELEASE_ENABLED: '' }, { GITHUB_TOKEN: '' }]) expect(() => validateFinalizer({ ...env, ...change }, '2026-11-09', now)).toThrow()
  })
})
