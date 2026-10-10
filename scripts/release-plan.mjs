import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { guardReleaseTools } from './release-guards.mjs'
import { validatePlan } from './release-artifact.mjs'
import config from '../release.config.mjs'

assert.equal(process.argv.length, 3, 'Usage: node scripts/release-plan.mjs <candidate-directory>')
const output = resolve(process.argv[2])
const root = process.cwd()
const source = JSON.parse(readFileSync('package.json', 'utf8'))
const temporary = mkdtempSync(join(tmpdir(), 'resenv-plan-'))
const env = { PATH: process.env.PATH, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' }
const git = (args, cwd = root) => execFileSync('git', args, { cwd, env, encoding: 'utf8', timeout: 60000 }).trim()
const head = git(['rev-parse', 'HEAD'])
const restore = guardReleaseTools()
try {
  const mirror = join(temporary, 'history.git')
  const checkout = join(temporary, 'checkout')
  git(['clone', '--mirror', '--no-hardlinks', root, mirror])
  git(['update-ref', 'refs/heads/beta', head], mirror)
  git(['symbolic-ref', 'HEAD', 'refs/heads/beta'], mirror)
  git(['clone', '--branch', 'beta', mirror, checkout])
  // No inherited tokens or network remote are available to release tools.
  const { default: semanticRelease } = await import('semantic-release')
  const result = await semanticRelease({ ...config, repositoryUrl: pathToFileURL(mirror).href, plugins: ['@semantic-release/commit-analyzer'] }, { cwd: checkout, env })
  const next = result && result.nextRelease
  let notes = ''
  if (next) {
    assert.equal(next.gitHead, head)
    assert.equal(next.channel, 'beta')
    const { generateNotes } = await import('@semantic-release/release-notes-generator')
    notes = await generateNotes({}, { ...result, cwd: checkout, env, options: { repositoryUrl: 'https://github.com/ciqol/resenv.git' }, logger: console })
  }
  const plan = validatePlan({ schema: 1, name: source.name, repository: 'ciqol/resenv', channel: 'beta', publish: Boolean(next), version: next?.version ?? source.version, gitTag: next?.gitTag ?? null, gitHead: head, notes, dependencies: source.dependencies }, head)
  mkdirSync(output, { recursive: true })
  writeFileSync(join(output, 'release.json'), `${JSON.stringify(plan, null, 2)}\n`)
  console.log(next ? `Planned ${plan.version} on ${plan.channel}; no publication or tag created.` : 'No releasable changes; candidate remains private.')
} finally {
  restore()
  rmSync(temporary, { recursive: true, force: true })
}
