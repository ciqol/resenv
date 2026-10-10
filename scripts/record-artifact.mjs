import assert from 'node:assert/strict'
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { digest, integrity, validatePlan, verifyArtifact } from './release-artifact.mjs'

assert.equal(process.argv.length, 3, 'Usage: node scripts/record-artifact.mjs <candidate-directory>')
const directory = resolve(process.argv[2])
const path = join(directory, 'release.json')
const plan = validatePlan(JSON.parse(readFileSync(path, 'utf8')))
plan.archive = `ciqol-resenv-${plan.version}.tgz`
const data = readFileSync(join(directory, plan.archive))
plan.sha256 = digest(data)
plan.integrity = integrity(data)
const bytes = `${JSON.stringify(plan, null, 2)}\n`
writeFileSync(path, bytes)
verifyArtifact(directory)
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `publish=${plan.publish}\nversion=${plan.version}\nplan_sha256=${digest(bytes)}\narchive_sha256=${plan.sha256}\n`)
console.log(`Verified ${plan.archive}: ${plan.sha256}`)
