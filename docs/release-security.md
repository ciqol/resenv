# Release-tool security review

Reviewed October 10, 2026. Owner: `titan-ron`. Scope: semantic-release version
planning in read-only CI. The runtime package has no advisory exceptions.

## Decision and controls

Admit semantic-release 25.0.9, commit-analyzer 13.0.1 and release-notes-generator
14.1.1 as exact development dependencies for version calculation and notes.
Use the bounded exceptions in [security-exceptions.json](security-exceptions.json)
only with the executable controls below. These are engineering risk exceptions,
not upstream fixes or a clean vulnerability scan. They expire November 9, 2026.

The isolated audit reports 10 high and two moderate affected-package entries.
Several entries propagate the same underlying finding to their parent packages.
The final merged installation reports 12 active advisory IDs affecting six distinct packages:

| Package | Reviewed location | Why its affected code cannot execute in the planner |
| --- | --- | --- |
| braces | Development dependency of micromatch | Every callable export is replaced by a throwing guard before loading semantic-release. The selected matching calls delegate to picomatch. |
| brace-expansion | npm's bundled dependency | The unselected npm plugin and its bundled npm module are blocked by a Node resolution hook. |
| http-cache-semantics | npm's bundled dependency | Same blocked npm module. |
| ip-address | npm's bundled dependency | Same blocked npm module. |
| postcss-selector-parser | npm's bundled dependency | Same blocked npm module. |
| undici | npm's bundled dependency | Same blocked npm module. |

The branch expander calls `micromatch(list, branch.name)`. The analyzer calls
`micromatch.isMatch(commitField, ruleField)`. Both functions in micromatch 4.0.8
delegate to picomatch rather than its braces-based parse/expand helpers. Patterns
are the fixed branch `beta` and the analyzer's reviewed default rules; commit
fields and remote branch names are matching subjects. Guarding all braces calls
also prevents a later caller from silently opening the vulnerable path.

Sources: [branch expansion](https://github.com/semantic-release/semantic-release/blob/v25.0.9/lib/branches/expand.js),
[commit matching](https://github.com/semantic-release/commit-analyzer/blob/v13.0.1/lib/analyze-commit.js),
[micromatch matching](https://github.com/micromatch/micromatch/blob/4.0.8/index.js),
[braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).

The guards pin the engine, analyzer, notes generator, micromatch and braces
versions. Changed versions fail until the control is reviewed. The audit checks
each advisory URL, exact affected version and development-only lockfile path.
New findings, runtime occurrences, changed paths and expired reviews fail CI.
Propagated parent findings do not create additional blanket exemptions.
`npm audit --omit=dev --audit-level=high` also runs without exceptions.

The planner receives no GitHub write token, npm credential or OIDC permission.
It runs a dry run against a temporary local mirror, which supplies the engine's
Git write-permission check without permitting external writes. The selected
plugins are fixed in code. The publisher does not install dependencies or import
release tools. It verifies candidate hashes and source identity, publishes the
tested archive through npm OIDC, and records the computed tag/release through
GitHub's API. No custom version-analysis engine is introduced.

## Verification

An isolated test blocked direct braces calls and imports of the unselected npm
and GitHub plugins. Normal and adversarial commit analysis passed with 10,000
nested brace pairs in subjects and bodies. A full semantic-release dry run
passed under the same guards and calculated `1.0.0` on channel `beta`, without
creating tags. The normal release path must keep these assertions in its tests.

An isolated attempt to override npm's bundled vulnerable components did not
replace their distributed copies. No ineffective override was admitted.
Standalone patched releases do not establish that the bundled copy is fixed.
Review and remove these exceptions when the upstream distributions are fixed.

## Dependency admission

- **Need:** automate Conventional Commit analysis and release notes, as selected
  by the user. Platform APIs do not implement that versioning contract.
- **Fit:** retain the selected engine rather than switch to release-please or
  maintain a custom analyzer. Native publication glue preserves the tested
  archive instead of letting a package-directory plugin repack it.
- **Health:** registry review recorded monthly downloads of 12,515,497 for the
  engine, 12,542,138 for the analyzer and 12,802,125 for the notes generator,
  with three listed maintainers each. Selected release dates are August 5, 2026;
  January 3, 2025; and May 8, 2026. The older analyzer remains the component
  required by the current engine. Maintenance evidence is not a security guarantee.
- **Trust:** the canonical semantic-release repositories match the distributed
  modules. The isolated installation verified 447 registry signatures and 121
  provenance attestations; the final merged installation verified 606 signatures
  and 186 attestations. Registry metadata does not expose individual MFA or
  independently prove historical ownership continuity; those limits remain.
- **License:** the three direct artifacts contain MIT license text. The isolated
  tree's licenses are MIT, ISC, BSD-2-Clause, BSD-3-Clause, Apache-2.0, BlueOak-1.0.0,
  Python-2.0, Artistic-2.0, CC-BY-3.0, CC0-1.0 and permissive alternative sets.
  qrcode-terminal's absent SPDX metadata is resolved by its Apache-2.0 LICENSE.
  Some artifacts express the license in package metadata rather than a separate
  license file. No reciprocal source-disclosure license was identified. These
  development modules are excluded from the consumer package.
- **Capabilities:** filesystem, subprocess and Git access are required for local
  history analysis. The selected plugin path does not publish, contact npm or
  post GitHub comments. The isolated tree contains no install lifecycle hooks.
- **Control:** exact direct versions and the lockfile pin the tree; CODEOWNERS
  and Dependabot retain ownership and update visibility. The guards and expiring
  audit policy fail on drift. Removal means deleting the three development
  dependencies and disabling release planning/publication; local build and
  consumer verification remain available.

The audit result must remain visible. Do not describe the release-tool tree as
vulnerability-free, use an audit-wide ignore, or pass it to a privileged job.

## Publishing platform

The publisher uses the npm CLI shipped with the pinned Node.js 24.19.0 runtime
(npm 11.17.0). That platform CLI also bundles older components affected by
advisories. npm 12.2.0 was inspected and still distributes affected versions;
upgrading to it would not remove this risk. The development-only policy does
not imply that the platform CLI is vulnerability-free.

The publication path accepts only the validated archive, with no lifecycle
scripts in its manifest. It uses a fresh home, configuration and cache, fixes
the registry to HTTPS npmjs.org, and strips proxy, token and arbitrary npm
configuration from the child environment. No package-query, login, shell,
selector or arbitrary URL input is accepted. OIDC is supplied by GitHub for the
specific repository, workflow and protected environment. Registry and signing
services remain trusted inputs. This bounds exposure; it is not an upstream
fix. The publisher checks the policy expiry again when it runs, including on a
failed-job retry, and rejects platform version drift. Review the platform CLI
again before November 9 alongside this policy.
