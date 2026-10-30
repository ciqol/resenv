# Releases

**Merge the PR to `main`; CI publishes the release.** There is no separate
approval button, npm staging queue or Finalize job. Manual workflow dispatch
runs checks only. The default branch requires a PR, current passing checks,
resolved review threads and squash merging, with no bypass actors. The sole
maintainer approves by merging; no second reviewer is required.

## Normal flow

CI audits dependencies, checks signatures, lint, types and coverage, builds
once, and tests the packed build across Linux Node 20/22/24 and macOS Node 24.
After a merge, the protected release job downloads that build, removes its
private marker and calls `npm run release` (`semantic-release`). The official
plugins analyze commits, generate notes, version and publish the package to npm
`latest`, and create the GitHub release with its archive attached. The source
is not rebuilt and package-consumer tests stay in CI.

Use the official plugin defaults for release notes, success comments, failure
issues and released labels. The release job grants the documented `contents`,
`issues` and `pull-requests` write permissions, plus OIDC for npm. Write
permissions remain scoped to that job.

Conventional Commits determine releases: fixes and performance changes bump
patch, features bump minor, and breaking changes bump minor while the package
remains below 1.0. The breaking-change rule is the explicit project policy;
otherwise the official plugin behavior is unchanged. Docs and maintenance
commits alone do not trigger a release. Squash PR titles must follow that
convention. `0.x.x` denotes initial development, not a SemVer prerelease.

The published `v0.1.0` tag is the real baseline. The one-time bootstrap is
complete and its code has been removed. Preserve release tags and full checkout
history so semantic-release can determine the next version. Historical beta
versions remain available; this flow does not update the `beta` channel.

## Setup

- Default/release branch: `main`, protected by PRs and the actual CI/CodeQL checks.
- npm trusted publisher: `ciqol/resenv`, `ci.yml`, environment `release`, with
  **direct publish** permission. Stage-only permission cannot run this flow.
- GitHub environment `release`: allow only `main`, with no required reviewers.
- `RELEASE_ENABLED=true` only after protection, the npm publisher and dependency
  audit are verified. The maintainer manages the npm setting.

On npmjs.com, open **@ciqol/resenv → Settings → Trusted publishing** and
configure its GitHub Actions publisher with these exact values:

| Field | Value |
| --- | --- |
| Organization or user | `ciqol` |
| Repository | `resenv` |
| Workflow filename | `ci.yml` (filename only) |
| Environment name | `release` |
| Allow npm publish | Enabled |
| Allow npm dist-tag | Not needed for this single-branch release flow |

Save the configuration and complete npm's confirmation if prompted. Staging is
always allowed; enabling direct publishing is the required change. The branch
restriction lives in GitHub's `release` environment, which already allows only
`main`. Keep account 2FA and the existing token restrictions; no npm token is
needed. See [npm's trusted-publishing guide](https://docs.npmjs.com/trusted-publishers/).

Never publish from a developer machine, configure a permanent npm publishing
token, or request local npm login. Local `npm run release:check` is read-only
with respect to publication. Only an enabled main push can enter the protected release job. A merge does not waive a failing audit or the security review expiry.

## Failures

Inspect the failed run, npm version and GitHub tag before retrying. The standard
engine creates its tag before calling publishers; a failed publication may
therefore leave a tag or partial release. Rerunning is not a general repair for
that state. Recover the intended version using its original source and archive
after maintainer review; do not retag different code or silently replace a
published version.

No workflow automatically deletes tags, releases or npm versions. Existing
beta versions without matching GitHub releases need separate recovery from
their original evidence. See [release security](release-security.md).
