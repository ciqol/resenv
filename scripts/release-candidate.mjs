import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { digest, validatePlan, verifyArtifact } from './release-artifact.mjs'

async function verifySource (plan, effects) {
  const repository = await effects.github('GET', '')
  assert.equal(repository.private, false, 'Public source is required for provenance')
  assert.equal(repository.default_branch, 'beta')
  const comparison = await effects.github('GET', `/compare/${plan.gitHead}...beta`)
  assert.equal(comparison.merge_base_commit.sha, plan.gitHead, 'Candidate source is no longer an ancestor of beta')
}

export async function stageRelease (directory, identity, effects) {
  const { plan, archive } = verifyArtifact(directory, identity)
  assert.equal(plan.publish, true)
  await verifySource(plan, effects)
  const releases = await effects.releases()
  assert.ok(!releases.some(release => release.tag_name === plan.gitTag), 'This version is already reserved; inspect npm before retrying, or start a fresh CI run')
  const metadata = await effects.registry()
  assert.ok(!metadata?.versions?.[plan.version], 'This version is already public; finalize its original candidate instead')
  assert.equal(await effects.github('GET', `/git/ref/tags/${plan.gitTag}`), null, 'This version already has a Git tag')
  const planBytes = readFileSync(join(directory, 'release.json'))
  const body = `${plan.notes}\n\nArchive SHA-256: \`${plan.sha256}\`\n\n<!-- resenv-plan-sha256: ${digest(planBytes)} -->\n`
  const release = await effects.github('POST', '/releases', { tag_name: plan.gitTag, target_commitish: plan.gitHead, name: plan.gitTag, body, draft: true, prerelease: true, make_latest: 'false' })
  for (const [name, bytes] of [['release.json', planBytes], [plan.archive, readFileSync(archive)]]) {
    const asset = await effects.upload(release, name, bytes)
    assert.equal(digest(await effects.download(asset)), digest(bytes), 'Preserved candidate differs from the tested archive')
  }
  // The draft reserves this version before npm is contacted. A failed/ambiguous
  // attempt is inspected by the maintainer, never automatically restaged.
  return { ...await effects.npm(archive, plan), url: release.html_url }
}

export async function finalizeRelease (directory, version, effects) {
  assert.match(version, /^0\.1\.0-beta\.[1-9]\d*$/)
  const release = (await effects.releases()).find(item => item.tag_name === `v${version}`)
  assert.ok(release, 'No preserved candidate exists for this version')
  assert.equal(release.prerelease, true)
  const planHash = release.body?.match(/\n<!-- resenv-plan-sha256: ([a-f0-9]{64}) -->\s*$/)?.[1]
  assert.ok(planHash, 'Candidate is unmanaged; review its original evidence before recording it')
  const plans = release.assets.filter(asset => asset.name === 'release.json')
  assert.equal(plans.length, 1, 'The original release plan is missing or ambiguous')
  const bytes = await effects.download(plans[0])
  assert.equal(digest(bytes), planHash, 'The original release plan changed')
  const plan = validatePlan(JSON.parse(bytes))
  assert.equal(plan.publish, true)
  assert.equal(plan.version, version)
  assert.equal(plan.gitHead, release.target_commitish)
  assert.equal(plan.gitTag, release.tag_name)
  const archives = release.assets.filter(asset => asset.name === plan.archive)
  assert.equal(archives.length, 1, 'The tested archive is missing or ambiguous')
  writeFileSync(join(directory, 'release.json'), bytes)
  writeFileSync(join(directory, plan.archive), await effects.download(archives[0]))
  verifyArtifact(directory, { head: plan.gitHead, planHash })
  const metadata = await effects.registry()
  const published = metadata?.versions?.[version]
  assert.ok(published, 'Approve this candidate in npm and wait for public availability first')
  assert.equal(published.dist?.integrity, plan.integrity, 'Public npm archive differs from the tested candidate')
  await verifySource(plan, effects)
  const tag = await effects.github('GET', `/git/ref/tags/${plan.gitTag}`)
  if (tag) assert.equal(tag.object.sha, plan.gitHead, 'Existing release tag points to another commit')
  else await effects.github('POST', '/git/refs', { ref: `refs/tags/${plan.gitTag}`, sha: plan.gitHead })
  if (!release.draft) return release
  return effects.github('PATCH', `/releases/${release.id}`, { draft: false, make_latest: 'false' })
}
