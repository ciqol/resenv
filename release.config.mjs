// Preview only while publication and dependency intake remain on hold.
export default {
  branches: [{ name: 'beta', channel: 'beta' }],
  tagFormat: 'v${version}',
  dryRun: true,
  plugins: [
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator'
  ]
}
