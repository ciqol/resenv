import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { guardReleaseTools } from './release-guards.mjs'
import { validatePlan } from './release-artifact.mjs'
import config, { betaBase } from '../release.config.mjs'

assert.ok(process.argv.length === 3 || process.argv.length === 4, 'Usage: node scripts/release-plan.mjs <candidate-directory> [used-versions-file]')
assert.deepEqual(config.branches, [{ name: 'beta', channel: 'beta', prerelease: 'beta' }])
const output = resolve(process.argv[2])
const source = JSON.parse(readFileSync('package.json', 'utf8'))
const env = { PATH: process.env.PATH, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' }
const git = args => execFileSync('git', args, { env, encoding: 'utf8', timeout: 60000 }).trim()
const head = git(['rev-parse', 'HEAD'])
// While beta is the only branch, use the official analysis/notes plugins without
// the engine's mandatory stable branch or its default first version of 1.0.0.
const tags = git(['tag', '--merged', head, '--list', `v${betaBase}-beta.*`]).split('\n').filter(Boolean)
const counters = tags.map(tag => {
  const suffix = tag.slice(`v${betaBase}-beta.`.length)
  assert.match(suffix, /^[1-9]\d*$/, 'Invalid beta release tag')
  const counter = Number(suffix)
  assert.ok(Number.isSafeInteger(counter) && counter < Number.MAX_SAFE_INTEGER, 'Beta counter exceeds supported range')
  return counter
})
const versions = process.argv[3] ? JSON.parse(readFileSync(resolve(process.argv[3]), 'utf8')) : []
assert.ok(Array.isArray(versions) && versions.every(version => typeof version === 'string'))
const used = versions.map(version => {
  const match = /^v?0\.1\.0-beta\.([1-9]\d*)$/.exec(version)
  if (!match) return 0
  const counter = Number(match[1])
  assert.ok(Number.isSafeInteger(counter) && counter < Number.MAX_SAFE_INTEGER)
  return counter
})
const previous = Math.max(0, ...counters)
const reserved = Math.max(previous, ...used)
const lastRelease = previous ? { version: `${betaBase}-beta.${previous}`, gitTag: `v${betaBase}-beta.${previous}` } : {}
const range = previous ? `${lastRelease.gitTag}..${head}` : head
const fields = git(['log', '-z', '--format=%H%x00%B', range]).split('\0')
const commits = []
for (let i = 0; i < fields.length - 1; i += 2) {
  const hash = fields[i]
  assert.match(hash, /^[a-f0-9]{40}$/)
  commits.push({ hash, message: fields[i + 1] })
}
const restore = guardReleaseTools()
try {
  const context = { cwd: process.cwd(), env, commits, lastRelease, options: { repositoryUrl: 'https://github.com/ciqol/resenv.git' }, logger: console }
  const { analyzeCommits } = await import('@semantic-release/commit-analyzer')
  const type = await analyzeCommits({}, context)
  const version = type ? `${betaBase}-beta.${reserved + 1}` : source.version
  const nextRelease = { type, version, gitTag: `v${version}`, gitHead: head, channel: 'beta' }
  let notes = ''
  if (type) {
    const { generateNotes } = await import('@semantic-release/release-notes-generator')
    notes = await generateNotes({}, { ...context, nextRelease })
  }
  const plan = validatePlan({ schema: 1, name: source.name, repository: 'ciqol/resenv', channel: 'beta', publish: Boolean(type), version, gitTag: type ? nextRelease.gitTag : null, gitHead: head, notes, dependencies: source.dependencies }, head)
  mkdirSync(output, { recursive: true })
  writeFileSync(join(output, 'release.json'), `${JSON.stringify(plan, null, 2)}\n`)
  console.log(type ? `Planned ${plan.version} on ${plan.channel}; no publication or tag created.` : 'No releasable changes; candidate remains private.')
} finally {
  restore()
}
