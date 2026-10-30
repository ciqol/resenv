# Release-tool security

Maintainer: `titan-ron`. The complete installed tree must pass
`npm audit --audit-level=moderate`; there are no advisory exceptions. The
[review deadline](security-exceptions.json) remains **November 9, 2026 at
00:00 UTC** and is enforced before publication. Do not extend it or suppress
findings to unblock a release.

Standard semantic-release and the official npm/GitHub plugins replace the
standalone planner and staging controller. Their dependencies are now installed
and audited normally. The old peer-omission and module-blocking policy no longer
applies to tools explicitly selected for this pipeline. No release tool ships
to package consumers.

## Publishing authority

PR merge is approval. Branch rules require the real CI/CodeQL checks and prevent
direct pushes, force pushes, deletion and bypass. PRs and manual dispatches
cannot publish. Only main pushes may enter the `release` environment, with
contents write and OIDC permissions. There are no npm tokens or additional
reviewers. The release token is exposed only to the release step, and checkout
does not persist credentials.

The job consumes compiled output tested by CI. The npm plugin changes release
metadata and packs it; the verification hook tests the final package. Publishing
uses the prepared directory, whose manifest has no package lifecycle scripts.
The source is not rebuilt. The bootstrap publishes its checked tarball directly.
GitHub issue/PR comments and labels are disabled in the GitHub plugin so it
needs no issue or pull-request write permission.

## Dependency review

Review actual installed artifacts, including npm's bundled dependencies.
Overrides are not evidence that bundled files changed: inspect their manifests
on disk. A failing dependency audit blocks merge and release; it is not a
non-blocking report. Do not broaden exceptions or silently substitute an
unreviewed npm version.

Use pinned versions and the lockfile. Validate normal installs, registry
signatures/attestations, the full audit and the package tests. See
[dependencies](dependencies.md) for tool choices. Record dated findings and
per-run evidence in the PR, not in this document.
