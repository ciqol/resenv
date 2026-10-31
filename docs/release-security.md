# Release-tool security

Maintainer: `titan-ron`. Separate what reaches library consumers from what runs
in development and publishing. A `devDependency` can still affect credentials or
the build, so scope alone is not a security assessment.

## CI policy

- `npm run audit` runs `npm audit --omit=dev --audit-level=moderate` and blocks CI
  for runtime findings at moderate severity or above. Package-consumer checks
  independently enforce the current zero-runtime-dependency contract and reject
  development tools, lifecycle scripts and bundled dependencies in the archive.
- `npm run audit:tooling` runs the full audit with `--include=dev --audit-level=none`.
  It reports all severities in CI logs and the job summary without failing solely
  on findings. Registry/network/command errors still fail the step; this is not
  `continue-on-error` or `|| true`. A successful report is not a clean audit.
- Registry signature verification, lint, types, coverage, integration tests and
  packed-package checks remain required. Dependabot checks for updates weekly;
  security alerts provide ongoing advisory visibility between CI runs.

## Development and release-tool review

Before merging, inspect new or changed findings in the full report and Dependabot
alerts. Review the advisory's preconditions, actual call path, attacker-controlled
input, credential access and possible effect on generated files. Prioritize
reachable vulnerabilities and available upstream fixes; do not infer safety from
the `devDependency` label or severity alone.

Block publication for an unresolved finding that can compromise credentials,
artifact integrity or the publishing boundary. Availability-only findings may be
accepted when their exposure and operational impact are understood and bounded.
Treat uncertain reachability as requiring investigation before accepting it.

Record each acceptance in the PR with advisory links, affected versions, evidence,
residual risk, owner, upstream remediation and a re-review deadline. The maintainer
reviews that evidence as part of PR approval by merge. Acceptance is not a fix.
Re-review when dependencies, build scripts, input trust, registry/proxy settings
or publishing behavior change; do not carry an assessment across changed conditions.

The current [review deadline](security-review.json) remains **November 9, 2026 at
00:00 UTC**, enforced before publication. Updating it requires a new documented
review; never extend it merely to make a release pass. Detailed dated findings
belong in the PR or CI, not an accumulating repository audit log.

Use published upstream packages unchanged, exact direct versions and the lockfile.
Inspect npm's actual bundled files when upgrading it. Do not replace bundle files,
rewrite lock metadata to conceal findings, or add custom postinstall repairs.
Validate normal clean installs, signatures, both audit commands and package checks.

## Publishing authority

PR merge is approval. Branch rules require the real CI/CodeQL checks and prevent
direct pushes, force pushes, deletion and bypass. PRs and manual dispatches cannot
publish. Only main pushes may enter the `release` environment, with contents,
issues and pull-requests write permissions and OIDC. The issue/PR permissions
support the official GitHub plugin's default comments, labels and failure issues.
There are no npm tokens or additional reviewers. The release token is exposed
only to the release step, and checkout does not persist credentials.

The release job consumes compiled output tested by CI, removes its private marker
and runs `npm run release` directly. The official npm plugin changes metadata,
packs and publishes the prepared directory, whose manifest has no lifecycle
scripts. The source is not rebuilt. CI owns package-consumer testing; there is
no custom release hook or second test pass in the privileged release job.

Standard semantic-release and its official plugins are installed and reported
normally. None of these tools ships to consumers. See [dependencies](dependencies.md)
for tool choices and [releasing](releasing.md) for publication and recovery.
