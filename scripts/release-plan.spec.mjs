import { expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

it('plans the first release, no change, and a later major from real history without touching source refs', () => {
  const root = process.cwd()
  const temporary = mkdtempSync(join(tmpdir(), 'resenv-plan-spec-'))
  const checkout = join(temporary, 'checkout')
  const env = { PATH: process.env.PATH, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' }
  const run = (command, args, cwd = checkout) => execFileSync(command, args, { cwd, env, encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  const before = run('git', ['show-ref'], root)
  try {
    run('git', ['clone', '--no-hardlinks', '--no-tags', root, checkout], root)
    const calculate = directory => {
      run(process.execPath, [join(root, 'scripts/release-plan.mjs'), join(temporary, directory)])
      return JSON.parse(readFileSync(join(temporary, directory, 'release.json'), 'utf8'))
    }
    const first = calculate('first')
    expect(first.publish).toBe(true)
    expect(first.channel).toBe('beta')
    expect(first.version).toBe('1.0.0')
    expect(run('git', ['tag'])).toBe('')
    // Tags exist only in this disposable fixture; no synthetic commits or identities.
    run('git', ['tag', first.gitTag])
    expect(calculate('unchanged').publish).toBe(false)
    run('git', ['tag', '-d', first.gitTag])
    const base = run('git', ['rev-list', '--max-parents=0', 'HEAD'])
    run('git', ['tag', first.gitTag, base])
    expect(calculate('later').version).toBe('2.0.0')
    expect(run('git', ['show-ref'], root)).toBe(before)
  } finally { rmSync(temporary, { recursive: true, force: true }) }
}, 90000)
