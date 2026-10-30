import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { validateEnvironment, prepare } from './verify-release.mjs'

validateEnvironment(process.env)
const run = (command, args) => execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim()
assert.equal(run('git', ['rev-parse', 'HEAD']), process.env.GITHUB_SHA)
const manifest = JSON.parse(readFileSync('dist/package.json', 'utf8'))
assert.equal(manifest.name, '@ciqol/resenv')
assert.equal(manifest.private, true)
assert.equal(manifest.scripts, undefined)
delete manifest.private
writeFileSync('dist/package.json', `${JSON.stringify(manifest, null, 2)}\n`)

const tags = run('git', ['tag', '--merged', 'HEAD']).split('\n')
if (tags.some(tag => /^v\d+\.\d+\.\d+$/.test(tag))) {
  execFileSync('npm', ['run', 'release'], { stdio: 'inherit' })
} else {
  // semantic-release starts at 1.0.0 without a regular release. Publish a real
  // 0.1.0 once, then let the unmodified engine use that release as its baseline.
  const version = '0.1.0'
  manifest.version = version
  writeFileSync('dist/package.json', `${JSON.stringify(manifest, null, 2)}\n`)
  mkdirSync('release', { recursive: true })
  const [packed] = JSON.parse(run('npm', ['pack', './dist', '--pack-destination', 'release', '--json']))
  assert.equal(packed.version, version)
  assert.equal(packed.filename, `ciqol-resenv-${version}.tgz`)
  prepare({}, { nextRelease: { version } })
  execFileSync('npm', ['publish', `release/${packed.filename}`, '--access', 'public', '--tag', 'latest', '--provenance'], { stdio: 'inherit' })
  execFileSync('gh', ['release', 'create', `v${version}`, `release/${packed.filename}`, '--repo', 'ciqol/resenv', '--target', process.env.GITHUB_SHA, '--title', `v${version}`, '--generate-notes'], { stdio: 'inherit' })
}
