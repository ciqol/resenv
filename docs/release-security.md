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
contents, issues and pull-requests write permissions and OIDC. The issue/PR
permissions support the official GitHub plugin's default comments, labels and
failure issues. There are no npm tokens or additional reviewers. The release
token is exposed only to the release step, and checkout does not persist credentials.

The job consumes compiled output tested by CI, removes its private marker and
runs `npm run release` directly. The official npm plugin changes release metadata,
packs and publishes the prepared directory, whose manifest has no package
lifecycle scripts. The source is not rebuilt. CI owns package-consumer testing;
there is no custom release hook or second test pass in the privileged release job.
The workflow enforces the existing security review deadline before publication.

## Dependency review

Review actual installed artifacts, including npm's bundled dependencies.
Overrides are not evidence that bundled files changed: inspect their manifests
on disk. A failing dependency audit blocks merge and release; it is not a
non-blocking report. Do not broaden exceptions or silently substitute an
unreviewed npm version.

### Temporary npm bundle repair

npm 11.21.1 bundles vulnerable `undici` and `ip-address` files that npm overrides
do not replace. Until an upstream npm release includes the fixes, the reviewed
root `postinstall` hook replaces those two directories with the exact registry
packages `undici@6.29.1` and `ip-address@10.7.5`, installed under development-only
aliases. Their integrity hashes are pinned in the lockfile, which also records
the repaired bundle versions. This is an actual file replacement, not an audit
exception or a metadata-only override.

`npm run audit` first compares every installed bundle file with the corresponding
locked upstream package. Missing, extra or modified files fail the check. The
repair accepts only the reviewed npm and dependency versions and rejects patch
packages with runtime dependencies. It does not fetch code or use credentials.
Registry signatures verify the upstream packages; they do not attest the locally
repaired npm bundle as an npm-maintained distribution.

Remove the hook, repair script/tests, aliases and repaired lock entries together
when upgrading to an npm release containing both fixes. Regenerate the lockfile
and validate a clean install, on-disk versions, audit, signatures and package
checks before removing the repair. The existing review deadline still applies.

Use pinned versions and the lockfile. Validate normal installs, registry
signatures/attestations, the full audit and the package tests. See
[dependencies](dependencies.md) for tool choices. Record dated findings and
per-run evidence in the PR, not in this document.
