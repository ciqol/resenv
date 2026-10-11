// The initial beta line stays explicit; release tags supply its next counter.
export const betaBase = '0.1.0'

export default {
  branches: [{ name: 'beta', channel: 'beta', prerelease: 'beta' }],
  tagFormat: 'v${version}',
  dryRun: true,
  plugins: [
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator'
  ]
}
