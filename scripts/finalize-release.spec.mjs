import { afterEach, describe, expect, it, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { digest, integrity } from './release-artifact.mjs'
import { finalizeRelease, findStagedRun, validateFinalizer, validateSourceRun } from './finalize-release.mjs'

const directories = []
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }) })
const head = 'a'.repeat(40)
const sourceRun = () => ({ id: 123, path: '.github/workflows/ci.yml', head_repository: { full_name: 'ciqol/resenv' }, head_branch: 'beta', head_sha: head, event: 'push', status: 'completed', conclusion: 'success' })

function fixture () {
  const directory = mkdtempSync(join(tmpdir(), 'resenv-finalize-spec-'))
  directories.push(directory)
  mkdirSync(join(directory, 'package'))
  const plan = { schema: 1, publish: true, name: '@ciqol/resenv', repository: 'ciqol/resenv', channel: 'beta', version: '0.1.0-beta.2', gitTag: 'v0.1.0-beta.2', gitHead: head, notes: 'Dummy release', dependencies: {}, archive: 'ciqol-resenv-0.1.0-beta.2.tgz' }
  const manifest = { name: plan.name, version: plan.version, dependencies: {}, license: 'MIT', repository: { url: 'git+https://github.com/ciqol/resenv.git' }, publishConfig: { access: 'public', tag: 'beta', registry: 'https://registry.npmjs.org/' } }
  writeFileSync(join(directory, 'package/package.json'), JSON.stringify(manifest))
  execFileSync('tar', ['-czf', plan.archive, 'package'], { cwd: directory })
  const archive = readFileSync(join(directory, plan.archive))
  plan.sha256 = digest(archive)
  plan.integrity = integrity(archive)
  writeFileSync(join(directory, 'release.json'), JSON.stringify(plan))
  const receipt = { staged: true, stageId: '00000000-0000-4000-8000-000000000000', version: plan.version, integrity: plan.integrity }
  writeFileSync(join(directory, 'stage.json'), JSON.stringify(receipt))
  const effects = {
    github: vi.fn(async (method, path) => {
      if (path === '') return { private: false, default_branch: 'beta' }
      if (path === '/git/ref/heads/beta') return { object: { sha: head } }
      if (method === 'GET') return null
      return { html_url: 'https://github.com/ciqol/resenv/releases/tag/v0.1.0-beta.2' }
    }),
    registry: vi.fn().mockResolvedValue({ versions: { [plan.version]: { dist: { integrity: plan.integrity } } }, 'dist-tags': { beta: plan.version, latest: plan.version } })
  }
  return { directory, plan, receipt, effects }
}

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
    expect(() => validateFinalizer(env, '2026-10-27', now)).toThrow(/expired/)
    for (const change of [{ GITHUB_ACTIONS: '' }, { GITHUB_REPOSITORY: 'other/repo' }, { GITHUB_EVENT_NAME: 'pull_request' }, { GITHUB_REF: 'refs/heads/main' }, { GITHUB_WORKFLOW_REF: 'ciqol/resenv/.github/workflows/ci.yml@refs/heads/beta' }, { RELEASE_ENABLED: '' }, { GITHUB_TOKEN: '' }]) expect(() => validateFinalizer({ ...env, ...change }, '2026-11-09', now)).toThrow()
  })
  it.each([
    { id: '123' }, { path: '.github/workflows/other.yml' }, { head_repository: { full_name: 'other/resenv' } },
    { head_branch: 'main' }, { head_sha: 'b'.repeat(40) }, { event: 'pull_request' }, { event: 'pull_request_target' },
    { conclusion: 'failure' }, { status: 'in_progress' }
  ])('rejects an untrusted or unsuccessful producer %j', change => {
    expect(() => validateSourceRun({ ...sourceRun(), ...change }, head)).toThrow()
  })
  it('discovers retained staging artifacts only from successful beta push or dispatch runs', async () => {
    const run = sourceRun()
    const github = vi.fn(async (method, path) => {
      if (path === '/git/ref/heads/beta') return { object: { sha: head } }
      if (path.includes('/ci.yml/runs?')) return { workflow_runs: [{ ...run, event: 'pull_request' }, { ...run, head_repository: { full_name: 'other/resenv' } }, run] }
      return { artifacts: [{ name: 'resenv-stage', expired: false }, { name: 'resenv-package', expired: false }] }
    })
    expect(await findStagedRun(github)).toEqual(run)
    expect(github.mock.calls.filter(([, path]) => path.includes('/artifacts'))).toHaveLength(1)
  })
  it.each([[], [{ name: 'resenv-package' }], [{ name: 'resenv-package' }, { name: 'resenv-stage', expired: true }]].map(artifacts => ({ artifacts })))('ignores runs without retained staging receipts %j', ({ artifacts }) => {
    const github = vi.fn(async (method, path) => {
      if (path === '/git/ref/heads/beta') return { object: { sha: head } }
      if (path.includes('/ci.yml/runs?')) return { workflow_runs: [sourceRun()] }
      return { artifacts }
    })
    return expect(findStagedRun(github)).resolves.toBeNull()
  })
})

