import { describe, expect, it, vi } from 'vitest'
import { npmEnvironment, publishRelease, validatePublisher, validateStageReceipt } from './publish.mjs'

function fixture () {
  const candidate = { archive: '/dummy/archive.tgz', plan: { name: '@ciqol/resenv', publish: true, version: '0.1.0-beta.1', gitTag: 'v0.1.0-beta.1', gitHead: 'a'.repeat(40), integrity: 'sha512-dummy', sha256: 'b'.repeat(64), notes: 'Dummy notes' } }
  const effects = {
    github: vi.fn(async (method, path) => {
      if (path === '') return { private: false, default_branch: 'beta' }
      if (path === '/git/ref/heads/beta') return { object: { sha: candidate.plan.gitHead } }
      if (method === 'GET') return null
      return { html_url: 'https://github.com/ciqol/resenv/releases/tag/v0.1.0-beta.1' }
    }),
    registry: vi.fn().mockResolvedValueOnce(null).mockResolvedValue({ dist: { integrity: candidate.plan.integrity } }),
    npm: vi.fn().mockResolvedValue({ staged: true, stageId: '00000000-0000-4000-8000-000000000000' })
  }
  return { candidate, effects }
}

describe('publication ordering and recovery', () => {
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
    const { candidate, effects } = fixture()
    effects.registry.mockReset().mockResolvedValue({ dist: { integrity: candidate.plan.integrity } })
    await publishRelease(candidate, effects)
    expect(effects.npm).not.toHaveBeenCalled()
    expect(effects.github).toHaveBeenCalledWith('POST', '/releases', expect.objectContaining({ prerelease: true, make_latest: 'false' }))
    effects.github.mockClear()
    effects.registry.mockResolvedValue({ dist: { integrity: 'sha512-other' } })
    await expect(publishRelease(candidate, effects)).rejects.toThrow(/differs/)
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
    const { candidate, effects } = fixture()
    effects.registry.mockReset().mockResolvedValue({ dist: { integrity: candidate.plan.integrity } })
    effects.github.mockResolvedValueOnce({ private: false, default_branch: 'beta' }).mockResolvedValueOnce({ object: { sha: candidate.plan.gitHead } }).mockResolvedValueOnce({ object: { sha: 'b'.repeat(40) } })
    await expect(publishRelease(candidate, effects)).rejects.toThrow(/another commit/)
    expect(effects.github.mock.calls.some(([method, path]) => method === 'POST' && path === '/releases')).toBe(false)
  })
})

it('requires the exact trusted workflow event and hashes', () => {
  const env = { GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REPOSITORY: 'ciqol/resenv', GITHUB_REF: 'refs/heads/beta', GITHUB_WORKFLOW_REF: 'ciqol/resenv/.github/workflows/ci.yml@refs/heads/beta', RELEASE_APPROVED: 'true', GITHUB_SHA: 'a'.repeat(40), GITHUB_TOKEN: 'dummy', ACTIONS_ID_TOKEN_REQUEST_URL: 'dummy', ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'dummy', PLAN_SHA256: 'b'.repeat(64), ARCHIVE_SHA256: 'c'.repeat(64) }
  env.RELEASE_ENABLED = 'true'
  const now = Date.parse('2026-10-10')
  expect(() => validatePublisher(env, '2026-11-09', now)).not.toThrow()
  expect(() => validatePublisher(env, '2026-10-10', now)).toThrow(/expired/)
  expect(() => validatePublisher(env, 'invalid', now)).toThrow(/expired/)
  for (const change of [{ RELEASE_ENABLED: '' }, { GITHUB_EVENT_NAME: 'pull_request' }, { RELEASE_APPROVED: 'false' }, { GITHUB_REF: 'refs/heads/other' }, { PLAN_SHA256: '' }, { GITHUB_WORKFLOW_REF: 'other/repo/.github/workflows/ci.yml@refs/heads/beta' }]) expect(() => validatePublisher({ ...env, ...change }, '2026-11-09', now)).toThrow()
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
