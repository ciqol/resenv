import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { npmEnvironment, publishRelease, validatePublisher, validateStageReceipt } from './publish.mjs'

function fixture () {
  const candidate = { archive: '/dummy/archive.tgz', plan: { name: '@ciqol/resenv', publish: true, version: '0.1.0-beta.1', gitTag: 'v0.1.0-beta.1', gitHead: 'a'.repeat(40), integrity: 'sha512-dummy', sha256: 'b'.repeat(64), notes: 'Dummy notes' } }
  const published = { versions: { [candidate.plan.version]: { dist: { integrity: candidate.plan.integrity } } }, 'dist-tags': { beta: candidate.plan.version, latest: candidate.plan.version } }
  const effects = {
    github: vi.fn(async (method, path) => {
      if (path === '') return { private: false, default_branch: 'beta' }
      if (path === '/git/ref/heads/beta') return { object: { sha: candidate.plan.gitHead } }
      if (method === 'GET') return null
      return { html_url: 'https://github.com/ciqol/resenv/releases/tag/v0.1.0-beta.1' }
    }),
    registry: vi.fn().mockResolvedValue({ versions: {}, 'dist-tags': { beta: '0.1.0-beta.0' } }),
    npm: vi.fn().mockResolvedValue({ staged: true, stageId: '00000000-0000-4000-8000-000000000000' })
  }
  return { candidate, effects, published }
}

