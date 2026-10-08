# Releases from beta with semantic-release

The user selected `beta` as the sole normal release branch. The planned first
public version is `1.0.0` on npm's `beta` channel, installed with
`npm install @ciqol/resenv@beta`. The branch name and distribution channel do
not add a prerelease suffix: this configuration produces ordinary versions,
not `1.0.0-beta.1`. This replaces the earlier prerelease and 0.1.0 plans. No
previous prototype counts as an actual release and no synthetic release tags
should be created.

The root manifest currently remains `0.1.0-beta.1`, a private prototype version.
Do not hand-edit it to predict the next release. After release-tool intake,
semantic-release must derive the candidate from Git history and provide the
version before the final archive is built and tested. Distributed local
archives remain immutable.

## Configuration and current blocker

[release.config.mjs](../release.config.mjs) sets:

- `beta` as the only normal release branch, with explicit `channel: 'beta'`.
- No `prerelease` property. A single normal release branch satisfies the engine
  requirement without an additional stable branch.
- Conventional Commit analysis, release notes, `v${version}` tags and `dryRun: true`.
- No npm/GitHub publishing plugins or automatic release workflow.

This remains a configuration draft for the hosted release path.
Adding the reviewed latest tooling would introduce an unpatched high-severity
braces advisory and fail the existing audit gate. Dependency admission and a
hosted dry run remain blocked; see the [intake evidence](dependencies.md#semantic-release-intake-not-installed---2026-10-08).
No package manifest or lockfile dependency was changed, and no audit was weakened.

An earlier isolated dry run of the superseded prerelease configuration confirmed
`1.0.0-beta.1` / `beta` at `a461ce49903d620ced4c18ce1a90157b46591fc6` on
October 8. It used no publishing plugins or registry/GitHub credentials and
created no tags. Notes were generated separately from that same analysis.
This confirms the version calculation; hosted credentials and the actual
publication workflow still need verification after dependency admission.
Later beta releases must
increment from actual release tags. Confirm stable promotion and the no-release
case as well. A GitHub dry run checks push permission even though it creates
no tag; it is not an authentication-free check.
See [semantic-release configuration](https://semantic-release.gitbook.io/semantic-release/usage/configuration)
and [prerelease behavior](https://semantic-release.gitbook.io/semantic-release/recipes/release-workflow/pre-releases).

### A repository containing only beta

`beta` is a normal release branch with a non-default distribution channel. It
satisfies semantic-release's release-branch requirement by itself. The earlier
`ERELEASEBRANCHES` result applied to a configuration containing only a
**prerelease** branch; it does not apply to the new configuration. See
[semantic-release branch requirements](https://semantic-release.org/foundation/workflow-configuration/#release-branches).

An isolated dry run of the checked-in configuration, against a temporary local
remote containing only `beta`, calculated `1.0.0`, tag `v1.0.0`, channel `beta`.
It used the existing isolated intake installation with only the commit-analyzer
plugin, no publishing plugins or registry/GitHub credentials. The remote refs
were unchanged and no local or remote tag was created. This validates branch
and version behavior without admitting the release dependencies.

CI checks `beta` and the current `titan/beta` preparation branch. Remote default
selection and older-branch deletion remain separate settings changes. Source
visibility and npm publication also remain separate decisions.

The public-exposure audit and branch cleanup plan are in
[public readiness](public-readiness.md).

## Reference: sonarqube-api-client

Compared the reference at
[`100f323`](https://github.com/ciqol/sonarqube-api-client/tree/100f323544ec0a517eeabd978c60fe5eb7170ca6)
on October 8, 2026. Its
[release configuration](https://github.com/ciqol/sonarqube-api-client/blob/100f323544ec0a517eeabd978c60fe5eb7170ca6/.releaserc.mjs)
uses semantic-release's default branches, Conventional Commit analysis, release
notes, npm publication from `dist/`, and GitHub releases. Its
[workflow](https://github.com/ciqol/sonarqube-api-client/blob/100f323544ec0a517eeabd978c60fe5eb7170ca6/.github/workflows/ci.yml)
checks the packed package before releasing with npm OIDC and provenance.
The workflow lists `main` and `beta`, but no `beta` ref existed when checked;
the observed default and published stable releases are from `main`.

Apply these contracts to resenv:

- Keep the development manifest private and generate the consumer manifest in
  `dist/`. Remove `private` from the final release candidate before packing and
  testing it; the current unpublished prototype still has that guard.
- Use Conventional Commits for automated versioning and release notes.
- Gate publication on build, audits and all packed-package matrix/process checks.
- Publish through `ci.yml` using npm trusted publishing, with no npm token.
- Keep OIDC and GitHub write permissions isolated to trusted release events;
  pull-request checks and previews retain read-only permissions.
- Use the requested normal branch `beta`, explicitly setting npm channel `beta`.

Adapt the artifact handoff instead of copying the reference release job: it
rebuilds in the release job and `@semantic-release/npm` prepares and packs its
package directory. Resenv must calculate the version before packing, test the
final archive, then publish those same bytes. Do not assume `pkgRoot: 'dist'`
alone establishes that contract. The reference also grants write/OIDC permissions
to its pull-request dry run; resenv must keep those credentials out of PR jobs.

These comparisons do not admit the reference's dependency tree or enable a
publishing job. The isolated release-tool audit was refreshed on October 8 and
still reports 10 high and two moderate findings, including the braces blocker.

## Candidate checks and delivery

The repository and both manifests remain private; there are no release tags,
GitHub releases or npm publications created by this setup. PR creation remains
on hold. `release:check` is an existing candidate verification command and does
not invoke semantic-release:

```sh
npm ci
npm run release:check
```

It runs lint, strict type checks, dual-format build, unit/process tests and
clean-consumer package checks. CI currently builds one prototype archive and
all Linux/macOS jobs test that same archive. Its `resenv-package` artifact is
retained for seven days. No release job is enabled yet.

The user authorized the beta release on October 8. The repository remains
private. The source is MIT licensed, copyright 2026 ciqol contributors. The
latest full `release:check` passed: 73 unit tests, 43 process tests, 16 installed-package
runtime checks, two typed consumers, and the pack dry run. The current project
audit reported zero known vulnerabilities. The checked archive was the private
prototype, not a publication-ready `1.0.0` candidate.

The user confirmed that npm publication must happen only through GitHub Actions,
using npm trusted publishing (OIDC), and will configure the npm side. Local
`npm login`, a local publishing account, and an npm publishing token are not
release prerequisites. No npm token secret is needed for this design.
The earlier unauthenticated package lookup returned 404; this does not establish
namespace availability or ciqol publishing rights.

Trusted publishing authenticates the CI workflow. Provenance attestations are
a separate feature: npm does not generate them from private repositories, even
for public packages. Keep this repository private until the user explicitly
changes that decision. When the repository and package are public, npm can
generate provenance automatically for an OIDC publish; see
[npm's provenance requirements](https://docs.npmjs.com/trusted-publishers/#automatic-provenance-generation).

After intake and the remaining launch requirements, complete delivery in this order:

1. Derive the candidate version and notes with semantic-release on the approved ref.
2. Generate the final distribution manifest, including its version, license and
   publication metadata, before packing. Keep the development root private.
3. Build once, record the archive checksum and test that exact archive on the
   supported Node/platform matrix.
4. Have a protected, serialized CI job consume that tested archive with narrowly
   scoped permissions and npm trusted publishing. Publish beta candidates under
   `beta`; stable promotion is a separate reviewed release.
5. Record the corresponding real tag and GitHub release, version and checksum.
   Prevent release plugins from repacking an untested directory during publication.

The default @semantic-release/npm plugin publishes its package directory.
It cannot be assumed to publish a previously tested tarball unchanged; inspect
and verify the artifact handoff when enabling publishing.
See [the upstream implementation](https://github.com/semantic-release/npm/blob/master/lib/publish.js).

## npm-side setup

The publishing job is planned inside the existing `.github/workflows/ci.yml`,
after the jobs that verify the final candidate archive. The job is not enabled
yet. Use these fields when the workflow and package are ready:

| npm trusted-publisher field | Value |
| --- | --- |
| Provider | GitHub Actions |
| Organization or user | `ciqol` |
| Repository | `resenv` |
| Workflow filename | `ci.yml` |
| Environment | The exact approved release-environment name, once configured |
| Allowed action | Direct publication with `npm publish` |

Enter just `ci.yml`, without `.github/workflows/`. The environment field must
match the publishing job if the trust is bound to an environment. The GitHub
release environment and its protection settings are not configured yet; their
creation requires a separate reviewed settings change. Do not invent an
environment name in the npm configuration.

Create the final trust configuration when the workflow is ready to publish.
npm expires a new configuration if it has not completed a successful publish
within two days. Saving it alone does not verify that it works. The maintainer
handles any initial npm package or organization setup; do not bootstrap the
package with a local publish.

The final publishing job must use the repository's Node version, a compatible
npm CLI (at least 11.5.1), and `id-token: write`. Keep build and test jobs
read-only. Restrict publication to `beta` on a trusted event, require the
candidate build and matrix tests, serialize publication, and download the same
verified archive without rebuilding. Publish it with the `beta` dist-tag. Do
not run a directory-based plugin that repacks a different artifact. Observe a
successful OIDC release before claiming the setup works.

These settings follow [npm's trusted-publishing documentation](https://docs.npmjs.com/trusted-publishers/).

## Launch requirements

- Complete dependency intake and observe a hosted semantic-release dry run.
- Preserve the MIT license and ciqol contributors copyright in the final archive.
  The license was selected on October 8, 2026.
- Review security/performance findings, the final tracked tree and Git history.
- Decide whether to retain the original ciphertext decryption path.
- Verify a fresh native Doppler browser login end to end. Existing-login API
  reads were checked; Linux credential storage has mock coverage and Windows
  native login/storage is not implemented.
- Have the maintainer configure npm package ownership and trusted publishing;
  verify access from the GitHub Actions publishing job. Local npm login is not
  required.
- Configure and verify the protected release environment. Repository visibility
  remains private; provenance attestations require a later public-source decision.
- Beta tags/releases and registry publication were requested on October 8.
  Public repository visibility and PR creation remain unapproved. Keep the
  repository private and do not publish until the other requirements are met.

## Repository setup to approve at launch

These are proposed settings from the October 6 repository review, not changes
made to GitHub:

| Setting | resenv now | Proposed |
| --- | --- | --- |
| Default branch | `titan/prepare-first-release` | `beta`, after the approved branch transition |
| Merge methods | Merge, rebase, squash | Squash only |
| Squash message | Not reviewed | PR title and commit details |
| Delete merged branches | Off | On |
| Suggest branch updates | Off | On |
| Auto-merge | Off | Consider only after review and checks are enforced |
| Wiki / Projects | Both off | Keep off |
| Visibility | Private | Public only after explicit approval |

GitHub's ruleset endpoint returned HTTP 403 for this private repository under
the current plan. Revisit protection after the visibility/plan decision. Require
a PR, one approving review, resolved threads, code-owner review, and protection
against branch deletion and force pushes. Require only the check contexts
actually observed in resenv's CI; do not copy the client's `e2e` or Node matrix
check names. Changing the default branch also requires updating `ci.yml`'s
push branch filter in the same transition.

## What was applied from the reference

- Private development manifest and a generated distribution manifest.
- Rollup output with explicit CJS/ESM extensions, conditional exports and matching
  declarations. The ESM facades share the CJS implementation to avoid resolving
  secrets twice when both loading modes are used.
- Clean-consumer verification of the built archive, including CLI/preload paths,
  shared error identity, types, and failure before application startup.
- A single CI artifact tested on the supported Node/platform combinations,
  read-only jobs, reviewed action versions, dependency audits and explicit timeouts.
- CODEOWNERS, a focused contribution template, a bug form that requests dummy
  data, and grouped weekly dependency-update configuration.

The library and CLI now use TypeScript with Rollup's TypeScript plugin, generated
declarations and strict implementation checks. Colocated TypeScript unit specs
use Vitest; process tests use Node's test runner against the compiled archive.
The client's Jest setup, Docker service, coverage-upload permissions, commit
hooks and automatic publishing are not requirements for this resolver.

## Draft 1.0.0 release notes

- Resolve Doppler references already loaded in `process.env` before application
  startup, preserving the caller's dotenv loading and precedence.
- Support Node preloads through both `--require` and `--import`, a command
  wrapper, and a typed library API.
- Expose one `resolve()` API that always returns a copy. Input replacement
  requires `{ replace: true }`; its default is `false`.
- Fetch individual values through HTTPS with explicit-token, OS-credential and
  existing-CLI authentication.
- Keep fetched output literal; apply replacements only after all lookups succeed.
- Provide opt-in diagnostics that identify variable names without printing values.

Finalize the notes after release-tool intake and the decryption-scope decision.
The native login compatibility and platform limits must remain visible in the first release.
This is an experimental release on the beta channel. Native login relies on
the browser protocol observed in Doppler's official MCP client, and a fresh login is not yet verified
end to end. Linux credential-store integration has mock coverage; Windows native
login and storage are not implemented. Explicit tokens and existing CLI login
remain supported. Read [SECURITY.md](../SECURITY.md) before use.
