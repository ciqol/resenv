export default {
  branches: ['main'],
  plugins: [
    ['@semantic-release/commit-analyzer', { releaseRules: [{ breaking: true, release: 'minor' }] }],
    '@semantic-release/release-notes-generator',
    ['@semantic-release/npm', { pkgRoot: 'dist' }],
    '@semantic-release/github'
  ]
}
