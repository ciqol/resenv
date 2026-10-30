import { expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Writable } from 'node:stream'
import semanticRelease from 'semantic-release'
import config from '../release.config.mjs'

it('uses the standard engine and real tags for 0.x fixes, features and breaking changes', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'resenv-semantic-'))
  const root = fileURLToPath(new URL('..', import.meta.url))
  const git = args => execFileSync('git', args, { cwd: directory, encoding: 'utf8', env: { PATH: process.env.PATH, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' } }).trim()
  const sink = new Writable({ write (_, __, done) { done() } })
  try {
    git(['init', '-b', 'main'])
    git(['config', 'user.name', 'release-test'])
    git(['config', 'user.email', 'release-test@example.invalid'])
    git(['config', 'commit.gpgsign', 'false'])
    writeFileSync(join(directory, 'package.json'), '{"name":"dummy","private":true}')
    git(['add', 'package.json'])
    git(['commit', '-m', 'feat: initial fixture'])
    git(['tag', 'v0.1.0'])
    const options = {
      ...config, dryRun: true, ci: false, repositoryUrl: `file://${directory}`,
      plugins: [[resolve(root, 'node_modules/@semantic-release/commit-analyzer/index.js'), config.plugins[0][1]]]
    }
    const context = { cwd: directory, env: { PATH: process.env.PATH, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' }, stdout: sink, stderr: sink }
    for (const [message, version] of [['fix: correct fixture', '0.1.1'], ['feat: extend fixture', '0.2.0'], ['feat!: change fixture\n\nBREAKING CHANGE: dummy contract changes', '0.3.0']]) {
      git(['commit', '--allow-empty', '-m', message])
      const result = await semanticRelease(options, context)
      expect(result.nextRelease.version).toBe(version)
      expect(git(['tag', '--list', `v${version}`])).toBe('')
      git(['tag', `v${version}`])
    }
    git(['commit', '--allow-empty', '-m', 'docs: explain fixture'])
    expect(await semanticRelease(options, context)).toBe(false)
  } finally { rmSync(directory, { recursive: true, force: true }) }
}, 30000)
