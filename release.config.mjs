export default {
  branches: ['main'],
  tagFormat: 'v${version}',
  plugins: [
    ['@semantic-release/commit-analyzer', { releaseRules: [{ breaking: true, release: 'minor' }] }],
    '@semantic-release/release-notes-generator',
    ['@semantic-release/npm', { pkgRoot: 'dist', tarballDir: 'release' }],
    './scripts/verify-release.mjs',
    ['@semantic-release/github', {
      assets: 'release/*.tgz',
      successCommentCondition: false,
      failCommentCondition: false,
      releasedLabels: false
    }]
  ]
}
