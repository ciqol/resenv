import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ calls: [], sha: 'a'.repeat(40) }))
vi.mock('node:child_process', () => ({
  execFileSync: (command, args) => {
    state.calls.push([command, ...args])
    if (command === 'git' && args[0] === 'rev-parse') return state.sha
    if (command === 'git' && args[0] === 'tag') return 'v0.1.0-beta.1'
    if (command === 'npm' && args[0] === 'pack') return JSON.stringify([{ version: '0.1.0', filename: 'ciqol-resenv-0.1.0.tgz' }])
    return ''
  }
}))
vi.mock('node:fs', () => ({
  mkdirSync: vi.fn(),
  readFileSync: () => JSON.stringify({ name: '@ciqol/resenv', private: true }),
  writeFileSync: vi.fn()
}))
vi.mock('./verify-release.mjs', () => ({
  validateEnvironment: vi.fn(),
  prepare: () => state.calls.push(['check-package'])
}))

afterEach(() => vi.unstubAllEnvs())

it('publishes the checked local archive rather than interpreting its path as a GitHub repository', async () => {
  vi.stubEnv('GITHUB_SHA', state.sha)
  await import('./release.mjs')
  const publish = state.calls.find(call => call[0] === 'npm' && call[1] === 'publish')
  const npmRequire = createRequire(new URL('../node_modules/npm/package.json', import.meta.url))
  const parsed = npmRequire('npm-package-arg')(publish[2])
  expect(parsed.type).toBe('file')
  expect(parsed.fetchSpec).toBe(resolve('release/ciqol-resenv-0.1.0.tgz'))
  expect(state.calls.map(call => call.slice(0, 2))).toEqual([
    ['git', 'rev-parse'], ['git', 'tag'], ['npm', 'pack'], ['check-package'], ['npm', 'publish'], ['gh', 'release']
  ])
  expect(state.calls.at(-1)).toContain(state.sha)
})