describe('publication ordering and recovery', () => {
  it('gates staging on trusted beta events and the consolidated CI outputs', () => {
    const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')
    const condition = workflow.match(/^    if: (vars.RELEASE_ENABLED.+)$/m)[1]
    const approved = workflow.match(/RELEASE_APPROVED:.*\$\{\{ (.*?) \}\}/)[1]
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
  it('waits for approval and tags in record-only mode without ever staging', async () => {
    const { candidate, effects, published } = fixture()
    expect((await publishRelease(candidate, effects, { recordOnly: true })).pending).toBe(true)
    effects.registry.mockResolvedValue({ ...published, 'dist-tags': { beta: candidate.plan.version, latest: '0.1.0-beta.0' } })
    expect((await publishRelease(candidate, effects, { recordOnly: true })).pending).toBe(true)
    expect(effects.npm).not.toHaveBeenCalled()
    expect(effects.github.mock.calls.every(([method]) => method === 'GET')).toBe(true)
    effects.registry.mockResolvedValue(published)
    await publishRelease(candidate, effects, { recordOnly: true })
    expect(effects.npm).not.toHaveBeenCalled()
    expect(effects.github).toHaveBeenCalledWith('POST', '/releases', expect.objectContaining({ tag_name: candidate.plan.gitTag }))
  })
  it('stages the exact archive without recording a tag or public release', async () => {
    const { candidate, effects } = fixture()
    const result = await publishRelease(candidate, effects)
    expect(effects.npm).toHaveBeenCalledWith(candidate.archive, candidate.plan)
    expect(result.staged).toBe(true)
    expect(effects.github.mock.calls.every(([method]) => method === 'GET')).toBe(true)
  })
  it('creates no tag or release when npm fails', async () => {
    const { candidate, effects } = fixture()
    effects.npm.mockRejectedValue(new Error('dummy failure'))
    await expect(publishRelease(candidate, effects)).rejects.toThrow('dummy failure')
    expect(effects.github.mock.calls.every(([method]) => method === 'GET')).toBe(true)
  })
  it('recovers after publication without republishing, and refuses a different registry archive', async () => {
    const { candidate, effects, published } = fixture()
    effects.registry.mockResolvedValue(published)
    await publishRelease(candidate, effects)
    expect(effects.npm).not.toHaveBeenCalled()
    expect(effects.github).toHaveBeenCalledWith('POST', '/releases', expect.objectContaining({ prerelease: true, make_latest: 'false' }))
    effects.github.mockClear()
    published.versions[candidate.plan.version].dist.integrity = 'sha512-other'
    await expect(publishRelease(candidate, effects)).rejects.toThrow(/differs/)
    expect(effects.github.mock.calls.every(([method]) => method === 'GET')).toBe(true)
  })
  it.each([
    undefined, {}, { latest: '0.1.0-beta.1' }, { beta: '0.1.0-beta.1' },
    { beta: '0.1.0-beta.2', latest: '0.1.0-beta.1' },
    { beta: '0.1.0-beta.1', latest: '0.1.0-beta.2' },
    { beta: '0.1.0-beta.1', latest: '0.1.0-beta.1', other: '0.1.0-beta.1' }
  ])('refuses incorrect registry channels %j before recording a release', async tags => {
    const { candidate, effects, published } = fixture()
    effects.registry.mockResolvedValue({ ...published, 'dist-tags': tags })
    await expect(publishRelease(candidate, effects)).rejects.toThrow(/Registry channels/)
    expect(effects.npm).not.toHaveBeenCalled()
    expect(effects.github.mock.calls.every(([method]) => method === 'GET')).toBe(true)
  })
  it('refuses a stale beta candidate or a private repository before publishing', async () => {
    for (const repository of [{ private: true, default_branch: 'beta' }, { private: false, default_branch: 'other' }]) {
      const { candidate, effects } = fixture()
      effects.github.mockResolvedValueOnce(repository)
      await expect(publishRelease(candidate, effects)).rejects.toThrow()
      expect(effects.npm).not.toHaveBeenCalled()
    }
    const { candidate, effects } = fixture()
    effects.github.mockResolvedValueOnce({ private: false, default_branch: 'beta' }).mockResolvedValueOnce({ object: { sha: 'b'.repeat(40) } })
    await expect(publishRelease(candidate, effects)).rejects.toThrow(/changed/)
    expect(effects.npm).not.toHaveBeenCalled()
  })
  it('refuses a pre-existing tag targeting a different commit', async () => {
    const { candidate, effects, published } = fixture()
    effects.registry.mockResolvedValue(published)
    effects.github.mockResolvedValueOnce({ private: false, default_branch: 'beta' }).mockResolvedValueOnce({ object: { sha: candidate.plan.gitHead } }).mockResolvedValueOnce({ object: { sha: 'b'.repeat(40) } })
    await expect(publishRelease(candidate, effects)).rejects.toThrow(/another commit/)
    expect(effects.github.mock.calls.some(([method, path]) => method === 'POST' && path === '/releases')).toBe(false)
  })
})

it.each(['push', 'workflow_dispatch'])('requires the exact trusted workflow and hashes for %s', event => {
  const env = { GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: event, GITHUB_REPOSITORY: 'ciqol/resenv', GITHUB_REF: 'refs/heads/beta', GITHUB_WORKFLOW_REF: 'ciqol/resenv/.github/workflows/ci.yml@refs/heads/beta', RELEASE_APPROVED: 'true', GITHUB_SHA: 'a'.repeat(40), GITHUB_TOKEN: 'dummy', ACTIONS_ID_TOKEN_REQUEST_URL: 'dummy', ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'dummy', PLAN_SHA256: 'b'.repeat(64), ARCHIVE_SHA256: 'c'.repeat(64) }
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

it('passes OIDC to npm but removes publishing tokens and inherited npm configuration', () => {
  const env = npmEnvironment({ PATH: '/dummy/bin', GITHUB_TOKEN: 'dummy-private', GH_TOKEN: 'dummy-private', NPM_TOKEN: 'dummy-private', NODE_AUTH_TOKEN: 'dummy-private', npm_config_userconfig: '/dummy/private', ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'dummy-oidc', GITHUB_REPOSITORY: 'ciqol/resenv' }, '/dummy/temporary')
  expect(env.ACTIONS_ID_TOKEN_REQUEST_TOKEN).toBe('dummy-oidc')
  for (const key of ['GITHUB_TOKEN', 'GH_TOKEN', 'NPM_TOKEN', 'NODE_AUTH_TOKEN', 'npm_config_userconfig']) expect(env[key]).toBeUndefined()
  expect(env.NPM_CONFIG_REGISTRY).toBe('https://registry.npmjs.org/')
})

it('checks the staged archive receipt without trusting its reported version or integrity', () => {
  const { candidate } = fixture()
  const receipt = { name: '@ciqol/resenv', version: candidate.plan.version, integrity: candidate.plan.integrity, stageId: '00000000-0000-4000-8000-000000000000' }
  const output = value => JSON.stringify({ '@ciqol/resenv': value })
  expect(validateStageReceipt(output(receipt), candidate.plan).staged).toBe(true)
  expect(() => validateStageReceipt('{}', candidate.plan)).toThrow(/Missing/)
  for (const change of [{ name: '@other/package' }, { version: '1.0.0' }, { integrity: 'other' }, { stageId: 'invalid' }]) {
    expect(() => validateStageReceipt(output({ ...receipt, ...change }), candidate.plan)).toThrow()
  }
})
