# Validation

## October 13, 2026 — packaged installation documentation

npm lists only `0.1.0-beta.1`, with both `beta` and `latest` pointing to it.
Its public archive still contains the unpublished, archive-only installation
instructions corrected later in the source README. Package checks now compare
the archived README with the checkout and require npm beta installation,
rejecting local archive paths and unpublished claims. The actual published
archive fails the new gate; restoring its README in both source and build also
fails the installation check. The current build passes all 16 packed runtime
checks and both typed consumers. Lint, strict types, build, 101 unit/tooling
tests, the coverage gate and 41 process tests passed on pinned Node 24.19.0.
The package check used a writable temporary npm cache after the sandbox denied
access to the default cache. The Doppler guide now starts with the installed
CLI and links to contributor setup. The existing public archive is unchanged;
publishing corrected documentation requires a new staged, approved release.

## October 13, 2026 — PR review and command shutdown

Review found that forwarding a signal only to the wrapped command could leave
its worker running and hang shutdown. The expanded regression timed out before
the fix. POSIX forwarding now targets the command's isolated process group;
SIGINT, SIGTERM and SIGHUP each reach both processes once, and graceful shutdown
completes. Already-exited groups are tolerated; Windows keeps direct signaling.
Pinned Node 24 verification passed lint, types, build, 101 unit/tooling tests,
41 process tests, 16 packed runtime checks and two typed consumers. Runtime
audit: zero findings; the 12 bounded development exceptions are unchanged.
The first PR run also exposed a candidate check against GitHub's synthetic merge
SHA despite checking out the PR head. Package verification now uses the actual
checkout commit. The exact hosted archive passed with a simulated merge SHA;
a candidate with the wrong source commit still failed.
GitHub posted the first PR coverage report after the action's 160-second wait
expired. The official uploader now allows 240 seconds within the five-minute
job limit, retaining failure on upload or processing errors.

## October 13, 2026 — native boundaries and official coverage action

Live Doppler generation rejected `v0.1.0-beta.1` with HTTP 400 but accepted
`v0.1.0`. Login now sends its own version core, keeping the resenv identity.
Real challenge generation, pending polling and timeout passed after the fix.
The challenge expired without browser approval; no token was issued. A temporary
macOS keychain passed absent/write/readback/replacement/deletion checks and was
removed with the original keychain search list preserved. Browser approval and
issued-token recovery remain a manual check requiring a personal/test account.

