# Dependency review

## Official GitHub actions — 2026-10-13

At the maintainer's explicit request, official `actions/*` and `github/*`
actions use exact release tags under Tashtit's official-publisher exception.
Current versions: checkout 6.1.0, setup-node 6.5.0, upload-artifact 7.0.1,
download-artifact 8.0.1 and upload-code-coverage 1.4.4. Earlier commit references
below record reviewed source; they are not the executable pin policy.

The requested [coverage action](https://github.com/actions/upload-code-coverage/tree/v1.4.4)
follows the reference client and replaces custom API upload code. It uses Bash,
Python's standard library and GitHub CLI, without an installation or npm tree.
Its isolated job reads the Cobertura artifact, writes GitHub coverage and status
telemetry, and receives no provider credentials, npm identity or project code.
The 90% local floor remains independent of reporting. Maintainers can remove
the upload job and disable Code Quality to return to artifact-only reporting.

The exact tag resolved to GitHub-verified commit
`2b21a77928be8d5168c2b9581a67f2adbebacc52`, released October 1, 2026. Upstream
showed 102 stars, 21 forks, ten open issues and no published security advisories.
The tagged source contains no LICENSE or declared SPDX license; the API returns
`license: null`. Apply the user's explicit selection of this official action
without claiming MIT licensing or independent license clearance. Nothing from
the action is redistributed in the package. ciqol maintainers own version and
advisory review through Dependabot; exact tags still trust GitHub against retagging.

Native Linux checks use Ubuntu's `libsecret-tools`, `gnome-keyring` and D-Bus
packages only on a disposable hosted runner. No runtime dependency is added;
the temporary keyring contains dummy tokens and is deleted after the check.

## Release tools admitted with bounded controls - 2026-10-10

The current release pipeline and launch state are documented in [releasing](releasing.md).
The release-tool review and expiring advisory policy are in [release security](release-security.md).
Earlier dated entries below remain historical evidence and are superseded where
the current release guide describes a different state.


Entries record decisions at the stated dates. Older version plans and install
policies are historical; the release guide and CONTRIBUTING describe the current
workflow. Release-tool intake below is not dependency admission.

## Semantic-release intake, not installed - 2026-10-08

The user selected semantic-release for beta releases. The existing toolchain
has no commit-derived release engine; adding one is justified for versions,
release notes and branch/channel handling. Release-please was considered for
0.x support, and a custom engine was rejected as unnecessary maintenance.
Semantic-release's normal initial line is 1.0.0-beta.1 / 1.0.0. The checked-in
configuration is a preview draft; no release dependencies or workflow are enabled.

Registry intake inspected these exact published artifacts:

| Package | Version | Release date | Downloads in the last month | Maintainers |
| --- | --- | --- | --- | --- |
| semantic-release | 25.0.9 | 2026-08-05 | 12,515,497 | 3 |
| @semantic-release/commit-analyzer | 13.0.1 | 2025-01-03 | 12,542,138 | 3 |
| @semantic-release/release-notes-generator | 14.1.1 | 2026-05-08 | 12,802,125 | 3 |

All three artifacts include MIT license text, match their canonical source
repositories in the [semantic-release organization](https://github.com/semantic-release),
contain no install lifecycle scripts, and expose registry integrity, signatures
and provenance attestations. The release engine requires Node ^22.14.0 or
>=24.10.0; the repository's Node 24.19.0 qualifies. The initial lock-only review
stopped at audit; the isolated follow-up verification is recorded below.
MFA and historical ownership continuity were not independently verified.
The analyzer is an older stable component still required by the current engine;
that alone does not establish its continued maintenance or security.

A separate temporary lock-only project resolved 447 package entries, with no
`hasInstallScript` entries. Its audit reported 10 high and two moderate findings,
including propagated parent-package findings. The tree also needs complete
license review; one bundled qrcode-terminal entry lacks license metadata.
No install scripts or release tooling code were executed during the initial
lock-only intake.

The blocking dependency is `braces@3.0.3`, through `micromatch`, with the
[high-severity stack-exhaustion advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
The registry's latest braces release is 3.0.3 and the advisory lists no patched
version. Other findings include brace-expansion, http-cache-semantics, undici,
ip-address and postcss-selector-parser. They do not remove the braces blocker.
A normal install of this set would fail the repository's required high-severity
audit. No audit exception, blanket override, unsupported downgrade or lockfile
change was applied.

### Follow-up verification for the requested beta

The user authorized a beta release on October 8. The tooling was installed only
in a temporary intake directory, using the inspected lockfile and normal npm
lifecycle behavior. No install lifecycle hooks were found in the installed tree.
`npm audit signatures` verified 447 registry signatures and 121 attestations.
The bundled qrcode-terminal artifact, whose metadata omitted a license, includes
Apache-2.0 license text. Complete transitive license review and dependency
admission remain unfinished; these checks do not approve the vulnerable tree.

A separate temporary clone of the repository history used a local bare Git
remote, `dryRun: true`, no publishing plugins, and an environment without
registry or GitHub credentials. The real semantic-release engine and commit
analyzer calculated `1.0.0-beta.1`, channel `beta`, from the 22 commits through
`a461ce49903d620ced4c18ce1a90157b46591fc6`. The release-notes generator was then
called separately with the canonical repository URL. No tag was created, even
in the temporary remote. This verifies version calculation, not hosted release
authentication, stable promotion, or publication.

The braces advisory affects recursive parsing of deeply nested **patterns**.
In the inspected upstream branch expansion, the pattern is `branch.name` from
release configuration; remote branch names are subjects. In commit analysis,
patterns come from release rules, while commit fields are subjects. The current
draft uses fixed literal branch names and the analyzer's default rules. This
suggests narrower exposure than accepting arbitrary user-supplied patterns,
but it is not a complete reachability audit of the transitive tree. Other
advisories remain as well. No exception has been approved or applied, and the
repository's required high-severity audit is unchanged. The beta prerelease of
semantic-release also retains micromatch, so switching to it does not remove
this blocker.

Sources: [branch expansion](https://github.com/semantic-release/semantic-release/blob/v25.0.9/lib/branches/expand.js),
[commit matching](https://github.com/semantic-release/commit-analyzer/blob/v13.0.1/lib/analyze-commit.js),
[default rules](https://github.com/semantic-release/commit-analyzer/blob/v13.0.1/lib/default-release-rules.js).

After an acceptable upstream fix or an explicitly reviewed alternative,
re-run intake and pin exact direct versions plus the lockfile. Keep these tools
in development dependencies, preserve the five-package runtime closure, and
verify registry signatures/provenance, licenses, install hooks, audits and a
real dry run before enabling them. CODEOWNERS remains responsible for review;
Dependabot can maintain admitted versions. Removing the release configuration
and dev tooling would restore the existing manual candidate checks if the tool
must later be replaced. The requested beta publication is authorized, but still
needs dependency admission and registry setup. The project license was selected
as MIT on October 8, 2026, with copyright held by ciqol contributors.

### Reference comparison and audit refresh - 2026-10-08

The reference `ciqol/sonarqube-api-client` uses the same semantic-release engine
and analyzer family, plus npm and GitHub plugins. Reusing its configuration
does not establish admission of that tree. A fresh registry audit of the existing
isolated intake lockfile still reported 10 high and two moderate findings,
including `braces@3.0.3` through micromatch. No release dependency was added,
no dependency version changed and the audit gate remains enforced. The selected
normal release branch is now `beta`, with npm channel `beta`; this branch change
does not change the dependency findings. See [the reference comparison](releasing.md#reference-sonarqube-api-client).


## Installation policy - 2026-10-07

At the user's request, standard setup, CI and clean-consumer checks use normal
npm lifecycle behavior. The root `.npmrc` no longer disables scripts, and pack
commands do not suppress lifecycle hooks. No dependency version or integrity
entry changed as part of this policy update.

The installed Node 24/macOS tree was inspected for `preinstall`, `install` and
`postinstall` scripts and implicit `binding.gyp` builds; none were present. The
lockfile marks optional `fsevents@2.3.3` with `hasInstallScript`, but its installed
artifact declares no such script and contains no `binding.gyp`. Platform-specific
behavior still requires the hosted Linux/macOS clean-install checks. A fresh
local install on npm 11.17.0 completed and warned that the lockfile's optional
fsevents entry is not covered by an `allowScripts` decision; no approval or
blanket script override was added.

Review scripts and native setup whenever dependencies change. A lockfile pins
dependency bytes but does not make executing their code safe. Explicit build,
advisory, signature and package checks remain part of validation. Older entries
below describe the installation policy used at the time of those reviews.

## Vitest unit runner - 2026-10-07

The user requested Vitest with unit specs beside each source module. Added
`vitest` and `@vitest/coverage-v8`, both exactly 4.1.11, as development-only
dependencies. Both distributed licenses are MIT; the runner's bundled notices
also cover BSD-3-Clause and ISC code. The isolated tree contains MIT, ISC,
BSD-3-Clause, Apache-2.0 and MPL-2.0 packages. MPL applies to unmodified
Lightning CSS development binaries; none of this tooling is redistributed
in resenv's archive. Existing runtime dependencies are unchanged.

- **Need and fit:** Node's test runner remains suitable for process tests but
  cannot run the requested TypeScript specs and Vitest mocks directly. Keeping
  Node alone or using Jest were alternatives; Vitest matches the requested
  workflow without adding a second TypeScript transform configuration.
  Version 4.1.11 retains Node 20 support, while Vitest 5 requires Node 22.12+.
  The resolved Vite 8.3.3 requires Node 20.19+ or 22.12+, covered by the actual
  test matrix and Node 24 development runtime.
- **Health:** npm reported 454,419,379 Vitest downloads and 167,168,819 coverage
  provider downloads for September 5 through October 4, 2026. Vitest has five
  registry maintainers. Public repository metadata showed 17,188 stars,
  357 open issues/PRs and a push on October 6. Version 4.1.11 was released on
  August 18; Vitest 5.0.3 was released September 30. Published security reports
  have patched-version ranges; 4.1.11 fixes the redirect-mock advisory
  GHSA-82fw-gwwq-j7x9. Browser/UI packages are not installed or enabled.
- **Provenance:** package metadata points to the canonical vitest-dev/vitest
  source, and both artifacts declare provenance attestations. The isolated
  installation verified 64 registry signatures and 31 attestations. npm
  integrity pins authenticate archive bytes; account MFA and complete ownership
  history are not exposed by this review.
- **Security and capabilities:** the isolated tree reported zero known
  vulnerabilities. Installation disables scripts, including the optional
  fsevents hook. Tests execute local code with filesystem/process permissions;
  no real credentials are supplied. The runner uses Node mode with API and
  browser servers disabled. Native transform binaries are development tooling.
  The lock contains 88 dependency entries including platform-specific packages;
  64 were installed on this machine. This is a larger development tree than
  the previous Node-only runner and is accepted for the requested testing setup.
- **Control:** the maintainer's request authorizes this addition. Exact direct
  versions and lockfile integrity pin the tree. ciqol maintainers own updates
  through the existing dependency review process and advisory checks. Removal
  means returning unit specs to Node's runner with an explicit TypeScript
  compilation step. Clean-consumer checks ensure this tooling is not shipped.

Sources: [Vitest 4 requirements](https://v4.vitest.dev/guide/),
[registry metadata](https://www.npmjs.com/package/vitest/v/4.1.11),
[coverage provider](https://www.npmjs.com/package/@vitest/coverage-v8/v/4.1.11),
and [redirect-mock fix](https://github.com/vitest-dev/vitest/security/advisories/GHSA-82fw-gwwq-j7x9).

## TypeScript implementation build - 2026-10-06

The requested migration needs compiler integration and Node API declarations.
These additions are development dependencies only:

| Package | Version | Distributed license | Purpose |
| --- | --- | --- | --- |
| @rollup/plugin-typescript | 12.3.0 | MIT | Compile TypeScript and emit declarations through Rollup |
| @types/node | 24.19.1 | MIT | Type-check Node APIs against the development runtime |
| tslib | 2.8.1 | 0BSD | Required peer of the TypeScript plugin |

- **Need and alternatives:** the existing compiler can emit JavaScript before
  Rollup, but the requested library-build standard uses Rollup's maintained
  TypeScript plugin. This avoids a custom transpilation plugin. Handwritten
  Node declarations would be incomplete. A declaration bundler was considered;
  generated declaration files with format-specific entry facades need no extra
  bundler. `rollup-plugin-dts` was inspected but is not installed.
- **Fit:** the plugin supports Rollup 4 and TypeScript >=3.7; all tools fit the
  Node 24 development environment. Production remains Node >=20 and is tested
  separately. The compiler target uses native language features, so tslib must
  not be imported by or bundled into the distributable. Package checks enforce
  that build dependencies stay outside the consumer tree.
- **Usage and health:** npm reported 13,833,923 plugin downloads, 1,776,524,012
  tslib downloads and 1,843,836,518 Node-types downloads for September 5 through
  October 4, 2026. Releases are dated 2025-10-23, 2024-10-31 and 2026-10-01.
  The plugin has four registry maintainers, tslib eight, and Node types use
  DefinitelyTyped's shared publisher. Their source projects have active issue
  and contribution histories. The older tslib release is accepted as a stable
  compiler helper peer; the chosen target requires no emitted helper imports.
- **Provenance:** all three archives matched npm SHA-512 metadata. The official
  plugin release points to `973054d`; tslib metadata identifies source commit
  `d72d6f70b36286bc3f94a3dda1e64dcb568b1370`. Node types identify the canonical
  DefinitelyTyped source directory. The isolated tree verified 19 registry
  signatures and four attestations. These checks authenticate registry
  artifacts; they do not establish reproducible builds for every addition.
  Public metadata does not establish account MFA or complete transfer history.
- **Licenses and capabilities:** licenses were read from the downloaded
  archives. The plugin runs compiler code with local build permissions; Node
  types are declarations. Neither needs provider credentials. Installation
  disables lifecycle scripts. No new component is vendored into runtime output.
  The isolated tree's audit found zero known vulnerabilities; advisory checks
  are not an independent code audit.
- **Weight and control:** the isolated tree has 19 installed packages including
  the already-reviewed compiler and Rollup. Direct unpacked sizes are about
  160 KB, 2.61 MB and 90 KB respectively. Exact versions and lockfile integrity
  fix the tree. ciqol maintainers own updates through the existing dependency
  review process. Removal means returning to compiler emit before Rollup while
  retaining strict implementation and packed-consumer checks.

Sources: [Rollup plugin and requirements](https://github.com/rollup/plugins/tree/master/packages/typescript),
[plugin release](https://github.com/rollup/plugins/releases/tag/typescript-v12.3.0),
[tslib release](https://github.com/microsoft/tslib/releases/tag/v2.8.1),
[Node types source](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/node).

## Lint enforcement - 2026-10-06

Selected for the requested TypeScript standards review. These are development
tools; neither is included in the generated package or loaded at runtime.

| Package | Pinned version | Distributed license | Purpose |
| --- | --- | --- | --- |
| eslint | 10.12.0 | MIT | Enforce JavaScript correctness and local style rules |
| typescript-eslint | 8.71.1 | MIT | Parse declarations and enforce public TypeScript contracts |

- **Need:** prose alone did not enforce declaration consistency or catch empty
  error handlers. Node's compiler does not enforce those style rules.
- **Alternatives and fit:** a checker built on the existing TypeScript parser
  would avoid dependencies but require maintaining our own lint rules. ESLint
  directly supports the standards' established rules. Other lint engines would
  require a separate rule mapping. The development toolchain uses Node 24;
  ESLint also supports the tested Node 20.20.2 and 22 versions. The TypeScript
  integration supports the existing TypeScript 6.0.3 compiler. Runtime support
  and dependencies do not change.
- **Usage and maintenance:** npm reported 672,661,327 ESLint downloads and
  374,467,603 typescript-eslint downloads for September 5 through October 4,
  2026. The releases were published October 2 and October 5 respectively.
  Registry maintainers are `openjsfoundation` / `eslintbot` and `jameshenry` /
  `bradzacher`; both projects have public teams and active release histories.
  At review their issue trackers showed 97 and 174 open issues. Their advisory
  pages listed no published advisories. These signals do not establish safety.
- **Provenance:** both downloaded archives matched npm's SHA-512 metadata.
  All 411 distributed ESLint JavaScript/license files matched source commit
  `a438ec39512c3381f4785a1f3058982ce9845970`. ESLint supplied registry signatures
  but no provenance attestation for this version. typescript-eslint supplied
  provenance; the isolated tree verified all 95 signatures and 30 attestations.
  Account MFA and a complete ownership-transfer history are not publicly
  established by these checks and are not claimed as verified.
- **License:** the two distributed LICENSE files are MIT. The isolated tree
  contains MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC and BlueOak-1.0.0;
  no license field was missing. The Blue Oak notice requirement was reviewed.
  These tools and their notices stay in the development installation, outside
  the runtime archive. Reassess obligations if vendoring or redistribution changes.
- **Security and weight:** the isolated review installed 95 packages, including
  the already-used TypeScript compiler. No install lifecycle scripts were
  declared and installation disabled scripts. `npm audit` reported zero known
  vulnerabilities. ESLint is about 2.95 MB unpacked; the TypeScript wrapper is
  about 43 KB before its parser/plugin dependencies. Lint runs local JavaScript
  configuration with the developer/CI account's filesystem permissions; it has
  no provider credentials or publishing grant in CI. No telemetry operation was
  observed in the reviewed setup; this is not a full transitive-code audit.
- **Control and exit:** exact direct versions and lockfile integrity pin the
  tree. ciqol maintainers review the existing weekly Dependabot updates. Remove
  these tools, the lint configuration and CI step together if replacing them;
  public declaration and installed-package tests must remain.

Sources: [ESLint release](https://eslint.org/blog/2026/10/eslint-v10.12.0-released/),
[TypeScript integration support](https://typescript-eslint.io/users/dependency-versions/),
[ESLint source](https://github.com/eslint/eslint/tree/a438ec39512c3381f4785a1f3058982ce9845970),
[TypeScript lint source](https://github.com/typescript-eslint/typescript-eslint),
[ESLint advisories](https://github.com/eslint/eslint/security/advisories),
[TypeScript lint advisories](https://github.com/typescript-eslint/typescript-eslint/security/advisories),
[npm ESLint metadata](https://registry.npmjs.org/eslint/10.12.0),
[npm TypeScript lint metadata](https://registry.npmjs.org/typescript-eslint/8.71.1).

## First public release preparation - 2026-10-06

The planned first public version is `0.1.0`; earlier versions identify private
prototypes. npm dependency versions are unchanged. `npm audit` found no known
advisories in the installed tree; `npm audit signatures` verified ten registry
signatures and seven attestations. These results do not establish a security audit.

Two CI-only actions carry one built package between jobs:

| Action | Release | Pinned commit | License |
| --- | --- | --- | --- |
| actions/upload-artifact | v7.0.1 | `043fb46d1a93c77aae656e7c1c64a875d1fc6a0a` | MIT |
| actions/download-artifact | v8.0.1 | `3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c` | MIT |

- **Need and alternatives:** the compatibility jobs must test the same archive.
  Rebuilding per job would not prove that contract. GitHub's own artifact actions
  avoid custom authenticated upload/download code.
- **Source and maintenance:** the official release pages resolve to the pinned,
  GitHub-signed commits. Both releases are from 2026, maintained by GitHub, and
  already used in the reference client. At review the repositories showed about
  1,100 and 734 forks respectively; these are adoption signals only.
- **License and execution:** the tagged LICENSE files are MIT; action metadata
  runs bundled JavaScript on Node 24. No action code is shipped in resenv.
  A reproducible build of those bundles and account MFA were not verified.
- **Authority and limits:** upload receives only the package archive, excludes
  hidden files and expires after seven days. Download selects that artifact
  from the same run and fails on a digest mismatch. Jobs have read-only
  repository permission, no provider credentials, and no OIDC publishing grant.
- **Advisories:** the upload advisory page lists none. Download's published
  extraction advisory, GHSA-cxww-7g56-2vh6, affects versions >=4.0.0 and <4.1.3;
  v8.0.1 is outside that range. Bundled dependency advisories were not separately
  audited, so npm's clean result above does not cover these actions.
- **Control:** ciqol maintainers review pinned updates proposed by Dependabot.
  Removing the actions requires replacing artifact transfer or returning to
  independent per-job builds and narrowing the validation claim.

Sources: [upload release](https://github.com/actions/upload-artifact/releases/tag/v7.0.1),
[download release](https://github.com/actions/download-artifact/releases/tag/v8.0.1),
[upload license](https://github.com/actions/upload-artifact/blob/v7.0.1/LICENSE),
[download license](https://github.com/actions/download-artifact/blob/v8.0.1/LICENSE),
[upload inputs](https://github.com/actions/upload-artifact/blob/v7.0.1/action.yml),
[download inputs](https://github.com/actions/download-artifact/blob/v8.0.1/action.yml),
[upload advisories](https://github.com/actions/upload-artifact/security/advisories),
[download advisory](https://github.com/actions/download-artifact/security/advisories/GHSA-cxww-7g56-2vh6).

Version 0.6.0 renamed the package to `@ciqol/resenv` on 2026-10-04 without
changing dependency versions. Earlier review entries retain the original name.

## Doppler support — 2026-10-01

No npm dependency was added for Doppler. Node's built-in HTTPS `fetch`, child
process and buffer APIs provide the required operations. Adding the full MCP
server or SDK would add an unnecessary runtime surface for three authentication
operations and one public secret-read endpoint. The existing crypto/build
dependency versions remain unchanged.

The documented [Doppler MCP package](https://docs.doppler.com/docs/mcp) identified
`@dopplerhq/mcp-server` as the official npm package. Version 1.0.5 was downloaded
for read-only inspection without installation or script execution. The tarball
matched npm's SHA-512 integrity metadata. Its `dist/device-auth.js` describes
GET `/v3/auth/cli/generate/2` and POST `/v3/auth/cli/authorize`, including the
409 pending response. The separately inspected `@dopplerhq/node-sdk` 1.3.0
artifact also matched registry integrity and confirmed the public API's
computed-value response and token-revocation request shape. Neither package's
implementation is vendored or installed. Registry integrity establishes artifact
consistency; it is not an independent audit or provenance attestation.

envref implements these wire operations using the standard library. Browser
login is isolated because its protocol is not in Doppler's public API contract.
The live challenge endpoint accepted envref's own `v0.4.1` version on the review
date. No browser approval or user secret was used for this probe. Maintainers
must recheck the protocol if Doppler changes it; the supported CLI fallback and
explicit token mode are the exit paths.

Optional platform tools are macOS `/usr/bin/security` (shipped with the OS),
Linux `/usr/bin/secret-tool`, and the user's existing Doppler CLI. envref does
not download or install them. The local macOS manual and CLI help were checked
for stdin command input, keychain lookup and the documented credential lookup.
A unique dummy keychain item was written, read back and deleted successfully.
Linux Secret Service behavior is covered with process mocks, not a live Linux
keyring. Host administrators own these platform binaries and their updates.
Fallback executables use fixed system/Homebrew paths, arguments and a filtered
environment; no repository-provided command is evaluated.

The ciqol maintainers own this integration. It can be removed by deleting the
Doppler mode while retaining encryption and explicit command mode. See
[Doppler setup](doppler.md) for credential permissions, fallback behavior and
the remaining trust boundaries.

## Rollup build and declaration checks

Reviewed on 2026-09-29 for the user-requested `.mjs` source migration and dual
CommonJS/ESM package. These tools are development dependencies only and are
omitted from the generated package manifest.

| Package | Version | Distributed license | Purpose |
| --- | --- | --- | --- |
| rollup | 4.63.5 | MIT | Compile the JavaScript source and ESM facades |
| typescript | 6.0.3 | Apache-2.0 | Check CJS and ESM consumer declarations |

- **Need and alternatives:** Node cannot emit CommonJS from ESM source. Rollup
  was explicitly requested and provides module parsing and output generation
  without a custom source rewriter. esbuild or tsup could perform this build,
  but add an alternate toolchain without a requirement. No TypeScript Rollup
  plugin is needed for `.mjs` input. The TypeScript compiler checks the existing
  public declaration contract; file-existence checks alone cannot validate
  consumer type resolution.
- **Fit and weight:** Rollup supports Node >=18 and TypeScript supports Node
  >=14.17; both cover envref's Node >=20 range. Rollup's registry artifact is
  about 2.9 MB unpacked. TypeScript 6.0.3 is the JavaScript compiler with no
  runtime dependencies; it avoids adopting the newer native compiler's
  platform dependency tree for these small declaration checks. The isolated
  macOS installation contains five packages. Its lockfile includes 30 package
  entries, including optional platform variants. Rollup's tree adds
  `@types/estree` 1.0.9, optional `fsevents` 2.3.3, native `@rollup/*` packages
  pinned to 4.63.5, and optional `@napi-rs/lzma-linux-x64-gnu` 1.5.1. Their
  package licenses are MIT. The upstream source explains the lzma dependency
  as part of its native cross-compilation toolchain.
- **Usage and health:** npm reported 140,333,279 Rollup downloads and
  330,811,370 TypeScript downloads for September 21-27, 2026. Rollup lists five
  maintainers; TypeScript 6.0.3 lists six. Rollup 4.63.5 was published September
  24; TypeScript 6.0.3 was published April 16. Both canonical repositories had
  activity on the review date. GitHub reported 26,310/111,270 stars and
  610/5,053 open issues plus pull requests, respectively. These counts are
  maintenance signals, not a claim that every issue was reviewed.
- **Source and provenance:** Rollup's official release tag and npm `gitHead`
  agree on `3722484c33c58b3ab0cbbfcca09b8f267d420329`; TypeScript's agree on
  `050880ce59e30b356b686bd3144efe24f875ebc8`. Both tarball SHA-512 digests were
  verified against registry metadata, and licenses were read from those
  artifacts. `npm audit signatures` verified all five installed packages and
  two provenance attestations. TypeScript does not publish a provenance
  attestation for this version, and the source commit is unsigned. Its trust
  evidence is the verified registry signature, Microsoft-controlled release
  linking the npm distribution, and matching release/source metadata; a
  reproducible compiler build was not performed. Registry MFA enforcement and
  complete ownership histories are not publicly established by these checks.
- **Security and capabilities:** OSV reported no advisories for either exact
  top-level version; npm audit reported none for the isolated dependency tree.
  That review installed with scripts disabled. Setup and CI now use normal
  npm lifecycle behavior; see the installation-policy update above. Rollup
  loads native parser code and reads/writes
  build files; TypeScript reads consumer fixtures and declarations. Neither
  receives application credentials in CI. Configuration files are executable
  build code and must be reviewed. These checks are not a security audit.
- **Control and exit:** the user requested Rollup; the ciqol maintainers own
  subsequent updates. Exact direct versions and the committed lockfile fix the
  tree. Updates require license, advisory, provenance and consumer checks.
  No dependency updater or publication is enabled. A replacement bundler only
  needs to preserve the tested package exports, shared implementation and
  declaration contract; TypeScript can be replaced by a reviewed compiler
  release independently of the runtime.

Evidence: [Rollup release](https://github.com/rollup/rollup/releases/tag/v4.63.5),
[Rollup package source](https://github.com/rollup/rollup/blob/v4.63.5/package.json),
[TypeScript release](https://github.com/microsoft/TypeScript/releases/tag/v6.0.3),
[Rollup registry metadata](https://registry.npmjs.org/rollup/4.63.5), and
[TypeScript registry metadata](https://registry.npmjs.org/typescript/6.0.3).

Reviewed on 2026-09-28 for the private, unpublished envref prototype.

## Runtime dependencies

As of October 12, 2026, resenv has no runtime npm dependencies. Removed
`eciesjs` 0.5.0 and its four transitive crypto packages with dotenvx decryption.
Doppler resolution uses Node's HTTPS fetch and built-in process/credential
helpers. The lockfile and clean-consumer check enforce the empty runtime tree.

## CI actions

Reviewed on 2026-09-29. These actions run only in the test workflow; they are
not distributed with the npm package.

| Action | Version and pinned commit | Purpose |
| --- | --- | --- |
| actions/checkout | v6.1.0, `d23441a48e516b6c34aea4fa41551a30e30af803` | Check out the repository |
| actions/setup-node | v6.5.0, `249970729cb0ef3589644e2896645e5dc5ba9c38` | Install the Node version in `.nvmrc` |

Both are maintained by GitHub, use the MIT license, and run committed JavaScript
bundles on the Actions Node 24 runtime. GitHub's API confirmed the release tags
and commit pins. The release dates were July 20 and July 14, 2026 respectively;
both repositories had activity within the preceding day. The review observed
8,916 stars for checkout and 4,976 for setup-node. These are usage signals,
not security guarantees. Maintainer account MFA and the full ownership history
were not independently verified.

The checkout release hardens pull-request checkout behavior. The setup-node
release includes cache and dependency security updates. Both repositories'
public security-advisory endpoints returned no entries on the review date;
that does not establish the absence of vulnerabilities.

Handwritten checkout and Node installation scripts would duplicate credential
handling and platform-specific setup. The official actions provide those
operations across the Linux and macOS test matrix without adding runtime
dependencies. The workflow grants read-only contents access to the job, does
not persist checkout credentials, disables package-manager caching and install
scripts, and has a ten-minute timeout. It has no publication step or registry
credentials.

Updates require manual review of the source, release notes, licenses and
advisories, followed by new commit pins and a test run. The ciqol maintainers
own that review; either action can be replaced by another reviewed checkout or
runtime setup step without changing envref's package or API.

Evidence: [checkout release](https://github.com/actions/checkout/releases/tag/v6.1.0),
[checkout source](https://github.com/actions/checkout/tree/d23441a48e516b6c34aea4fa41551a30e30af803),
[setup-node release](https://github.com/actions/setup-node/releases/tag/v6.5.0), and
[setup-node source](https://github.com/actions/setup-node/tree/249970729cb0ef3589644e2896645e5dc5ba9c38).
