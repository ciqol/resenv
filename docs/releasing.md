# Beta releases with semantic-release

The user selected semantic-release with beta releases from `titan/beta`.
The planned first public version is `1.0.0-beta.1` on npm's `beta` channel;
first stable is `1.0.0`. This replaces the earlier 0.1.0 release plan, following
semantic-release's standard initial version. No previous prototype counts as
an actual release and no synthetic release tags should be created.

The root manifest currently remains `0.1.0-beta.1`, a private prototype version.
Do not hand-edit it to predict the next release. After release-tool intake,
semantic-release must derive the candidate from Git history and provide the
version before the final archive is built and tested. Distributed local
archives remain immutable.

## Configuration and current blocker

[release.config.mjs](../release.config.mjs) sets:

- The current default branch, `titan/prepare-first-release`, as the stable
  release branch required by semantic-release.
- `titan/beta` with explicit `prerelease: 'beta'` and `channel: 'beta'`.
  Using the full branch name as the prerelease identifier would include a slash.
- Conventional Commit analysis, release notes, `v${version}` tags and `dryRun: true`.
- No npm/GitHub publishing plugins or automatic release workflow.

This is a configuration draft. It has not been exercised with semantic-release.
Adding the reviewed latest tooling would introduce an unpatched high-severity
braces advisory and fail the existing audit gate. Dependency admission and a
real dry run remain blocked; see the [intake evidence](dependencies.md#semantic-release-intake-not-installed---2026-10-08).
No package manifest or lockfile dependency was changed, and no audit was weakened.

Once admitted, a dry run must confirm `1.0.0-beta.1` / `beta` from the existing
unreleased history and report the release notes. Later beta releases must
increment from actual release tags. Confirm stable promotion and the no-release
case as well. A GitHub dry run checks push permission even though it creates
no tag; it is not an authentication-free check.
See [semantic-release configuration](https://semantic-release.gitbook.io/semantic-release/usage/configuration)
and [prerelease behavior](https://semantic-release.gitbook.io/semantic-release/recipes/release-workflow/pre-releases).

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

After intake and launch approval, complete the delivery path in this order:

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

## Launch requirements

- Complete dependency intake and observe a real semantic-release dry run.
- Settle the license/copyright holder; both manifests remain UNLICENSED pending
  that choice. MIT with titan-ron was proposed previously.
- Review security/performance findings, the final tracked tree and Git history.
- Decide whether to retain the original ciphertext decryption path.
- Verify a fresh native Doppler browser login end to end. Existing-login API
  reads were checked; Linux credential storage has mock coverage and Windows
  native login/storage is not implemented.
- Confirm npm identity, ciqol publishing rights and initial package setup.
  Prior npm identity was unavailable; registry lookup is not proof of ownership.
- Configure and verify trusted publishing and the protected release environment.
  Provenance for a public package requires a public source repository; verify
  the current npm requirements before activation.
- Obtain explicit approval for public visibility, actual tags/releases and
  registry publication. Preserve the private/unpublished state until then.

## Repository setup to approve at launch

Compared on 2026-10-06 with `ciqol/sonarqube-api-client`. These are proposed
settings, not changes made to GitHub:

| Setting | resenv now | Proposed |
| --- | --- | --- |
| Default branch | `titan/prepare-first-release` | `main`, after reviewing the branch transition |
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

## Draft 1.0.0-beta.1 release notes

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

Finalize the notes after release-tool intake, the license and decryption-scope decisions. The native
login compatibility and platform limits must remain visible in the first release.
This is an experimental prerelease. Native login relies on the browser protocol
observed in Doppler's official MCP client, and a fresh login is not yet verified
end to end. Linux credential-store integration has mock coverage; Windows native
login and storage are not implemented. Explicit tokens and existing CLI login
remain supported. Read [SECURITY.md](../SECURITY.md) before use.
