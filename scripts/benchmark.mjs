import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { performance } from 'node:perf_hooks'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { resolveEnv } from '../dist/index.mjs'
import { resolveReferences } from '../src/doppler/resolve.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const env = Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`VALUE_${i}`, 'dummy-plain-value']))
const median = samples => [...samples].sort((a, b) => a - b)[Math.floor(samples.length / 2)]
const round = value => Math.round(value * 1000) / 1000
const samples = { baseline: [], require: [], import: [] }
const prefixes = { baseline: [], require: ['--require', './dist/resolve.cjs'], import: ['--import', './dist/resolve.mjs'] }

// Fresh processes, interleaved to reduce ordering bias; no credentials or network.
for (let i = 0; i < 23; i++) {
  for (const [name, args] of Object.entries(prefixes)) {
    const start = performance.now()
    const result = spawnSync(process.execPath, [...args, '-e', ''], { cwd: root, env, encoding: 'utf8', timeout: 10000 })
    const elapsed = performance.now() - start
    assert.equal(result.status, 0, result.stderr)
    if (i >= 3) samples[name].push(elapsed)
  }
}

const noWork = []
for (let i = 0; i < 5000; i++) {
  const start = performance.now()
  resolveEnv(env, { doppler: true })
  noWork.push(performance.now() - start)
}

const references = Object.fromEntries(Array.from({ length: 16 }, (_, i) => [`KEY_${i}`, `doppler://dummy/dev/KEY_${i % 8}`]))
const cloud = []
let peak = 0
for (let i = 0; i < 5; i++) {
  let active = 0
  let calls = 0
  const start = performance.now()
  const values = await resolveReferences(references, {
    getCredential: async () => 'dp.ct.dummy0123456789',
    request: async () => {
      calls++
      peak = Math.max(peak, ++active)
      await delay(40)
      active--
      return { value: { computed: 'dummy-value' } }
    }
  })
  cloud.push(performance.now() - start)
  assert.equal(calls, 8)
  assert.equal(Object.keys(values).length, 16)
}

console.log(JSON.stringify({
  node: process.version, platform: process.platform, arch: process.arch,
  startupMedianMs: Object.fromEntries(Object.entries(samples).map(([name, values]) => [name, round(median(values))])),
  startupSamples: 20, plainEnvironmentSize: 200, noWorkMedianMs: round(median(noWork)),
  mockProvider: { uniqueReferences: 8, totalReferences: 16, delayMs: 40, samples: 5, medianMs: round(median(cloud)), peakRequests: peak }
}, null, 2))
