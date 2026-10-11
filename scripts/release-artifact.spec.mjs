import { afterEach, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { digest, integrity, validatePlan, verifyArtifact } from './release-artifact.mjs'

const directories = []
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }) })
const plan = () => ({ schema: 1, publish: true, name: '@ciqol/resenv', repository: 'ciqol/resenv', channel: 'beta', version: '0.1.0-beta.1', gitTag: 'v0.1.0-beta.1', gitHead: 'a'.repeat(40), notes: 'Dummy release', dependencies: { sample: '0.1.0-beta.1' } })

function fixture () {
  const directory = mkdtempSync(join(tmpdir(), 'resenv-artifact-spec-'))
  directories.push(directory)
  mkdirSync(join(directory, 'package'))
  const candidate = { ...plan(), archive: 'ciqol-resenv-0.1.0-beta.1.tgz' }
  const manifest = { name: candidate.name, version: candidate.version, dependencies: candidate.dependencies, license: 'MIT', repository: { url: 'git+https://github.com/ciqol/resenv.git' }, publishConfig: { access: 'public', tag: 'beta', registry: 'https://registry.npmjs.org/' } }
  writeFileSync(join(directory, 'package/package.json'), JSON.stringify(manifest))
  execFileSync('tar', ['-czf', candidate.archive, 'package'], { cwd: directory })
  const archive = readFileSync(join(directory, candidate.archive))
  const metadata = JSON.stringify({ ...candidate, sha256: digest(archive), integrity: integrity(archive) })
  writeFileSync(join(directory, 'release.json'), metadata)
  return { directory, candidate, metadata, archive }
}

describe('release candidate boundary', () => {
  it('verifies the final archive against hashes exported by the build job', () => {
    const { directory, metadata, archive } = fixture()
    expect(verifyArtifact(directory, { head: 'a'.repeat(40), planHash: digest(metadata), archiveHash: digest(archive) }).plan.publish).toBe(true)
  })
  it('rejects archive substitution', () => {
    const { directory, candidate } = fixture()
    writeFileSync(join(directory, candidate.archive), 'changed')
    expect(() => verifyArtifact(directory)).toThrow(/archive changed/)
  })
  it('rejects metadata substitution, source drift and a different tested digest', () => {
    const { directory } = fixture()
    expect(() => verifyArtifact(directory, { planHash: 'b'.repeat(64) })).toThrow(/metadata changed/)
    expect(() => verifyArtifact(directory, { head: 'b'.repeat(40) })).toThrow(/another commit/)
    expect(() => verifyArtifact(directory, { archiveHash: 'b'.repeat(64) })).toThrow(/tested archive/)
  })
  it.each([{ publish: 'true' }, { archive: '../different.tgz' }, { version: '1.0.0' }, { gitTag: 'latest' }, { name: '@other/package' }, { repository: 'other/repo' }])('rejects invalid release metadata %j', change => {
    expect(() => validatePlan({ ...plan(), ...change })).toThrow()
  })
})
