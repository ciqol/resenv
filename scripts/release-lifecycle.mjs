import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { digest, verifyArtifact } from './release-artifact.mjs'
import { betaCounter, readRecord, recordBody, releaseSnapshot } from './release-state.mjs'

async function verifyRepository (effects) {
  const repository = await effects.github('GET', '')
  assert.equal(repository.private, false, 'Public source is required for provenance')
  assert.equal(repository.default_branch, 'beta', 'Release branch migration requires review')
}

export async function verifySource (record, effects) {
  const run = await effects.github('GET', `/actions/runs/${record.runId}/attempts/${record.runAttempt}`)
  assert.equal(run.path, '.github/workflows/ci.yml')
  assert.equal(run.head_repository?.full_name, 'ciqol/resenv')
  assert.equal(run.head_branch, 'beta')
  assert.equal(run.head_sha, record.plan.gitHead)
  assert.ok(['push', 'workflow_dispatch'].includes(run.event))
  const { jobs, total_count: total } = await effects.github('GET', `/actions/runs/${record.runId}/attempts/${record.runAttempt}/jobs?per_page=100`)
  assert.ok(total <= 100, 'Source run jobs exceed the verification bound')
  const expected = record.checks ?? ['ci', 'coverage', 'smoke (ubuntu-24.04, 20.x)', 'smoke (ubuntu-24.04, 22.x)', 'smoke (macos-15)'].map(name => ({ name }))
  const checks = []
  for (const check of expected) {
    const matches = jobs.filter(job => job.name === check.name && (check.id === undefined || job.id === check.id))
    assert.equal(matches.length, 1, `Missing or ambiguous source check: ${check.name}`)
    assert.equal(matches[0].conclusion, 'success', `Source check did not pass: ${check.name}`)
    checks.push({ id: matches[0].id, name: matches[0].name })
  }
  const comparison = await effects.github('GET', `/compare/${record.plan.gitHead}...beta`)
  assert.equal(comparison.merge_base_commit.sha, record.plan.gitHead, 'Candidate source is no longer an ancestor of beta')
  return checks
}

async function persist (release, record, effects) {
  const extra = record.state === 'recorded' ? { draft: false, make_latest: 'false' } : {}
  const updated = await effects.github('PATCH', `/releases/${release.id}`, { body: recordBody(record), ...extra })
  return { ...release, ...updated, ...extra, body: recordBody(record) }
}

async function preserveAssets ({ release, directory, record }, effects) {
  for (const [name, expected] of [['release.json', record.planHash], [record.plan.archive, record.plan.sha256]]) {
    const bytes = readFileSync(join(directory, name))
    assert.equal(digest(bytes), expected)
    const existing = release.assets.filter(asset => asset.name === name)
    assert.ok(existing.length < 2, 'Duplicate durable release asset')
    const asset = existing[0] ?? await effects.upload(release, name, bytes)
    assert.equal(digest(await effects.download(asset)), expected, 'Durable release asset differs from tested bytes')
  }
}

async function restoreCandidate ({ directory, release, record }, effects) {
  for (const [name, expected] of [['release.json', record.planHash], [record.plan.archive, record.plan.sha256]]) {
    const assets = release.assets.filter(asset => asset.name === name)
    assert.equal(assets.length, 1, 'Original durable candidate asset is missing or ambiguous')
    const bytes = await effects.download(assets[0])
    assert.equal(digest(bytes), expected, 'Durable candidate asset was changed')
    writeFileSync(join(directory, name), bytes)
  }
  verifyArtifact(directory, { head: record.plan.gitHead, planHash: record.planHash, archiveHash: record.plan.sha256 })
}

export async function resumeCandidate (version, directory, effects) {
  assert.match(version, /^0\.1\.0-beta\.[1-9]\d*$/)
  const release = (await effects.releases()).find(item => item.tag_name === `v${version}`)
  assert.ok(release, 'No durable reservation exists for this version')
  const record = readRecord(release)
  assert.ok(record, 'Reservation is unmanaged')
  if (record.state !== 'prepared') return { pending: record.state !== 'recorded', state: record.state }
  await verifySource(record, effects)
  await restoreCandidate({ directory, release, record }, effects)
  return stageCandidate(directory, { head: record.plan.gitHead, planHash: record.planHash, archiveHash: record.plan.sha256, runId: record.runId, runAttempt: record.runAttempt }, effects)
}

