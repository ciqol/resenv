import { afterEach, describe, expect, it, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { digest, integrity } from './release-artifact.mjs'
import { readRecord, recordBody, releaseSnapshot } from './release-state.mjs'
import { reconcileRelease, resumeCandidate, stageCandidate } from './release-lifecycle.mjs'

const clone = value => JSON.parse(JSON.stringify(value))
const directories = []
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }) })

function fixture () {
  const directory = mkdtempSync(join(tmpdir(), 'resenv-lifecycle-'))
  directories.push(directory)
  mkdirSync(join(directory, 'package'))
  const plan = { schema: 1, publish: true, name: '@ciqol/resenv', repository: 'ciqol/resenv', channel: 'beta', version: '0.1.0-beta.3', gitTag: 'v0.1.0-beta.3', gitHead: 'a'.repeat(40), notes: 'Dummy notes', dependencies: {}, archive: 'ciqol-resenv-0.1.0-beta.3.tgz' }
  const manifest = { name: plan.name, version: plan.version, dependencies: {}, license: 'MIT', repository: { url: 'git+https://github.com/ciqol/resenv.git' }, publishConfig: { access: 'public', tag: 'beta', registry: 'https://registry.npmjs.org/' } }
  writeFileSync(join(directory, 'package/package.json'), JSON.stringify(manifest))
  execFileSync('tar', ['-czf', plan.archive, 'package'], { cwd: directory })
  const archive = readFileSync(join(directory, plan.archive))
  plan.sha256 = digest(archive)
  plan.integrity = integrity(archive)
  const bytes = Buffer.from(JSON.stringify(plan))
  writeFileSync(join(directory, 'release.json'), bytes)
  const identity = { head: plan.gitHead, planHash: digest(bytes), archiveHash: plan.sha256, runId: 123, runAttempt: 1 }
  const state = { releases: [], assets: new Map(), metadata: { versions: { '0.1.0-beta.2': {} }, 'dist-tags': { beta: '0.1.0-beta.2', latest: '0.1.0-beta.1' } }, head: plan.gitHead, tag: null, failedCheck: undefined, diverged: false }
  const effects = {
    releases: vi.fn(async () => clone(state.releases)),
    registry: vi.fn(async () => clone(state.metadata)),
    github: vi.fn(async (method, path, body) => {
      if (path === '') return { private: false, default_branch: 'beta' }
      if (path === '/git/ref/heads/beta') return { object: { sha: state.head } }
      if (path.startsWith('/compare/')) return { merge_base_commit: { sha: state.diverged ? 'c'.repeat(40) : plan.gitHead } }
      if (path.endsWith('/jobs?per_page=100')) return { total_count: 6, jobs: ['ci', 'coverage', 'smoke (ubuntu-24.04, 20.x)', 'smoke (ubuntu-24.04, 22.x)', 'smoke (macos-15)'].map((name, index) => ({ id: index + 100, name, conclusion: state.failedCheck === name ? 'failure' : 'success' })) }
      if (path.startsWith('/actions/runs/')) return { path: '.github/workflows/ci.yml', head_repository: { full_name: 'ciqol/resenv' }, head_branch: 'beta', head_sha: plan.gitHead, event: 'push' }
      if (path.startsWith('/git/ref/tags/')) return state.tag
      if (method === 'POST' && path === '/releases') {
        const release = { id: 1, html_url: 'https://github.com/ciqol/resenv/releases/tag/v0.1.0-beta.3', assets: [], ...body }
        state.releases.push(release)
        return clone(release)
      }
      if (method === 'PATCH') {
        Object.assign(state.releases.find(release => path === `/releases/${release.id}`), body)
        return {}
      }
      if (method === 'POST' && path === '/git/refs') { state.tag = { object: { sha: body.sha } }; return {} }
      if (method === 'POST' && path === '/actions/workflows/ci.yml/dispatches') return undefined
      throw new Error(`Unexpected test request: ${method} ${path}`)
    }),
    upload: vi.fn(async (release, name, content) => {
      const asset = { id: state.assets.size + 1, name }
      state.assets.set(asset.id, content)
      state.releases[0].assets.push(asset)
      return asset
    }),
    download: vi.fn(async asset => state.assets.get(asset.id)),
    npm: vi.fn(async () => ({ staged: true, stageId: '00000000-0000-4000-8000-000000000000', version: plan.version, integrity: plan.integrity }))
  }
  const approve = () => { state.metadata.versions[plan.version] = { dist: { integrity: plan.integrity } }; state.metadata['dist-tags'].beta = plan.version }
  return { directory, plan, identity, state, effects, approve }
}

const writes = effects => effects.github.mock.calls.filter(([method]) => method !== 'GET')

