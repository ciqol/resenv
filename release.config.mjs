// This engine plans releases only. CI publishes the tested archive separately.
export default {
  branches: [{ name: 'beta', channel: 'beta' }],
  tagFormat: 'v${version}',
  dryRun: true,
  plugins: [
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator'
  ]
}
