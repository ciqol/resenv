import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { checkAudit } from './release-guards.mjs'

const url = 'https://github.com/advisories/GHSA-dummy'
const fixture = () => ({
  report: { metadata: {}, vulnerabilities: { sample: { severity: 'high', via: [{ url, name: 'sample', severity: 'high' }], nodes: ['node_modules/sample'] } } },
  options: { now: Date.parse('2026-10-10'), policy: { expires: '2026-11-09', exceptions: [{ advisory: url, package: 'sample', nodes: ['node_modules/sample'], versions: ['1.0.0'] }] }, lock: { packages: { 'node_modules/sample': { dev: true, version: '1.0.0' } } } }
})

describe('bounded development audit review', () => {
  it('accepts only the reviewed development path and advisory', () => {
    const { report, options } = fixture()
    expect(checkAudit(report, options)).toEqual([url])
  })
  it.each(['unknown', 'runtime', 'version', 'expired', 'network', 'propagation'])('rejects %s drift', change => {
    const { report, options } = fixture()
    if (change === 'unknown') report.vulnerabilities.sample.via[0].url += '-unknown'
    if (change === 'runtime') options.lock.packages['node_modules/sample'].dev = false
    if (change === 'version') options.lock.packages['node_modules/sample'].version = '1.1.0'
    if (change === 'expired') options.now = Date.parse('2026-11-09')
    if (change === 'network') report.error = { code: 'ENETUNREACH' }
    if (change === 'propagation') report.vulnerabilities.sample.via = ['missing']
    expect(() => checkAudit(report, options)).toThrow()
  })
})

it('blocks unused publishing modules and braces, while real adversarial commit analysis still works', () => {
  const probe = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { createRequire } from 'node:module';
    import { guardReleaseTools } from './scripts/release-guards.mjs';
    const restore = guardReleaseTools();
    const require = createRequire(import.meta.url);
    assert.throws(() => require('braces')('a{b,c}'), /must not execute braces/);
    assert.throws(() => require('braces').parse('a{b,c}'), /must not execute braces/);
    for (const name of ['@semantic-release/npm', '@semantic-release/github']) {
      await assert.rejects(import(name), /must not load/);
    }
    const { analyzeCommits } = await import('@semantic-release/commit-analyzer');
    const braces = '{'.repeat(10000) + '}'.repeat(10000);
    assert.equal(await analyzeCommits({}, { cwd: process.cwd(), commits: [{ message: 'feat: ' + braces }], logger: { log() {} } }), 'minor');
    assert.equal(await analyzeCommits({}, { cwd: process.cwd(), commits: [{ message: braces + ': dummy' }], logger: { log() {} } }), null);
    restore();
  `], { encoding: 'utf8', timeout: 30000 })
  expect(probe.error).toBeUndefined()
  expect(probe.status, probe.stderr).toBe(0)
}, 35000)
