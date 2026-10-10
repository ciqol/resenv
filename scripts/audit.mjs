import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { checkAudit } from './release-guards.mjs'

const result = spawnSync('npm', ['audit', '--json'], { encoding: 'utf8', timeout: 120000, maxBuffer: 4 * 1024 * 1024 })
assert.equal(result.error, undefined)
assert.ok(result.status === 0 || result.status === 1, 'npm audit could not complete')
const report = JSON.parse(result.stdout)
const policy = JSON.parse(readFileSync(new URL('../docs/security-exceptions.json', import.meta.url), 'utf8'))
const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'))
const reviewed = checkAudit(report, { policy, lock })
if (reviewed.length > 0) console.warn(`Reviewed release-tool advisories: ${reviewed.length}; expires ${policy.expires}. See docs/release-security.md.`)
console.log('Dependency audit passed: no unreviewed moderate/high/critical advisories.')
