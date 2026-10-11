import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export const digest = data => createHash('sha256').update(data).digest('hex')
export const integrity = data => `sha512-${createHash('sha512').update(data).digest('base64')}`

export function validatePlan (plan, head) {
  assert.equal(plan.schema, 1)
  assert.equal(plan.name, '@ciqol/resenv')
  assert.equal(plan.repository, 'ciqol/resenv')
  assert.equal(plan.channel, 'beta')
  assert.equal(typeof plan.publish, 'boolean')
  assert.match(plan.gitHead, /^[a-f0-9]{40}$/)
  if (head) assert.equal(plan.gitHead, head, 'Candidate belongs to another commit')
  assert.match(plan.version, plan.publish ? /^0\.1\.0-beta\.[1-9]\d*$/ : /^\d+\.\d+\.\d+(?:-beta\.\d+)?$/)
  assert.equal(plan.gitTag, plan.publish ? `v${plan.version}` : null)
  assert.equal(typeof plan.notes, 'string')
  assert.ok(plan.notes.length < 100000, 'Release notes exceed the supported size')
  assert.ok(plan.dependencies && typeof plan.dependencies === 'object' && !Array.isArray(plan.dependencies))
  if (plan.archive !== undefined) assert.equal(plan.archive, `ciqol-resenv-${plan.version}.tgz`)
  return plan
}

export function verifyArtifact (directory, { head, planHash, archiveHash } = {}) {
  const bytes = readFileSync(join(directory, 'release.json'))
  if (planHash) assert.equal(digest(bytes), planHash, 'Candidate metadata changed after build')
  const plan = validatePlan(JSON.parse(bytes), head)
  assert.equal(plan.archive, `ciqol-resenv-${plan.version}.tgz`)
  const archive = join(directory, plan.archive)
  const data = readFileSync(archive)
  assert.equal(digest(data), plan.sha256, 'Candidate archive changed after build')
  assert.equal(integrity(data), plan.integrity)
  if (archiveHash) assert.equal(plan.sha256, archiveHash, 'Candidate differs from the tested archive')
  const result = spawnSync('tar', ['-xOf', archive, 'package/package.json'], { encoding: 'utf8', timeout: 10000, maxBuffer: 1024 * 1024 })
  assert.equal(result.error, undefined)
  assert.equal(result.status, 0, 'Cannot read candidate manifest')
  const manifest = JSON.parse(result.stdout)
  assert.equal(manifest.name, plan.name)
  assert.equal(manifest.version, plan.version)
  assert.equal(manifest.license, 'MIT')
  assert.equal(manifest.private, plan.publish ? undefined : true)
  assert.equal(manifest.repository.url, 'git+https://github.com/ciqol/resenv.git')
  assert.deepEqual(manifest.dependencies, plan.dependencies)
  assert.deepEqual(manifest.publishConfig, { access: 'public', tag: 'beta', registry: 'https://registry.npmjs.org/' })
  for (const field of ['scripts', 'devDependencies', 'type', 'overrides']) assert.equal(manifest[field], undefined)
  return { plan, archive }
}
