import { expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

it('plans the first release, no change, and the next beta from real history without touching source refs', () => {
  const root = process.cwd()
  const temporary = mkdtempSync(join(tmpdir(), 'resenv-plan-spec-'))
  const checkout = join(temporary, 'checkout')
  const env = { PATH: process.env.PATH, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' }
  const run = (command, args, cwd = checkout) => execFileSync(command, args, { cwd, env, encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  const before = run('git', ['show-ref'], root)
  try {
    run('git', ['clone', '--no-hardlinks', '--no-tags', root, checkout], root)
    const calculate = (directory, snapshot) => {
      const args = [join(root, 'scripts/release-plan.mjs'), join(temporary, directory)]
      if (snapshot) {
        const path = join(temporary, `${directory}-state.json`)
        writeFileSync(path, JSON.stringify(snapshot))
        args.push(path)
      }
      run(process.execPath, args)
      return JSON.parse(readFileSync(join(temporary, directory, 'release.json'), 'utf8'))
    }
    run('git', ['tag', 'v1.0.0'])
    const first = calculate('first')
    expect(first.publish).toBe(true)
    expect(first.channel).toBe('beta')
    expect(first.version).toBe('0.1.0-beta.1')
    expect(calculate('reserved', ['v0.1.0-beta.2', '0.1.0-beta.3']).version).toBe('0.1.0-beta.4')
    expect(() => calculate('invalid-reservation', { invalid: true })).toThrow()
    expect(run('git', ['tag'])).toBe('v1.0.0')
    // Tags exist only in this disposable fixture; no synthetic commits or identities.
    run('git', ['tag', first.gitTag])
    expect(calculate('unchanged').publish).toBe(false)
    run('git', ['tag', '-d', first.gitTag])
    const base = run('git', ['rev-list', '--max-parents=0', 'HEAD'])
    run('git', ['tag', first.gitTag, base])
    expect(calculate('later').version).toBe('0.1.0-beta.2')
    run('git', ['tag', 'v0.1.0-beta.01'])
    expect(() => calculate('malformed')).toThrow()
    run('git', ['tag', '-d', 'v0.1.0-beta.01'])
    const documentation = run('git', ['log', '-1', '--format=%H', '--grep=^docs'])
    run('git', ['checkout', '--detach', documentation])
    run('git', ['tag', '-f', first.gitTag, `${documentation}^`])
    expect(calculate('docs-only').publish).toBe(false)
    expect(run('git', ['show-ref'], root)).toBe(before)
  } finally { rmSync(temporary, { recursive: true, force: true }) }
}, 90000)