export async function stageCandidate (directory, identity, effects) {
  await verifyRepository(effects)
  const candidate = verifyArtifact(directory, identity)
  const { plan, archive } = candidate
  assert.equal(plan.publish, true)
  const releases = await effects.releases()
  const snapshot = releaseSnapshot(releases, await effects.registry())
  let release = releases.find(item => item.tag_name === plan.gitTag)
  let record = release && readRecord(release)
  if (release) {
    assert.ok(record, 'Version is reserved by an unmanaged release')
    assert.equal(record.planHash, digest(readFileSync(join(directory, 'release.json'))), 'Reserved candidate metadata differs; recover the original archive')
    assert.equal(record.plan.sha256, plan.sha256)
    if (record.state !== 'prepared') return { pending: record.state !== 'recorded', state: record.state, url: release.html_url }
  } else {
    if (snapshot.pending) return { pending: true, state: 'deferred' }
    assert.ok(betaCounter(plan.version) > snapshot.reserved, 'Candidate version is already reserved; run a fresh candidate check')
    record = { schema: 1, state: 'prepared', plan, planHash: digest(readFileSync(join(directory, 'release.json'))), runId: identity.runId, runAttempt: identity.runAttempt, continued: false }
    record.checks = await verifySource(record, effects)
    assert.equal(await effects.github('GET', `/git/ref/tags/${plan.gitTag}`), null, 'Candidate tag already exists')
    release = await effects.github('POST', '/releases', { tag_name: plan.gitTag, target_commitish: plan.gitHead, name: plan.gitTag, draft: true, prerelease: true, make_latest: 'false', body: recordBody(record) })
  }
  await verifySource(record, effects)
  await preserveAssets({ release, directory, record }, effects)
  record = { ...record, state: 'staging' }
  await persist(release, record, effects)
  // A lost response leaves staging intent durable. A retry must never stage again.
  const receipt = await effects.npm(archive, plan)
  assert.equal(receipt.staged, true)
  assert.equal(receipt.version, plan.version)
  assert.equal(receipt.integrity, plan.integrity)
  record = { ...record, state: 'staged', stageId: receipt.stageId }
  await persist(release, record, effects)
  return { ...receipt, url: release.html_url }
}

async function continueQueue (release, record, effects) {
  if (record.continued) return
  const branch = await effects.github('GET', '/git/ref/heads/beta')
  if (record.state === 'rejected' || branch.object.sha !== record.plan.gitHead) {
    // A duplicate dispatch after a lost response is harmless: CI is serialized
    // and the next draft reservation is rechecked immediately before staging.
    await effects.github('POST', '/actions/workflows/ci.yml/dispatches', { ref: 'beta', inputs: { publish: true } })
  }
  await persist(release, { ...record, continued: true }, effects)
}

export async function reconcileRelease (directory, effects, { reject } = {}) {
  await verifyRepository(effects)
  const releases = await effects.releases()
  releaseSnapshot(releases, await effects.registry())
  const pending = releases.filter(release => {
    const record = readRecord(release)
    return record && (release.draft && record.state !== 'rejected' || !record.continued)
  })
  if (reject) assert.ok(pending.some(release => release.draft && readRecord(release).plan.version === reject), 'No pending candidate matches the requested rejection')
  for (let release of pending) {
    let record = readRecord(release)
    if (record.state === 'recorded' || record.state === 'rejected') {
      await continueQueue(release, record, effects)
      continue
    }
    const metadata = await effects.registry()
    const published = metadata?.versions?.[record.plan.version]
    if (reject === record.plan.version) {
      assert.ok(!published, 'A public version cannot be marked rejected')
      record = { ...record, state: 'rejected' }
      release = await persist(release, record, effects)
      await continueQueue(release, record, effects)
      return { state: 'rejected', version: record.plan.version }
    }
    if (!published) return { state: record.state, pending: true, version: record.plan.version, stageId: record.stageId }
    assert.equal(published.dist?.integrity, record.plan.integrity, 'Public archive differs from the tested candidate')
    await verifySource(record, effects)
    await restoreCandidate({ directory, release, record }, effects)
    const tag = await effects.github('GET', `/git/ref/tags/${record.plan.gitTag}`)
    if (tag) assert.equal(tag.object.sha, record.plan.gitHead, 'Release tag points to another source commit')
    else await effects.github('POST', '/git/refs', { ref: `refs/tags/${record.plan.gitTag}`, sha: record.plan.gitHead })
    record = { ...record, state: 'recorded' }
    release = await persist(release, record, effects)
    await continueQueue(release, record, effects)
    return { state: 'recorded', version: record.plan.version, url: release.html_url }
  }
  assert.ok(!reject, 'No pending candidate matches the requested rejection')
  return { state: 'idle' }
}