Local verification passed lint, strict types, build, 101 unit/tooling tests,
41 process tests, 16 packed runtime checks and two typed consumers. The runtime
audit is clean; all 12 development exceptions and their unchanged November 9
expiry were rechecked, including npm 12.2.0's affected bundled copies.
CI now uses exact official action tags, a real isolated Linux keyring check,
and `actions/upload-code-coverage@v1.4.4`. Code Quality was explicitly approved
and enabled for this repository with AI findings disabled; its initial scan passed.
The [hosted run](https://github.com/ciqol/resenv/actions/runs/38363153784) passed
all matrix jobs and the real Linux keyring check; coverage processing succeeded.
Code Quality's two `js/invalid-prototype-value` findings are fixture false positives:
`Object.defineProperty` defines own `__proto__` data properties in regression tests,
without invoking the prototype setter. No runtime fix or suppression is needed.

## October 13, 2026 — final repository review and coverage

Rechecked credential persistence, CLI signal forwarding, literal fetched values,
atomic replacement, packed exports and release integrity/tag guards. The earlier
review fixes remain covered; no further runtime change was needed. GitHub private
reporting, secret scanning and push protection are enabled. npm's `beta` and
`latest` tags both point to the recorded `0.1.0-beta.1` release.

Pinned Node 24 verification passed lint, strict types, build, 101 unit/tooling
tests, 41 process tests, 16 packed runtime checks and two typed consumers.
Source unit coverage is 93.20% statements, 93.25% branches, 95.45% functions and
94.98% lines, with a 90% global floor enforced locally and in CI. Cobertura file
paths were verified. CI retains LCOV/Cobertura artifacts for seven days; GitHub
Code Quality remains disabled by maintainer choice. Runtime audit: zero findings;
the 12 reviewed development advisories retain their November 9 expiry.
Live native-login/Linux-keyring
verification remains a documented limit in [the handoff](maintainer-handoff.md).

## October 12, 2026 — delivery and session handoff review

Reviewed the resolver, command opt-in, provider and credential boundaries,
dual-module package, documentation and CI staging/recovery paths. No new
runtime blocker was identified. Native browser login remains unverified end
to end; this review does not establish an independent security audit.

Local checks passed typed lint, source/spec type checks, Rollup, 94 Vitest
tests, 40 process tests, 16 installed-package runtime checks and two typed
consumers. The initial package check could not write to the local npm cache;
the build and package check passed with a separate writable temporary cache.
Runtime audit: zero findings. The development audit matched the 12 reviewed
advisory IDs with the existing November 9 expiry. Registry verification passed
for 605 signatures and 185 attestations.

The maintained source still meets the static maturity checklist. Generated
package findings remain as explained in [maturity](maturity.md). Session and
release recovery instructions now live in [the handoff](maintainer-handoff.md).

At review time, GitHub private vulnerability reporting was disabled. The
earlier CI candidate was still staged and had not been approved on npm. The
maintainer had removed the accidental public `1.0.0`; `0.0.0-stage` remained.
Check live provider state before treating any of these observations as current.

## October 12, 2026 — first CI beta preparation

Removed dotenvx decryption, `eciesjs` and its four transitive dependencies.
The runtime dependency tree is empty. Retained Doppler references and explicit
command opt-in; original and fetched `encrypted:` strings remain literal.

Local validation passed lint, strict implementation/spec type checks, the
Rollup build, 94 Vitest tests, 40 process tests, 16 installed-package runtime
checks and two typed consumers. The runtime audit reported zero findings; the
12 reviewed release-tool advisories retain their November 9 expiry.

The beta planner starts at `0.1.0-beta.1`, ignores the old stable version,
skips unchanged/docs-only history and increments real beta tags. Tests cover
malformed beta tags, unchanged source refs, staging receipts, failure ordering,
registry integrity conflicts and release recording after approval.

CI stages the exact tested archive using the existing stage-only OIDC
publisher. npm maintainer approval and public availability are required before
recording its tag or removing npm versions `1.0.0` and `0.0.0-stage`. Hosted
validation and actual publication are separate evidence from these local checks.

## Release pipeline candidate - 2026-10-10

The normal `beta` branch planner computed `1.0.0` without tags or publication.
The final distribution manifest was generated at that version before packing;
the root remained private. Strict types, lint, 98 colocated Vitest tests,
43 process tests, installed-package runtime checks and typed consumers passed.
Registry verification passed for 606 signatures and 186 attestations.

The runtime audit is clean. The development tree has 10 high and two moderate
affected-package findings, covering 12 active advisory IDs. These are admitted
only with the exact paths, versions, callable guards and November 9 expiry in
[the release security review](release-security.md). Tests reject unknown
findings, runtime occurrences, drift, expired policy and malformed audit data.

The native publisher tests cover archive substitution, source mismatch, event
and workflow restrictions, npm failure before tag creation, registry integrity
collision, tag collision, recovery and removal of inherited credentials/config.
No publication was performed by these local tests. The npm package lookup is
still 404; npm requires an existing package to configure OIDC trust. See
[the current release guide](releasing.md) for launch and recovery steps.
Earlier dated entries below describe their historical state.


This is a chronological validation log. Older entries describe earlier APIs,
names, versions and installation policies. Use the README for the current
`resolve()` / `replace` API and the release guide for the current release plan.

## Normal release branch beta - 2026-10-08

Changed the semantic-release draft to one normal release branch,
`{ name: 'beta', channel: 'beta' }`, without a `prerelease` property. CI checks
`beta` and the current `titan/beta` preparation branch. This supersedes the
earlier version plan: the initial candidate is `1.0.0` on npm's `beta` channel,
rather than a `1.0.0-beta.1` prerelease.

An isolated local remote held only `beta` at source commit
`a182ec0c04034f84c01b2f770631970256dd30d1`. The real semantic-release engine,
using the checked-in branch configuration and the existing temporary intake
installation, calculated version `1.0.0`, tag `v1.0.0`, channel `beta` from
26 commits. It used only the analyzer plugin, with dry-run enabled and no
registry/GitHub credentials. Assertions confirmed unchanged remote refs and
no tags. The initial fixture attempt had a dangling remote HEAD after removing
its older branches; setting the fixture's HEAD to `beta` corrected the fixture.

Compared the reference repository at `100f323544ec0a517eeabd978c60fe5eb7170ca6`;
the release guide records the reusable contracts and required adaptations.
A refreshed audit of the isolated release-tool tree still reported 10 high and
two moderate findings. No dependency was admitted and no publishing job was
enabled. Visibility, default-branch selection and older-branch deletion remain
separate settings changes.

Lint, the dual-format build, 16 packed runtime checks and two typed consumers
passed on Node 24.19.0. Static workflow parsing verified the branch triggers,
unchanged read-only job permissions and timeouts; local documentation links
resolved. No package or lockfile dependency changed.

## MIT license - 2026-10-08

Added the MIT license with copyright 2026 ciqol contributors. The root manifest,
lockfile root entry and generated distribution manifest declare MIT. Current
usage, contribution, build and release docs reflect the selection; earlier
entries below retain their historical license status.

The Node 24.19.0 build and packed-consumer checks passed: 16 runtime probes and
two typed consumers covering CommonJS and ESM. An additional archive check
verified that `package/LICENSE` matches the source license byte for byte and
that the packed manifest remains private. The lockfile comparison confirmed
that dependency entries and versions are unchanged. No visibility change, tag,
release, PR or npm publication was made.

## CI-only publication clarification - 2026-10-08

The user confirmed that npm publication must run through GitHub Actions with
npm-side trusted publishing configured by the maintainer. Local npm login and
the earlier `ENEEDAUTH` result are not release blockers for that design. Agent
instructions, contributor guidance and the release checklist now record this
contract. The intended publisher is `ciqol/resenv`'s `ci.yml` workflow.

This documentation change does not enable a publishing job, admit release
dependencies, configure npm or GitHub protection settings, or publish a package.
The license, release-tooling review and CI release implementation remain
unfinished. npm provenance is distinct from OIDC authentication and requires
public source; repository visibility remains private.

## Beta release preflight - 2026-10-08

After the user requested the beta release, `npm run release:check` passed on
Node 24.19.0: lint, strict source/spec type checks, the dual-format build,
73 unit tests, 43 process tests, 16 installed-package runtime probes, two typed
consumers and `npm pack ./dist --dry-run`. `npm audit --audit-level=high`
reported zero vulnerabilities in the existing project tree. The latest hosted
CI at source commit `a461ce49903d620ced4c18ce1a90157b46591fc6` also passed.

A temporary release-tool installation verified 447 registry signatures and
121 attestations, with no install lifecycle hooks found. An isolated local
Git clone and local bare remote, without publishing plugins or credentials,
then produced a real semantic-release dry-run result of `1.0.0-beta.1` on
channel `beta` for that source commit. No tag was created. Release notes were
generated separately from the analyzed commits. This supersedes the earlier
entry's statement that no dry run had been performed, while leaving hosted
authentication, stable promotion and actual publication unverified.

No dependency was admitted into the project, and the audit gate is unchanged.
The release-tool tree still has an unpatched high-severity braces advisory and
other findings. npm authentication and the separate license choice are also
pending. The full check exercised the private prototype archive, not a final
publication candidate. No release, tag or registry publication was created.

## Default preload command isolation and beta configuration - 2026-10-08

The canonical and compatibility cloud preloads are now each checked through
both `--require` and `--import` with a whole-value command that would create a
file if executed. All four must preserve the exact expression and leave the
file absent, even with RESENV_COMMANDS=true. A throwing credential worker
confirms that plain command text triggers no provider work.

The semantic-release beta configuration is a draft with dryRun enabled.
No tooling dependency was admitted, no GitHub workflow or publication was
enabled, and a semantic-release dry run is not claimed. The isolated temporary
intake audit identified an unpatched high-severity dependency; see dependencies.md.


## Concise resolver API - 2026-10-08

The public function is now `resolve(env = process.env, options = {})`.
`replace: true` opts into updating the input; the default remains `false`, and
successful calls always return an independent copy. The earlier `resolveEnv`
name and `inPlace` option are removed from this unpublished candidate. Preload
paths remain unchanged. Shell commands remain explicit opt-in trusted code;
provider output is never evaluated recursively.

Lint, strict source/spec type checks, the dual-format build, 73 unit tests,
43 process tests, 16 installed-package runtime probes and two typed consumers
passed on Node 24.19.0. Consumer tests reject the removed function and option,
check the shared CommonJS/ESM export, and enforce boolean `replace` values.


## Inferred provider selection - 2026-10-08

`resolveEnv()` now infers Doppler from original `doppler://` values without a
provider option, matching the canonical preload and CLI. The `doppler` option
is removed. Copy mode remains the default; `inPlace: true` commits replacements
only after success. `commands: true` explicitly permits shell execution, including
commands that supply a Doppler token in the same resolution pass.

Lint, strict source/spec checks, the dual-format build, 73 Vitest unit tests and
43 process tests passed on Node 24.19.0. The packed package passed 16 runtime
probes and two typed consumers. Consumer compilation rejects the removed
`doppler` option and non-boolean replacement/command options. Added checks cover
library defaults in CommonJS and ESM, no-reference startup without credential
access, invalid references before command execution, atomic cloud failures,
cloud-provided decryption keys and literal cloud output with commands enabled.
All provider requests use isolated stubs and dummy credentials.

## Unified resolver API - 2026-10-08

The public API exposes one `resolveEnv(env = process.env, options = {})`
function. It always returns an independent resolved copy. `inPlace` defaults
to `false`; setting it to `true` also commits replacements to the input after
all resolution and target checks succeed. The earlier `resolveEnvInPlace`
export is removed from this unpublished candidate. Preloads explicitly enable
replacement; the CLI uses the returned copy for its child process.

`npm run verify` passed on Node 24.19.0: lint, strict implementation/spec
type checks, dual-format build, 68 Vitest unit tests, 40 process tests,
16 installed runtime probes and two typed consumers. Added checks cover frozen
inputs in copy mode, independent results in replacement mode, no-reference
copies, default `process.env` behavior and the removed export in both module
formats. Invalid `inPlace` types fail consumer compilation. Existing tests
still cover atomic failures, property descriptors, setters, proxies and
startup resolution before application imports.

## User and contributor documentation - 2026-10-07

The README now leads with package installation and application use. Checkout
setup, build/test commands, local packaging and application links live in
CONTRIBUTING.md. Standard setup, CI and package checks no longer suppress npm
lifecycle scripts; dependency versions and lock entries are unchanged.

A fresh offline install from the existing cache passed on Node 24.19.0/npm
11.17.0 with normal script behavior, followed by all 65 unit tests, 40 process
tests, lint, strict type checks and the dual-format build. npm warned about
script-review metadata for optional fsevents; see [the inspection](dependencies.md).

Package verification now also runs the documented `npx --no-install resenv
--help` invocation in the isolated installed consumer. This checks npm's CLI
link, using an offline cache and empty user/global npm configuration files.

## First beta preparation - 2026-10-07

The `titan/beta` candidate uses `0.1.0-beta.1` in the development manifest,
lockfile and generated distribution manifest. Both manifests remain private;
the intended npm channel is explicitly `beta`. No package, release or tag has
been published. The first stable version remains `0.1.0`.

`npm run release:check` passed on Node 24.19.0: lint, strict source/spec type
checks, dual-format build, all 65 Vitest unit tests, all 40 process tests, 13
installed-package runtime probes and both typed consumers. The pack dry run
reported the beta name/version and 60 files. The installed-package check also
verifies that the generated manifest retains the intended registry/channel.

Preparation exposed a stable-only version assertion in the login fixture. It
now checks the exact manifest version, including its prerelease suffix.
Generated coverage output is excluded from lint so collecting coverage does
not change subsequent lint results.

The workflow parsed successfully and its branch filters, read-only permissions,
timeouts and credential-free checkouts passed structural checks. Push validation
now covers `titan/beta` and GitHub's observed default branch,
`titan/prepare-first-release`.

Gitleaks scanned all local Git refs with redacted output. Its nine detections
were reviewed as synthetic token fixtures in current and older tests. No real
credential was identified. No tracked dotenv/key/archive files or personal
absolute paths were found in the reviewed history. The previously distributed
`0.1.0` archive retained its recorded SHA-256. These checks do not establish that
the repository is free of every possible sensitive value.

The registry lookup returned 404, and local npm identity was unavailable
(`ENEEDAUTH`). License approval, verified npm publishing access and the release
publishing workflow remain outstanding. See [release preparation](releasing.md).

## Colocated Vitest specs - 2026-10-07

Unit tests now live beside their source modules as `*.spec.ts` and run with
Vitest 4.1.11. The ten suites cover the resolver, commands, preload state,
value guards and each Doppler module. All previous regression cases remain;
new isolated command/preload checks bring the suite to 65 unit tests. The
40 process tests remain in `test/` alongside package and integration checks.
Unit tests import source and mock or inject external effects; process tests
exercise compiled output with dummy values and temporary fixtures.

Typed ESLint, strict source/spec TypeScript checks, the dual-format Rollup build,
65 unit tests and 40 process tests passed locally on Node 24.19.0. Specs are
excluded from production JavaScript and declarations. The packed-package check
also rejects spec files and the Vitest/Vite development dependencies.

`npm run test:coverage` reports 92.41% source line coverage and 90.36% branch
coverage from unit tests alone. It includes the worker and preload entry files
whose process behavior is checked separately; the earlier compiled-module
figures below combine a different set of tests and are not directly comparable.
Text and lcov reports are generated locally. CI runs source unit coverage before
building, then tests the same archive across its runtime matrix.

The updated development tree reported zero known vulnerabilities, 175 verified
registry signatures and 68 verified attestations. Existing dependency versions
and integrity hashes did not change; the additions are development-only.

## Unit-test coverage - 2026-10-06

Added 23 tests for credential lookup, persistence and deletion failures, CLI
credential selection and login verification, browser launch results, login
fallback and challenge validation, worker response validation, HTTP response
handling, UTF-8 size limits, environment copies and command deadline/cleanup
failures. Credential helpers, browser launchers and provider requests use
injected doubles with dummy data; these tests never access a real credential
store or Doppler account. Runtime behavior and dependencies are unchanged.

All 95 unit/process tests passed on local Node 24.19.0. Typed ESLint, strict
TypeScript checks, the Rollup build, 13 packed-package runtime checks and both
typed consumers passed. The offline package check required npm-cache access.

Run the coverage check after building:

```sh
node --test --experimental-test-coverage test/*.test.mjs
```

Node's report for the compiled modules increased from 93.84% to 97.08% line
coverage and from 85.35% to 91.96% branch coverage. Doppler auth, bridge, HTTP,
reference parsing, resolution and system adapters each have 100% line coverage.
Coverage from temporary package copies used by process fixtures is not included
in these module totals. This local result does not establish Windows support
or complete branch coverage.

## TypeScript implementation and maturity - 2026-10-06

The library and CLI now compile from TypeScript through Rollup's official
plugin. All 72 unit/process tests passed on local Node 24.19.0, along with
typed ESLint, strict implementation checks and the clean-consumer checks.
The archive passed 13 runtime checks and two strict typed consumers. Those
consumers have no Node types or build dependencies installed and do not rely
on implicit ambient types. Declarations come from the source implementation.

Nx 23.2.1 again passed target loading, local/shell precedence, isolation and
strict failure tests using dummy values and a temporary workspace. The existing
existing installation was used read-only. No real credentials were accessed.

The benchmark recorded 84.262 ms for eight unique mocked requests with 16
references and 40 ms simulated request latency, with peak concurrency four.
No-work resolution took 0.046 ms. Fresh-process medians were 44.776 ms for Node
alone, 52.256 ms with the CommonJS preload and 53.258 ms with the ESM preload.
These observations use the same benchmark method as the earlier review; small
startup differences include scheduling/filesystem noise.

The [static maturity report](maturity.md) records 88% across the full discovered
tree, including generated output, and 96% for maintained source. Remaining
catalog findings are the documented install-hook policy and development files
intentionally absent from the generated distribution. Workflow YAML and
documentation links passed structural checks. actionlint was not installed;
the local check is not an actionlint result.

Runtime dependency versions and integrity values remain unchanged. The complete
local development tree reported zero known vulnerabilities, 116 verified
registry signatures and 39 verified attestations.

[Hosted CI](https://github.com/ciqol/resenv/actions/runs/37472468215) passed for
`e0d6a8f`: the build checked the TypeScript implementation and produced one
archive. All four compatibility jobs passed 72 tests, 13 runtime package checks
and two typed consumers: Linux on Node 20, 22 and 24, and macOS on Node 24.
The Linux build verified 116 registry signatures and 40 attestations, with zero
known vulnerabilities. Counts describe each platform's installed tree.

This was a manual-dispatch run. The pull-request trigger was inspected but not
executed, because PR creation remains on hold. Existing distributed archives
retain their SHA-256 hashes. The documentation-only follow-up records the
tested commit without changing its implementation. The repository and generated
package stay private at 0.1.0; no PR, release or visibility change was made.

## Security, performance and standards review - 2026-10-06

All 70 unit/process tests passed locally on Node 20.20.2, 22.22.3 and 24.19.0
on macOS arm64. The installed 0.1.0 candidate passed 13 runtime checks and two
strict typed consumers on Node 24. Lint and declaration checks passed.

Nx 23.2.1 passed command and Doppler resolution, target loading, local/shell
precedence, target isolation and strict startup failures. The test used dummy
credentials and a temporary workspace with the existing Nx installation
read-only. No consumer files or live provider credentials were used.

The review reproduced and fixed native subprocess debug leakage, repeated
automatic resolution, malformed provider Unicode and partial in-place updates.
Cloud lookups now deduplicate and run with bounded concurrency. The mocked
eight-request benchmark fell from 332.069 ms to 81.705 ms; this is a synthetic
measurement, not a live provider guarantee. See the
[full review](security-performance-review.md) for evidence and limitations.

Runtime dependency versions and integrity values are unchanged. The full
development tree reported zero known vulnerabilities, 103 verified registry
signatures and 37 verified attestations locally. Existing distributed archives
remain unchanged.

[Hosted CI](https://github.com/ciqol/resenv/actions/runs/37462966577) passed for
`e57a8fe`: the build passed audits, lint and declaration checks, then produced
one archive. Linux jobs on Node 20, 22 and 24 and the macOS job on Node 24 each
passed all 70 tests, 13 installed runtime checks and two typed consumers. The
Linux build verified 103 registry signatures and 38 attestations. Counts apply
to each platform's installed tree. The following documentation-only commit
records this result without changing code.

## First public 0.1.0 candidate - 2026-10-06

The public version sequence starts at 0.1.0 as requested. Earlier sections
record unpublished prototype versions and are retained as historical evidence.

On macOS arm64, all 54 unit/process tests passed on Node 20.20.2, 22.22.3 and
24.19.0. The same 0.1.0 archive passed 13 runtime checks and two typed consumers
on each version. Package checks now also validate the supplied archive's name,
version, private manifest and CLI executable mode.

The first hosted run exposed missing registry metadata in a fresh npm cache.
The package check now constructs a consumer lockfile from the reviewed runtime
entries and the supplied archive, then uses offline `npm ci`. Both archive
paths passed with an isolated cache populated only by `npm ci`; no preexisting
registry metadata or source-tree dependencies were available to the consumer.

The changed workflow and contributor YAML files parsed successfully. A focused
check verified event selection, read-only permissions, pinned action references,
checkout credential handling, artifact prerequisites and absence of publishing.
This was local structural validation; actionlint was not available.

[Hosted CI](https://github.com/ciqol/resenv/actions/runs/37443670608) passed for
commit `5176128`: one Linux build and four test jobs on Linux (Node 20, 22 and
24) and macOS (Node 24). Every test job installed the same archive, passed all
13 runtime and two typed-consumer checks, then passed all 54 unit/process tests
against the extracted build. The build's audit and signature checks also passed.

Dependency audit reported no known vulnerabilities; ten registry signatures and
seven attestations verified. The three existing commits were inspected for
dotenv/archive files, provider-token patterns, private-key blocks and personal
paths, with no matches outside explicit dummy fixtures. This pattern-based
check is not a complete secret audit or independent security review.

License selection, the decryption-scope decision, fresh native browser login
and live repository/release setup remain separate launch requirements.
No provider calls, credential writes or changes to the local application setup
were needed for these checks. Both manifests stay private; no release or tag
was created.

## Version 0.6.0 - resenv package and resolve preload

Checked on 2026-10-04 on macOS arm64. All 54 unit/process tests passed on
Node 20.20.2, 22.22.3 and 24.19.0. On each version, the installed
`@ciqol/resenv` package passed 13 runtime checks and two typed consumers,
including `--require` and `--import` with the canonical `/resolve` preload.
Nx 23.2.1 passed command and Doppler resolution, target loading, precedence,
target isolation and strict startup failures using dummy credentials.

The local application uses the renamed preload and ignored package links.
Its 80 tests, ESLint and strict oxlint checks passed. The restarted detached
preview returned HTTP 200, and all three Doppler references resolved through
the HTTPS API. Google was configured and connected; Bing was configured.
Only boolean status and value-free diagnostics were inspected.

The consumer's manifests, lockfile, CI configuration and original 0.4.1 archive
remain unchanged. Its integration is local and uncommitted. Both package
manifests remain private. This rename keeps the existing OS credential-store
identifier; it does not change authentication or resolution behavior. Hosted
CI and the full native browser-approval flow remain unverified.

Earlier validation entries retain the names and versions checked at the time.

## Version 0.5.0 - inferred providers in the canonical preload

Checked on 2026-10-01 on macOS arm64. All 54 unit/process tests passed on Node
20.20.2, 22.22.3 and 24.19.0. On each version, the installed package passed 13
runtime checks and both typed consumer checks. The private package version is
0.5.0; existing 0.4.1 consumer archives remain unchanged.

Checks cover Doppler inference through `@ciqol/envref/register` in both module
formats and `envref run`, login-provider inference from inherited values,
literal shell expressions, and shared execution when the canonical and legacy
preload names are combined. Login rejects CI even with an interactive terminal.
Nx 23.2.1 passed target loading, local/shell precedence, target isolation and
strict failures using the canonical preload and dummy credentials.

A local consumer was linked to the built package without changing its
manifests, lockfile or workflows. Its serve command uses the canonical preload,
and its ignored `.env.serve.local` contains three Doppler references. All three
resolved through the HTTPS API using an existing login. The detached preview
returned HTTP 200; configuration checks confirmed Google was connected and both
providers were configured. Secret values were neither printed nor saved.
The consumer's 80 tests, ESLint and strict oxlint checks passed. Its project has
no separate typecheck target.

Initial artifact and Nx checks hit sandbox restrictions on npm cache writes
and Unix sockets; reruns with the required permissions passed. Hosted CI and
the full native browser-approval flow remain unverified. The consumer setup
remains local and was not committed or pushed.

## Doppler API resolution and browser login

Checked on 2026-10-01 on macOS arm64. The package remains private and
unpublished; no npm dependencies were added.

| Runtime | Unit/process tests | Installed artifact checks |
| --- | --- | --- |
| Node 20.20.2 | 52 passed | 13 runtime probes and 2 typed consumers passed |
| Node 22.22.3 | 52 passed | 13 runtime probes and 2 typed consumers passed |
| Node 24.19.0 | 52 passed | 13 runtime probes and 2 typed consumers passed |

The added checks cover reference validation, credential precedence, browser
login and CLI fallback, OS helper arguments and environment, request limits,
safe errors, literal fetched values, atomic updates, and both preload formats.
Browser authorization, API responses and Linux credential storage use test
doubles and dummy credentials. Runtime checks use a temporary package copy
with a stubbed worker; the shipped package has no API endpoint override.

Nx 23.2.1 integration passed for both command and Doppler modes: target dotenv
loading, local-file and inherited-shell precedence, target isolation, and
failure before application startup. The test uses an existing Nx installation
read-only and creates its own temporary workspace. It does not use the source
workspace's dotenv files or credentials.

Two narrow live checks also passed:

- Doppler's authorization challenge endpoint accepted envref's own version and
  returned the expected response shape. No browser authorization was completed,
  account credential issued, or real secret fetched.
- The macOS Keychain adapter stored and retrieved a dummy token through stdin
  under a unique test service. The entry was removed and its absence verified.
  Existing credentials were not read or changed.

Completing browser authorization and retrieving a real secret still need a
live check. Linux Secret Service and hosted GitHub Actions have not been tested
live. Windows native login and storage are not implemented.

The existing consumer tarball was retained unchanged, and no files in the
separate application checkout were modified. See [Doppler setup](doppler.md)
for the login protocol's compatibility limits and fallback behavior.

## Dual-format Rollup build

Checked on 2026-09-29 on macOS arm64 after converting source, tests and build
scripts to `.mjs`. The generated package remains private and unpublished.

| Runtime | Unit/process tests | Installed artifact checks |
| --- | --- | --- |
| Node 20.20.2 | 31 passed | 11 runtime probes and 2 typed consumers passed |
| Node 22.22.3 | 31 passed | 11 runtime probes and 2 typed consumers passed |
| Node 24.19.0 | 31 passed | 11 runtime probes and 2 typed consumers passed |

The artifact checks pack `dist/` and install the tarball into a temporary
consumer offline using cached, pinned runtime dependencies. They exercise CJS
and ESM library imports, both preload forms, the CLI, command resolution,
shared error-class identity, a Node environment with browser-like globals and
single execution when both preload forms are loaded. TypeScript 6.0.3 checks
`.cts` and `.mts` consumers, including expected errors for invalid arguments.
The consumer has no source-tree links or build dependencies.

The 16 upstream ciphertext checks passed against `@dotenvx/primitives` 3.0.3
on Node 24.19.0. The runtime dependency versions did not change. Build dependency
evidence and its provenance limits are recorded in [dependencies.md](dependencies.md).

The revised workflow was parsed and inspected for its compatibility matrix,
action pins, permissions and build/test order. It has not run on GitHub; Linux
and hosted-runner results remain unverified. Earlier tarballs consumed by
other projects are retained unchanged.

## Release preparation - Nx and package checks

Checked on 2026-09-29 on macOS arm64 with Node 24.19.0.

- All 31 unit and process tests passed after the release-preparation changes.
- `npm run test:package` passed five checks against the packed artifact:
  the library, CLI, CommonJS preload, ES module preload and command preload.
  It verifies package exports and contents in a temporary consumer using the
  existing reviewed dependency tree; it does not fetch packages or publish.
- `npm run test:nx -- /absolute/path/to/workspace/node_modules` passed against
  Nx 23.2.1. A temporary workspace verifies `.env.serve` loading, precedence
  of `.env.serve.local` and inherited shell values, isolation from other
  targets, and failure before application startup when a command fails.
  All fixture values are dummy data. The source workspace's dotenv files and
  credentials are not used.
- The Linux/macOS GitHub Actions workflow is prepared but has not run on
  GitHub. Local checks do not establish Linux or hosted-runner compatibility.
- A focused review check confirmed that the command output limit is shared
  across stdout and stderr. A dummy command producing 40,000 bytes on either
  stream succeeded; 40,000 bytes on both streams failed with `COMMAND_FAILED`.
  The README now describes the combined budget. Runtime behavior is unchanged.

The integration script accepts an existing, separately reviewed Nx installation
so Nx does not become a runtime dependency of envref.

A local application was also started through its own Nx `serve` target with
the command preload. Three existing cloud secret references resolved at
startup; the page and configuration-status endpoint both returned HTTP 200.
Only status flags and safe envref diagnostics were inspected. This manual check
does not exercise provider API operations or replace the dummy-data tests.

## Version 0.4.1 - clearer log messages

All 31 tests passed on Node 24.19.0 on 2026-09-29. Success and failure messages
now describe secret replacement; the logging behavior and dependency tree are
unchanged. Escaped variable names and secret-output checks still pass.

## Version 0.4.0 - native debug logging

Checked on 2026-09-29 on macOS arm64. All 31 tests passed on Node 20.20.2
and 24.19.0. Diagnostics now use `node:util`'s `debuglog('envref')` and
`NODE_DEBUG=envref`. Tests verify one result per attempted variable, a final
summary, a single "Nothing to handle" line for empty work, and safe command
and decryption failures. Existing tests verify quiet default behavior.

Secrets, command text and provider output remain absent from logs, and variable
names containing newlines stay escaped. The dependency tree is unchanged.

## Version 0.3.0 - opt-in diagnostics

Checked on 2026-09-29 on macOS arm64. All 31 tests passed on Node 20.20.2
and 24.19.0. Four new tests cover ordered JSON events, resolution identifiers,
safe failure details, disabled command mode, empty environments and an explicit
API override for the debug flag. Existing tests verify quiet default behavior.

The diagnostic tests check that command text, stdout, stderr, private keys,
ciphertext and plaintext are absent from logs. Newline-containing variable
names remain escaped inside a single JSON record. Tests use dummy values only.
The dependency tree is unchanged.

## Version 0.2.0 — command resolution

Checked on 2026-09-29 on macOS arm64. The command suite adds eight tests for
explicit opt-in, complete-value expressions, nested shell commands, fetched
private keys, preserving literal output, atomic environment updates, safe
errors, output limits, timeout cleanup and the CLI/preload entry points.

All 27 tests passed on Node 20.20.2, 24.19.0 and 26.10.0. The 16 upstream
ciphertext compatibility checks also passed on each version.

The implementation uses Node's standard library and `/bin/sh`; it adds no
dependencies. Tests execute only local dummy commands. A real Doppler account
or cloud secret was not accessed.

At the time of this baseline check, Nx's source depended on `dotenv-expand ~12.0.3`. Its variable-expansion
pattern leaves the `$(doppler ...)` form intact, so the reference reaches the
application environment. This is a source inspection, not a full Nx workspace
integration test. A user's installed Nx and dotenv loader versions still need
to be checked when integrating an existing project.

Sources: [Nx dependencies](https://github.com/nrwl/nx/blob/master/packages/nx/package.json),
[Nx task loading](https://github.com/nrwl/nx/blob/master/packages/nx/src/tasks-runner/task-env.ts),
[dotenv-expand 12.0.3](https://github.com/motdotla/dotenv-expand/blob/v12.0.3/lib/main.js).

## Version 0.1.0 — encryption baseline

Checked on 2026-09-28 on macOS arm64 using generated dummy secrets only.

| Check | Result |
| --- | --- |
| Node 20.20.2 | 19 unit and process tests passed |
| Node 24.19.0 | 19 unit and process tests passed |
| Node 26.10.0 | 19 unit and process tests passed |
| Upstream ciphertext compatibility | 16 checks passed on each of the three Node versions |
| npm registry signatures | All 5 installed dependencies verified |
| npm provenance attestations | All 5 installed dependencies verified |
| npm audit / OSV | No known vulnerabilities reported for the reviewed versions |
| Private package installation | Local tarball installed offline in a separate temporary project |
| Installed package exports | CLI, CommonJS preload, ES module preload and library import passed |

The installed tarball kept the five reviewed dependency versions. Its eight
files contain the runtime, type declarations and documentation; no dotenv files,
test credentials or `node_modules` are included. The CLI is executable.

## Upstream compatibility

The upstream check, now `test/interop.mjs`, used a separately installed `@dotenvx/primitives` 3.0.3
to create fresh keys and ciphertext and confirm the plaintext with its own
decrypt function. envref then resolved the same ciphertext through its library,
command wrapper, CommonJS preload and ES module preload.

The plaintext cases cover empty values, a leading byte order mark, ordinary
text, Unicode, line breaks and shell-like text that must remain literal. The
working directory remained empty throughout. The upstream package is a
verification input only and is not part of envref's dependency tree.

To repeat after separately installing and reviewing the upstream package:

```sh
node test/interop.mjs /absolute/path/to/node_modules/@dotenvx/primitives
```

The surrounding upstream investigation used dotenvx CLI 2.31.1. No compatibility
claim is made for future changes to the ciphertext format.

## Runtime coverage and limits

The tests exercise inherited environments, failure before application startup,
all-or-nothing decryption, key rotation, tampered ciphertext, no dotenv loading
or modification, literal argument handling, stdin, exit status and SIGTERM
forwarding. Plaintext and keys do not appear in envref error messages.

The process tests simulate the environment passed by a task runner. The
separate Nx integration check above now verifies the real task runner with
an application preload and target-specific dotenv files. It tests the installed
Nx version listed above; other loaders or versions need their own integration
check, particularly if they resolve commands before envref runs.

Signal behavior is covered by the Linux and macOS process tests. Windows signal
behavior and framework-specific reloaders remain unverified. The wrapper
forwards signals to its direct child, not an arbitrary detached process tree.

This is a private prototype with no independent security audit. The application
and any code granted the same credentials can read its environment.