describe('recording the original tested archive', () => {
  it('records an approved archive and recovers an existing release without duplicate writes', async () => {
    const { directory, plan, effects } = fixture()
    await finalizeRelease(directory, sourceRun(), effects)
    expect(effects.github).toHaveBeenCalledWith('POST', '/git/refs', { ref: `refs/tags/${plan.gitTag}`, sha: head })
    expect(effects.github).toHaveBeenCalledWith('POST', '/releases', expect.objectContaining({ tag_name: plan.gitTag }))
    effects.github.mockClear()
    effects.github.mockImplementation(async (method, path) => {
      if (path === '') return { private: false, default_branch: 'beta' }
      if (path === '/git/ref/heads/beta' || path.startsWith('/git/ref/tags/')) return { object: { sha: head } }
      return { tag_name: plan.gitTag, prerelease: true, draft: false }
    })
    await finalizeRelease(directory, sourceRun(), effects)
    expect(effects.github.mock.calls.every(([method]) => method === 'GET')).toBe(true)
  })
  it('waits without writing when approval or latest promotion is pending', async () => {
    const { directory, effects } = fixture()
    effects.registry.mockResolvedValueOnce(null)
    expect((await finalizeRelease(directory, sourceRun(), effects)).pending).toBe(true)
    const metadata = await effects.registry()
    metadata['dist-tags'].latest = '0.1.0-beta.1'
    effects.registry.mockResolvedValue(metadata)
    expect((await finalizeRelease(directory, sourceRun(), effects)).pending).toBe(true)
    expect(effects.github.mock.calls.every(([method]) => method === 'GET')).toBe(true)
  })
  it('rejects receipt substitution before looking up npm or writing tags', async () => {
    const { directory, receipt, effects } = fixture()
    writeFileSync(join(directory, 'stage.json'), JSON.stringify({ ...receipt, integrity: 'sha512-other' }))
    await expect(finalizeRelease(directory, sourceRun(), effects)).rejects.toThrow(/differs/)
    expect(effects.registry).not.toHaveBeenCalled()
    expect(effects.github.mock.calls.every(([method]) => method === 'GET')).toBe(true)
  })
  it('rejects a changed beta head and archive or registry tampering', async () => {
    const { directory, plan, effects } = fixture()
    await expect(finalizeRelease(directory, { ...sourceRun(), head_sha: 'b'.repeat(40) }, effects)).rejects.toThrow(/changed/)
    effects.registry.mockResolvedValue({ versions: { [plan.version]: { dist: { integrity: 'sha512-other' } } } })
    await expect(finalizeRelease(directory, sourceRun(), effects)).rejects.toThrow(/differs/)
    writeFileSync(join(directory, plan.archive), 'changed')
    await expect(finalizeRelease(directory, sourceRun(), effects)).rejects.toThrow(/archive changed/)
    expect(effects.github.mock.calls.every(([method]) => method === 'GET')).toBe(true)
  })
})
