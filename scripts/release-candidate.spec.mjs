import { afterEach, expect, it, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { digest, integrity } from './release-artifact.mjs'
import { finalizeRelease, stageRelease } from './release-candidate.mjs'

const directories = []
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }) })
const clone = value => JSON.parse(JSON.stringify(value))

function fixture () {
  const directory = mkdtempSync(join(tmpdir(), 'resenv-candidate-'))
  directories.push(directory)
  mkdirSync(join(directory, 'package'))
  const plan = { schema: 1, publish: true, name: '@ciqol/resenv', repository: 'ciqol/resenv', channel: 'beta', version: '0.1.0-beta.3', gitTag: 'v0.1.0-beta.3', gitHead: 'a'.repeat(40), notes: 'Dummy notes', dependencies: {}, archive: 'ciqol-resenv-0.1.0-beta.3.tgz' }
  writeFileSync(join(directory, 'package/package.json'), JSON.stringify({ name: plan.name, version: plan.version, dependencies: {}, license: 'MIT', repository: { url: 'git+https://github.com/ciqol/resenv.git' }, publishConfig: { access: 'public', tag: 'beta', registry: 'https://registry.npmjs.org/' } }))
  execFileSync('tar', ['-czf', plan.archive, 'package'], { cwd: directory })
  const archive = readFileSync(join(directory, plan.archive))
  plan.sha256 = digest(archive)
  plan.integrity = integrity(archive)
  const bytes = Buffer.from(JSON.stringify(plan))
  writeFileSync(join(directory, 'release.json'), bytes)
  const identity = { head: plan.gitHead, planHash: digest(bytes), archiveHash: plan.sha256 }
  const state = { releases: [], assets: new Map(), metadata: { versions: {}, 'dist-tags': { latest: '0.1.0-beta.1' } }, tag: null, diverged: false }
  const effects = {
    releases: vi.fn(async () => clone(state.releases)),
    registry: vi.fn(async () => clone(state.metadata)),
    github: vi.fn(async (method, path, body) => {
      if (path === '') return { private: false, default_branch: 'beta' }
      if (path.startsWith('/compare/')) return { merge_base_commit: { sha: state.diverged ? 'b'.repeat(40) : plan.gitHead }, status: 'ahead' }
      if (path.startsWith('/git/ref/tags/')) return state.tag
      if (method === 'POST' && path === '/releases') {
        const release = { id: 1, assets: [], html_url: 'https://github.com/ciqol/resenv/releases/tag/v0.1.0-beta.3', ...body }
        state.releases.push(release)
        return clone(release)
      }
      if (method === 'POST' && path === '/git/refs') { state.tag = { object: { sha: body.sha } }; return {} }
      if (method === 'PATCH') { Object.assign(state.releases[0], body); return clone(state.releases[0]) }
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
  const approve = () => { state.metadata.versions[plan.version] = { dist: { integrity: plan.integrity } } }
  return { directory, plan, identity, state, effects, approve }
}

it('preserves one tested candidate and stages it without creating a tag', async () => {
  const f = fixture()
  await stageRelease(f.directory, f.identity, f.effects)
  expect(f.state.releases[0].draft).toBe(true)
  expect(f.state.releases[0].assets.map(asset => asset.name)).toEqual(['release.json', f.plan.archive])
  expect(f.state.tag).toBeNull()
  expect(f.effects.upload.mock.invocationCallOrder.every(order => order < f.effects.npm.mock.invocationCallOrder[0])).toBe(true)
})

it('refuses to restage a reserved version after an ambiguous npm failure', async () => {
  const f = fixture()
  f.effects.npm.mockRejectedValueOnce(new Error('lost response'))
  await expect(stageRelease(f.directory, f.identity, f.effects)).rejects.toThrow('lost response')
  await expect(stageRelease(f.directory, f.identity, f.effects)).rejects.toThrow(/already reserved/)
  expect(f.effects.npm).toHaveBeenCalledTimes(1)
})

it('finalizes the original source after beta advances, with no CI artifact or channel-tag dependency', async () => {
  const f = fixture()
  await stageRelease(f.directory, f.identity, f.effects)
  f.effects.github.mockClear()
  await expect(finalizeRelease(f.directory, f.plan.version, f.effects)).rejects.toThrow(/Approve this candidate/)
  expect(f.effects.github.mock.calls.every(([method]) => method === 'GET')).toBe(true)
  f.approve()
  await finalizeRelease(f.directory, f.plan.version, f.effects)
  expect(f.state.tag.object.sha).toBe(f.plan.gitHead)
  expect(f.state.releases[0].draft).toBe(false)
  expect(f.state.metadata['dist-tags'].latest).toBe('0.1.0-beta.1')
  f.effects.github.mockClear()
  await finalizeRelease(f.directory, f.plan.version, f.effects)
  expect(f.effects.github.mock.calls.every(([method]) => method === 'GET')).toBe(true)
  expect(f.effects.npm).toHaveBeenCalledTimes(1)
})

it.each(['archive', 'plan', 'registry', 'source', 'tag'])('refuses %s substitution before recording', async change => {
  const f = fixture()
  await stageRelease(f.directory, f.identity, f.effects)
  f.approve()
  if (change === 'archive') f.state.assets.set(2, Buffer.from('changed'))
  if (change === 'plan') f.state.assets.set(1, Buffer.from('{}'))
  if (change === 'registry') f.state.metadata.versions[f.plan.version].dist.integrity = 'sha512-other'
  if (change === 'source') f.state.diverged = true
  if (change === 'tag') f.state.tag = { object: { sha: 'b'.repeat(40) } }
  f.effects.github.mockClear()
  await expect(finalizeRelease(f.directory, f.plan.version, f.effects)).rejects.toThrow()
  expect(f.effects.github.mock.calls.every(([method]) => method === 'GET')).toBe(true)
})