describe('durable candidate lifecycle', () => {
  it('preserves a draft, original metadata and tested archive before staging; creates no tag', async () => {
    const f = fixture()
    await stageCandidate(f.directory, f.identity, f.effects)
    expect(f.state.releases[0].draft).toBe(true)
    expect(f.state.tag).toBeNull()
    expect(f.state.releases[0].assets.map(asset => asset.name)).toEqual(['release.json', f.plan.archive])
    expect(readRecord(f.state.releases[0]).state).toBe('staged')
    const call = f.effects.npm.mock.invocationCallOrder[0]
    expect(f.effects.upload.mock.invocationCallOrder.every(order => order < call)).toBe(true)
    expect(writes(f.effects).some(([method, , body]) => method === 'PATCH' && JSON.parse(body.body.split('\n')[1]).state === 'staging')).toBe(true)
    await stageCandidate(f.directory, f.identity, f.effects)
    expect(f.effects.npm).toHaveBeenCalledTimes(1)
  })
  it('keeps reservations and continues merges while approval is pending', async () => {
    const f = fixture()
    await stageCandidate(f.directory, f.identity, f.effects)
    f.state.head = 'b'.repeat(40)
    expect(releaseSnapshot(f.state.releases, f.state.metadata)).toEqual({ schema: 1, reserved: 3, pending: true })
    f.effects.github.mockClear()
    expect(await reconcileRelease(f.directory, f.effects)).toMatchObject({ pending: true, state: 'staged' })
    expect(writes(f.effects)).toHaveLength(0)
    expect(f.effects.npm).toHaveBeenCalledTimes(1)
  })
  it('records the original commit after branch advance, without CI artifacts or latest promotion, then tests current beta', async () => {
    const f = fixture()
    await stageCandidate(f.directory, f.identity, f.effects)
    f.approve()
    f.state.head = 'b'.repeat(40)
    // Original CI artifact storage is absent; only durable draft assets remain.
    f.effects.github.mockClear()
    expect(await reconcileRelease(f.directory, f.effects)).toMatchObject({ state: 'recorded' })
    expect(f.state.tag.object.sha).toBe(f.plan.gitHead)
    expect(f.state.releases[0].draft).toBe(false)
    expect(f.state.metadata['dist-tags'].latest).toBe('0.1.0-beta.1')
    expect(f.effects.github).toHaveBeenCalledWith('POST', '/actions/workflows/ci.yml/dispatches', { ref: 'beta', inputs: { publish: true } })
    expect(readRecord(f.state.releases[0]).continued).toBe(true)
    f.effects.github.mockClear()
    expect(await reconcileRelease(f.directory, f.effects)).toEqual({ state: 'idle' })
    expect(writes(f.effects)).toHaveLength(0)
    expect(f.effects.npm).toHaveBeenCalledTimes(1)
  })
  it('does not retry npm after a lost stage response and can recover a published exact archive', async () => {
    const f = fixture()
    f.effects.npm.mockRejectedValueOnce(new Error('lost response'))
    await expect(stageCandidate(f.directory, f.identity, f.effects)).rejects.toThrow('lost response')
    expect(readRecord(f.state.releases[0]).state).toBe('staging')
    await stageCandidate(f.directory, f.identity, f.effects)
    expect(f.effects.npm).toHaveBeenCalledTimes(1)
    f.approve()
    expect(await reconcileRelease(f.directory, f.effects)).toMatchObject({ state: 'recorded' })
  })
  it('resumes partial archive preservation before the first staging call', async () => {
    const f = fixture()
    f.effects.upload.mockRejectedValueOnce(new Error('upload failed'))
    await expect(stageCandidate(f.directory, f.identity, f.effects)).rejects.toThrow('upload failed')
    expect(f.effects.npm).not.toHaveBeenCalled()
    expect(readRecord(f.state.releases[0]).state).toBe('prepared')
    await stageCandidate(f.directory, f.identity, f.effects)
    expect(f.effects.npm).toHaveBeenCalledTimes(1)
  })
  it('resumes a prepared archive from durable assets after transient CI artifacts disappear', async () => {
    const f = fixture()
    const original = f.effects.github.getMockImplementation()
    let failed = false
    f.effects.github.mockImplementation(async (method, path, body) => {
      if (method === 'PATCH' && JSON.parse(body.body.split('\n')[1]).state === 'staging' && !failed) { failed = true; throw new Error('intent write failed') }
      return original(method, path, body)
    })
    await expect(stageCandidate(f.directory, f.identity, f.effects)).rejects.toThrow('intent write failed')
    expect(f.effects.npm).not.toHaveBeenCalled()
    const recovery = mkdtempSync(join(tmpdir(), 'resenv-recovery-'))
    directories.push(recovery)
    await resumeCandidate(f.plan.version, recovery, f.effects)
    expect(f.effects.npm).toHaveBeenCalledTimes(1)
    await resumeCandidate(f.plan.version, recovery, f.effects)
    expect(f.effects.npm).toHaveBeenCalledTimes(1)
  })
  it('recovers a tag written before a failed GitHub publication without recreating it', async () => {
    const f = fixture()
    await stageCandidate(f.directory, f.identity, f.effects)
    f.approve()
    const original = f.effects.github.getMockImplementation()
    let failed = false
    f.effects.github.mockImplementation(async (method, path, body) => {
      if (method === 'PATCH' && body.draft === false && !failed) { failed = true; throw new Error('publication response failed') }
      return original(method, path, body)
    })
    await expect(reconcileRelease(f.directory, f.effects)).rejects.toThrow(/response failed/)
    expect(f.state.tag.object.sha).toBe(f.plan.gitHead)
    expect(f.state.releases[0].draft).toBe(true)
    f.effects.github.mockClear()
    expect(await reconcileRelease(f.directory, f.effects)).toMatchObject({ state: 'recorded' })
    expect(writes(f.effects).some(([, path]) => path === '/git/refs')).toBe(false)
  })
  it('retries continuation after recording even when the dispatch fails', async () => {
    const f = fixture()
    await stageCandidate(f.directory, f.identity, f.effects)
    f.approve()
    f.state.head = 'b'.repeat(40)
    const original = f.effects.github.getMockImplementation()
    let failed = false
    f.effects.github.mockImplementation(async (method, path, body) => {
      if (path.endsWith('/dispatches') && !failed) { failed = true; throw new Error('dispatch failed') }
      return original(method, path, body)
    })
    await expect(reconcileRelease(f.directory, f.effects)).rejects.toThrow('dispatch failed')
    expect(f.state.releases[0].draft).toBe(false)
    expect(readRecord(f.state.releases[0]).continued).toBe(false)
    await reconcileRelease(f.directory, f.effects)
    expect(readRecord(f.state.releases[0]).continued).toBe(true)
  })
  it('does not reserve or stage a candidate whose original checks failed', async () => {
    const f = fixture()
    f.state.failedCheck = 'smoke (macos-15)'
    await expect(stageCandidate(f.directory, f.identity, f.effects)).rejects.toThrow(/did not pass/)
    expect(writes(f.effects)).toHaveLength(0)
    expect(f.effects.npm).not.toHaveBeenCalled()
  })
  it('reserves rejected versions permanently and dispatches a replacement without publishing a tag', async () => {
    const f = fixture()
    await stageCandidate(f.directory, f.identity, f.effects)
    expect(await reconcileRelease(f.directory, f.effects, { reject: f.plan.version })).toMatchObject({ state: 'rejected' })
    expect(releaseSnapshot(f.state.releases, f.state.metadata)).toEqual({ schema: 1, reserved: 3, pending: false })
    expect(f.state.tag).toBeNull()
    expect(f.effects.github).toHaveBeenCalledWith('POST', '/actions/workflows/ci.yml/dispatches', { ref: 'beta', inputs: { publish: true } })
  })
  it('refuses rejection of a public version or an unrelated candidate', async () => {
    const f = fixture()
    await stageCandidate(f.directory, f.identity, f.effects)
    f.effects.github.mockClear()
    await expect(reconcileRelease(f.directory, f.effects, { reject: '0.1.0-beta.4' })).rejects.toThrow(/matches/)
    f.approve()
    await expect(reconcileRelease(f.directory, f.effects, { reject: f.plan.version })).rejects.toThrow(/public version/)
    expect(writes(f.effects)).toHaveLength(0)
  })
  it.each(['archive', 'registry', 'source', 'checks', 'tag'])('refuses %s substitution without recording a release', async change => {
    const f = fixture()
    await stageCandidate(f.directory, f.identity, f.effects)
    f.approve()
    if (change === 'archive') f.state.assets.set(2, Buffer.from('changed'))
    if (change === 'registry') f.state.metadata.versions[f.plan.version].dist.integrity = 'sha512-other'
    if (change === 'source') f.state.diverged = true
    if (change === 'checks') f.state.failedCheck = 'ci'
    if (change === 'tag') f.state.tag = { object: { sha: 'c'.repeat(40) } }
    f.effects.github.mockClear()
    await expect(reconcileRelease(f.directory, f.effects)).rejects.toThrow()
    expect(writes(f.effects)).toHaveLength(0)
  })
  it('rejects stale versions and unmanaged/multiple reservations before staging', async () => {
    const f = fixture()
    f.state.metadata.versions[f.plan.version] = {}
    await expect(stageCandidate(f.directory, f.identity, f.effects)).rejects.toThrow(/reserved/)
    expect(writes(f.effects)).toHaveLength(0)
    expect(f.effects.npm).not.toHaveBeenCalled()
    const unmanaged = { id: 9, tag_name: 'v0.1.0-beta.4', draft: true, body: '' }
    expect(releaseSnapshot([unmanaged], f.state.metadata).pending).toBe(true)
    expect(() => releaseSnapshot([unmanaged, { ...unmanaged, id: 10 }], f.state.metadata)).toThrow(/Duplicate/)
    expect(() => releaseSnapshot([unmanaged, { ...unmanaged, id: 10, tag_name: 'v0.1.0-beta.5' }], f.state.metadata)).toThrow(/Multiple/)
  })
  it('validates durable record identity and never treats a draft as an already published release', async () => {
    const f = fixture()
    await stageCandidate(f.directory, f.identity, f.effects)
    const release = f.state.releases[0]
    expect(() => readRecord({ ...release, tag_name: 'v0.1.0-beta.9' })).toThrow()
    expect(() => readRecord({ ...release, draft: false })).toThrow()
    const record = readRecord(release)
    expect(() => recordBody({ ...record, runId: '123' })).toThrow()
  })
})
