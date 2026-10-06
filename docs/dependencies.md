# Dependency review

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
  Installs use `--ignore-scripts`. The optional fsevents install hook is not
  needed by the one-shot build. Rollup loads native parser code and reads/writes
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

## eciesjs 0.5.0

- **Purpose:** decrypt dotenvx ciphertext without loading dotenv files, evaluating
  expressions, or implementing cryptographic algorithms in envref.
- **Source:** [ecies/js](https://github.com/ecies/js), tag `v0.5.0`, commit
  `3b3f2d3f4ac6c497f42833c3f19c148f7a8efc1f`.
- **License:** MIT, checked in the distributed artifact. Its four transitive
  packages are also MIT. Notices remain in their installed packages. envref is
  private and unpublished; redistribution must preserve those notices.
- **Alternatives:** the standard library would require implementing ECIES framing
  and key derivation ourselves. The full dotenvx runtime adds file loading and
  command evaluation. `@dotenvx/primitives` 3.0.3 bundles eciesjs, but its README
  source link returned 404 and the package had no npm provenance attestation.
  Its minified bundle was inspected to establish the compatibility format, but
  it is not a dependency of this project.
- **Fit:** CommonJS, Node >=16 upstream; envref supports Node >=20. Published
  eciesjs artifact: 40,951 unpacked bytes. Four transitive packages, no native
  compilation or required install scripts. Only `decrypt` is used at runtime.
- **Usage and maintenance:** npm reported 11,924,603 downloads for September
  21–27, 2026. Latest release: April 3, 2026, with earlier releases in January
  and March 2026. The public source page reported 677 commits and zero open
  issues on the review date. npm lists one maintainer, `kigawas`. The package
  predates Node 26; compatibility is checked locally rather than inferred.
- **Concentration and version risk:** pre-1.0 API and one listed maintainer are
  accepted for this prototype because this is the same library/version range
  bundled by dotenvx primitives, the API surface used is small, the exact tree
  is pinned, and ciphertext interoperability is tested independently. There
  is no verified succession guarantee. Removal means replacing the small
  decryption adapter with a reviewed upstream resolver; stored ciphertext does
  not need to change if the format remains compatible.
- **Provenance:** registry SHA-512 integrity was checked against the downloaded
  tarball. The npm SLSA provenance statement identifies the source commit above
  and `.github/workflows/cd.yml` at `refs/tags/v0.5.0`. Registry account MFA and
  complete ownership history are not publicly established by these checks.
  `npm audit signatures` verified registry signatures and provenance
  attestations for all five installed packages on the review date.
- **Security:** OSV returned no known advisories for all five exact versions on
  the review date; `npm audit --omit=dev` also reported zero vulnerabilities.
  These are advisory lookups, not a security audit. Reviewed
  decryption code uses local cryptographic operations; no network, filesystem,
  subprocess, telemetry, or credential discovery is needed on that path.
  Installs run with lifecycle scripts disabled.
- **Control:** `eciesjs` is pinned exactly, with the four reviewed transitive
  versions pinned through npm overrides and the repository lockfile. npm
  overrides apply only at the root: consuming projects must preserve their own
  reviewed lockfile and verify this tree when installing the private package.
  Updates are manual
  and require rerunning the advisory, license, provenance and interoperability
  checks. The ciqol maintainers own ongoing review; automatic updates and
  publication are not enabled.

| Package | Version | License |
| --- | --- | --- |
| eciesjs | 0.5.0 | MIT |
| @ecies/ciphers | 0.2.6 | MIT |
| @noble/ciphers | 1.3.0 | MIT |
| @noble/curves | 1.9.7 | MIT |
| @noble/hashes | 1.8.0 | MIT |

Evidence: [npm metadata](https://registry.npmjs.org/eciesjs/0.5.0),
[provenance](https://registry.npmjs.org/-/npm/v1/attestations/eciesjs@0.5.0),
[download counts](https://api.npmjs.org/downloads/point/2026-09-21:2026-09-27/eciesjs),
[OSV](https://osv.dev/), and distributed LICENSE files.

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
