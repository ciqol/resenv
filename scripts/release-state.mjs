import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { validatePlan } from './release-artifact.mjs'
import { listReleases, registryMetadata } from './release-services.mjs'

const prefix = '<!-- resenv-release:v1\n'
export const betaCounter = version => {
  const match = /^v?0\.1\.0-beta\.([1-9]\d*)$/.exec(version)
  if (!match) return 0
  const counter = Number(match[1])
  assert.ok(Number.isSafeInteger(counter) && counter < Number.MAX_SAFE_INTEGER, 'Beta counter exceeds supported range')
  return counter
}

export function validateRecord (record) {
  assert.equal(record.schema, 1)
  assert.ok(['prepared', 'staging', 'staged', 'recorded', 'rejected'].includes(record.state))
  validatePlan(record.plan)
  assert.equal(record.plan.publish, true)
  assert.equal(record.plan.archive, `ciqol-resenv-${record.plan.version}.tgz`)
  assert.match(record.plan.sha256 ?? '', /^[a-f0-9]{64}$/)
  assert.match(record.plan.integrity ?? '', /^sha512-[A-Za-z0-9+/]+={0,2}$/)
  assert.match(record.planHash ?? '', /^[a-f0-9]{64}$/)
  assert.ok(Number.isSafeInteger(record.runId) && record.runId > 0)
  assert.ok(Number.isSafeInteger(record.runAttempt) && record.runAttempt > 0)
  assert.equal(typeof record.continued, 'boolean')
  assert.ok(Array.isArray(record.checks) && record.checks.length > 0 && record.checks.length <= 100)
  assert.equal(new Set(record.checks.map(check => check.id)).size, record.checks.length)
  for (const check of record.checks) {
    assert.ok(Number.isSafeInteger(check.id) && check.id > 0)
    assert.ok(typeof check.name === 'string' && check.name.length > 0 && check.name.length < 200)
  }
  if (record.state === 'staged') assert.match(record.stageId ?? '', /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i)
  return record
}

export function readRecord (release) {
  if (!release.body?.startsWith(prefix)) return null
  const line = release.body.slice(prefix.length).split('\n')[0]
  const record = validateRecord(JSON.parse(line))
  assert.equal(release.tag_name, record.plan.gitTag)
  assert.equal(release.target_commitish, record.plan.gitHead)
  assert.equal(release.prerelease, true)
  assert.equal(release.draft, record.state !== 'recorded')
  return record
}

export function recordBody (record) {
  validateRecord(record)
  const body = `${prefix}${JSON.stringify(record)}\n-->\n\n${record.plan.notes}\n\nRelease state: ${record.state}.\nArchive SHA-256: \`${record.plan.sha256}\`.\n`
  assert.ok(body.length < 120000, 'Release record exceeds GitHub body limit')
  return body
}

export function releaseSnapshot (releases, metadata) {
  const active = []
  const seen = new Set()
  const counters = Object.keys(metadata?.versions ?? {}).map(betaCounter)
  for (const release of releases) {
    const counter = betaCounter(release.tag_name)
    if (!counter) continue
    assert.ok(!seen.has(counter), 'Duplicate release reservations require maintainer reconciliation')
    seen.add(counter)
    counters.push(counter)
    const record = readRecord(release)
    if (release.draft && record?.state !== 'rejected') active.push(release.id)
  }
  assert.ok(active.length <= 1, 'Multiple pending releases require maintainer reconciliation')
  return { schema: 1, reserved: Math.max(0, ...counters), pending: active.length > 0 }
}

async function main () {
  assert.equal(process.argv.length, 3, 'Usage: node scripts/release-state.mjs <snapshot-file>')
  const snapshot = releaseSnapshot(await listReleases(), await registryMetadata())
  writeFileSync(resolve(process.argv[2]), `${JSON.stringify(snapshot)}\n`)
  console.log(snapshot.pending ? 'A durable release is pending; this run will validate without staging' : 'Release reservations loaded')
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main()
