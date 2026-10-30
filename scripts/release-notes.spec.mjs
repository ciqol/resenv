import { expect, it } from 'vitest'
import { generateNotes } from '@semantic-release/release-notes-generator'
import config from '../release.config.mjs'

it('renders change summaries and PR references without attribution or commit links', async () => {
  const [, options] = config.plugins.find(plugin => Array.isArray(plugin) && plugin[0] === '@semantic-release/release-notes-generator')
  const notes = await generateNotes(options, {
    cwd: process.cwd(),
    options: { repositoryUrl: 'https://github.com/ciqol/resenv.git' },
    lastRelease: { gitTag: 'v0.1.0' },
    nextRelease: { version: '0.2.0', gitTag: 'v0.2.0' },
    commits: [
      { hash: 'a'.repeat(40), message: 'fix(cli): preserve whitespace (#42)', author: { name: 'Example Contributor', login: 'example-contributor' } },
      { hash: 'b'.repeat(40), message: 'feat(api): simplify options (#43)\n\nBREAKING CHANGE: Rename the legacy option.', author: { name: 'Another Contributor', login: 'another-contributor' } }
    ]
  })
  expect(notes).toContain('## Changes')
  expect(notes).toContain('**cli:** preserve whitespace ([#42](https://github.com/ciqol/resenv/issues/42))')
  expect(notes).toContain('**api:** simplify options ([#43](https://github.com/ciqol/resenv/issues/43))')
  expect(notes).toContain('Rename the legacy option.')
  expect(notes).not.toMatch(/contributor|author|\/commit\/|\/compare\/|aaaaaaa|bbbbbbb/i)
})
