# Release-tool security

Maintainer: `titan-ron`. Runtime dependencies have no advisory exceptions.
The executable development policy is [security-exceptions.json](security-exceptions.json).
Its review expires **November 9, 2026 at 00:00 UTC**. This is a project review
deadline, also enforced by the publisher for platform npm; removing unused
development tools does not extend it.

## Release planning

The planner calls the official commit-analysis and release-notes plugins
directly. It reads Git history and published beta tags without GitHub write,
npm or OIDC credentials. The full `semantic-release` engine and its publishing
plugins are unnecessary for this beta-only workflow.

The committed peer-omission policy keeps the engine, `@semantic-release/npm`,
`@semantic-release/github` and their npm module off disk. Before auditing or
planning, `scripts/release-guards.mjs` requires that none resolve from the
project or either selected plugin. Its planner hook also rejects bare and
resolved imports of those tools. An audit explicitly including omitted peers
can still report their locked entries; see [installation policy](dependencies.md).

The guard pins both plugins, micromatch and braces. It replaces every callable
braces export with a throwing guard before loading the plugins. The selected
micromatch matching calls use picomatch; vulnerable brace expansion must never
execute. Version drift fails until the guards are reviewed.

`npm run audit` checks runtime dependencies without exceptions, then the
installed development tree. Moderate/high/critical findings must match an exact
advisory URL, development-only lockfile path, version and unexpired policy
entry. New advisories, changed paths, runtime occurrences and expired
exceptions fail. The retained exception entries do not authorize reinstalling
the excluded tools. Prefer an upstream fix or removing unused dependencies;
never broaden the policy to make a check pass.

## Publishing platform

The privileged publisher installs no release-tool dependencies and accepts only
the archive described by the verified candidate plan. It checks source identity
and hashes before invoking npm. Publication follows the [release runbook](releasing.md).

The platform is pinned to Node.js 24.19.0 and its npm 11.17.0. Platform npm has
separately reviewed bundled-component risks; omitting development peers does
not fix those components. `scripts/publish.mjs` rejects platform version drift
and an expired review, including on a failed-job retry.

The staging command accepts a fixed tarball and HTTPS npm registry, with no
package lifecycle scripts in the generated manifest. It runs with a fresh home,
configuration and cache, strips proxy/token/arbitrary npm configuration, and
uses the protected workflow's OIDC identity. It accepts no login, shell,
selector or arbitrary URL input. Registry and signing services remain trusted
inputs. These controls bound exposure; they do not patch the platform CLI.

The publisher verifies the original CI run/attempt, successful candidate checks,
source ancestry and build-exported hashes. It reserves a private draft without
a Git tag, preserves the tested archive and release plan as durable assets, and
checks those bytes before saving staging intent and invoking npm. Intent is
written before the external call; an ambiguous result must never be restaged.
The receipt is persisted in the draft. Partial asset writes can resume safely.

The finalizer follows managed records, not branch-head artifact searches. Its
only write capabilities are contents and Actions (to dispatch current beta after
a terminal release); it has no OIDC or npm credentials. Public npm integrity,
durable asset hashes, manifest, original successful check evidence and source
ancestry must match before the Git tag and prerelease are recorded. Advancing
beta is allowed; divergent history, asset substitution or conflicting tags fail.
Release assets are data and are never executed. Recording does not mutate npm
channels or depend on their current pointers. The maintainer promotes latest.

One pending draft prevents overlapping stage calls. Snapshot planning considers
all permanent reservations and public npm versions; a fresh reservation check
runs under the shared mutation concurrency group immediately before staging.
Rejected drafts retain their counters. Explicit rejection requires a manual
workflow dispatch and an unpublished version; npm rejection remains a separate
maintainer action. Terminal records retain continuation state for idempotent
queue resumption. The same review expiry remains enforced; durable assets do
not expire with CI artifacts, but do not override the security review deadline.

## Reviewing changes

Review the actual published artifacts, including bundled copies; patching a
standalone package does not establish that npm's bundled copy is fixed.
Recheck platform npm before the deadline and remove obsolete exception entries
when upstream fixes or dependency removal make them unnecessary. Do not extend
the deadline or bypass executable controls to unblock publication.

Run `npm run audit`, `npm audit signatures` and `npm run verify`. Release tooling
specs cover absence/version guards, policy scope and expiry, adversarial commit
analysis, real Git release history and publisher isolation. Keep review evidence
in the PR and CI, and maintain this document as the current policy.
