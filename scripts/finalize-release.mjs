import assert from 'node:assert/strict'
import { appendFileSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { verifyArtifact } from './release-artifact.mjs'
import { githubRequest, publishRelease, registryMetadata, validateStageReceipt } from './publish.mjs'

export function validateFinalizer (env, expires, now = Date.now()) {
  assert.ok(now < Date.parse(expires), 'Publishing platform security review has expired')
  assert.equal(env.GITHUB_ACTIONS, 'true')
  assert.ok(['schedule', 'workflow_run', 'workflow_dispatch'].includes(env.GITHUB_EVENT_NAME))
  assert.equal(env.GITHUB_REPOSITORY, 'ciqol/resenv')
  assert.equal(env.GITHUB_REF, 'refs/heads/beta')
  assert.equal(env.GITHUB_WORKFLOW_REF, 'ciqol/resenv/.github/workflows/finalize-release.yml@refs/heads/beta')
  assert.equal(env.RELEASE_ENABLED, 'true')
  assert.ok(env.GITHUB_TOKEN)
}

export function validateSourceRun (run, head) {
  assert.ok(Number.isSafeInteger(run.id) && run.id > 0)
  assert.equal(run.path, '.github/workflows/ci.yml')
  assert.equal(run.head_repository?.full_name, 'ciqol/resenv')
  assert.equal(run.head_branch, 'beta')
  assert.match(run.head_sha ?? '', /^[a-f0-9]{40}$/)
  assert.equal(run.head_sha, head, 'The beta branch has changed since staging')
  assert.ok(['push', 'workflow_dispatch'].includes(run.event))
  assert.equal(run.status, 'completed')
  assert.equal(run.conclusion, 'success')
}

// Only artifacts from a successful, trusted beta CI run can reach the recorder.
export async function findStagedRun (github) {
  const branch = await github('GET', '/git/ref/heads/beta')
  const head = branch.object.sha
  assert.match(head ?? '', /^[a-f0-9]{40}$/)
  const { workflow_runs: runs } = await github('GET', `/actions/workflows/ci.yml/runs?branch=beta&head_sha=${head}&status=success&per_page=100`)
  for (const run of runs) {
    if (!['push', 'workflow_dispatch'].includes(run.event) || run.head_repository?.full_name !== 'ciqol/resenv') continue
    validateSourceRun(run, head)
    const { artifacts } = await github('GET', `/actions/runs/${run.id}/artifacts?per_page=100`)
    const names = artifacts.filter(artifact => !artifact.expired).map(artifact => artifact.name)
    if (names.includes('resenv-stage') && names.includes('resenv-package')) return run
  }
  return null
}

export async function finalizeRelease (directory, run, effects) {
  const branch = await effects.github('GET', '/git/ref/heads/beta')
  validateSourceRun(run, branch.object.sha)
  const candidate = verifyArtifact(directory, { head: run.head_sha })
  const receipt = JSON.parse(readFileSync(join(directory, 'stage.json'), 'utf8'))
  validateStageReceipt(JSON.stringify({ [candidate.plan.name]: { name: candidate.plan.name, ...receipt } }), candidate.plan)
  return publishRelease(candidate, effects, { recordOnly: true })
}

async function main () {
  const mode = process.argv[2]
  assert.ok(mode === 'find' || mode === 'record', 'Usage: node scripts/finalize-release.mjs find|record [candidate-directory]')
  assert.equal(process.argv.length, mode === 'find' ? 3 : 4)
  const policy = JSON.parse(readFileSync(new URL('../docs/security-exceptions.json', import.meta.url), 'utf8'))
  validateFinalizer(process.env, policy.expires)
  if (mode === 'find') {
    const run = await findStagedRun(githubRequest)
    if (run) appendFileSync(process.env.GITHUB_OUTPUT, `run_id=${run.id}\n`)
    else console.log('No retained staging candidate for the current beta head')
    return
  }
  assert.match(process.env.SOURCE_RUN_ID ?? '', /^[1-9]\d*$/)
  const run = await githubRequest('GET', `/actions/runs/${process.env.SOURCE_RUN_ID}`)
  const result = await finalizeRelease(resolve(process.argv[3]), run, { github: githubRequest, registry: registryMetadata })
  const message = result.pending ? result.reason : `Recorded GitHub prerelease: ${result.html_url}`
  console.log(message)
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${message}\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main()
