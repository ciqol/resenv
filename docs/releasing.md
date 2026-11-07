# Releases

Merge an eligible PR to protected `main` to approve publication. PRs and manual
workflow dispatches run checks only. The sole maintainer approves by merge; no
second reviewer is required. Keep the package on npm `latest` as regular `0.x.x`
versions until a reviewed 1.0 transition.

## Versioning and publication

[semantic-release](https://github.com/semantic-release/semantic-release) uses
Conventional Commits: fixes and performance changes bump patch, features bump
minor, and breaking changes bump minor during 0.x development. Docs and
maintenance commits alone do not release. Use a matching squash PR title.
Keep `v0.1.0` as the baseline and preserve release tags and full Git history.
Historical beta versions remain available; this flow does not update `beta`.

CI builds one private archive and tests it across the
[runtime matrix](../CONTRIBUTING.md#build-and-ci). After checks pass, the release
job extracts that build, removes its private marker and runs `npm run release`.
The official npm plugin updates metadata and repacks without recompiling; the
final archive differs from the tested candidate. Consumer tests run before
release preparation, with no second pass in the privileged job.

Use the official plugin defaults for release notes, comments, labels and failure
issues. GitHub releases contain change notes; npm carries the package and its
source revision's README. Do not attach another npm archive to GitHub releases.
The development root and ordinary builds stay private.

## Required setup

| Setting | Required value |
| --- | --- |
| Default and sole release branch | `main` |
| Branch rules | PR, current CI/CodeQL checks, resolved threads, squash merge, no bypass |
| GitHub environment | `release`, restricted to `main`, no required reviewers |
| npm trusted publisher | `ciqol/resenv`, workflow `ci.yml`, environment `release` |
| npm publisher permission | Direct publish enabled; dist-tag permission is unnecessary |
| Repository variable | `RELEASE_ENABLED=true` only after protection, npm setup and audit review |

The maintainer configures npm under **@ciqol/resenv → Settings → Trusted
publishing** and completes its confirmation. Keep account 2FA and token
restrictions. See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/).
Never publish locally, configure npm tokens or run local npm login.
`npm run release:check` verifies locally without publishing or tagging.

Publishing authority is scoped to the main-push release job after CI, smoke and
coverage pass. Checkout does not persist credentials; the release step receives
the GitHub token. Job permissions provide contents, issues and pull-requests
writes for the official plugins, plus OIDC for npm. Merge is the maintainer's
approval; it does not waive audit or review requirements.

## Security review

- `npm run audit` blocks runtime findings at moderate severity or above.
  Package checks enforce zero runtime dependencies and exclude development
  tools, lifecycle scripts and bundled dependencies from the consumer archive.
- `npm run audit:tooling` reports every severity in CI logs and its summary.
  Findings do not fail solely on severity; registry or command errors do fail.
  A successful report is not a clean audit. Registry signatures, lint, types,
  coverage and package checks remain required.
- Before merge, review changed findings and Dependabot alerts against actual
  call paths, input trust, credentials and generated artifacts. Block unresolved
  credential or artifact-integrity risks; investigate uncertain reachability.
  Bounded availability risks may be accepted with evidence.
- Record acceptance in the PR: advisories, affected versions, reachability,
  residual risk, owner, upstream remediation and re-review triggers. The
  maintainer approves by merge. Acceptance does not fix a vulnerability.
- Re-review when dependencies, build scripts, input trust, registry/proxy settings
  or publishing behavior change. Keep dated findings in PRs or CI.

Maintainer `titan-ron` owns review and remediation. Use exact versions and the
lockfile, normal lifecycle behavior and unchanged upstream artifacts. Inspect
npm's actual bundled components on upgrades; never patch installed dependencies
or conceal findings. See the
[dependency policy](../CONTRIBUTING.md#dependencies) for update checks.

## Failure recovery

Inspect the failed run, npm version and GitHub tag before retrying. The engine
tags before publishing, so failure may leave a tag or partial release; rerunning
is not a general repair. Recover the intended version from its original source
and archive after maintainer review. Do not retag different code or replace a
published version. Historical beta releases without matching GitHub releases
need their original evidence for recovery.

No workflow deletes tags, releases or npm versions. Removing obsolete npm
versions requires explicit authorization; never unpublish the entire package.
