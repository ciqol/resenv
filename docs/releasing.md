# First public release: 0.1.0

The first public release will be `@ciqol/resenv@0.1.0`. Earlier version numbers
belong to unpublished prototypes; they are not public releases. Existing local
archives stay unchanged. The root manifest and lockfile now use the requested
first version, and the build generates the same version into `dist/`.

The repository remains private. Both manifests keep `private: true`, and no
workflow publishes, creates a release or writes a tag. PR creation is on hold.

## Verify the candidate

```sh
npm ci --ignore-scripts
npm run release:check
```

This runs lint and strict declaration checks, builds, runs unit/process tests,
installs a packed archive in a clean consumer, checks both module formats and
TypeScript declarations, and previews
the package file list. It is a local preparation check, not a publishing command
or a claim that the launch requirements below are complete.

CI builds one archive and passes it to every compatibility job. Those jobs
install and test the supplied archive without rebuilding it. To reproduce that:

```sh
npm run build
npm run pack:local
npm run test:package -- ciqol-resenv-0.1.0.tgz
```

The CI artifact is named `resenv-package` and is kept for seven days for review.
A later publish must use the final, tested artifact; changing its manifest or
license requires rebuilding and rechecking it before approval.

## Launch requirements

- Review the [security and performance findings](security-performance-review.md)
  and their remaining platform and trust limitations.
- Settle the license and copyright holder. MIT with `titan-ron`, as used by
  the reference client, is proposed. Until confirmed, the manifest remains
  `UNLICENSED` and there is no LICENSE file.
- Decide whether to remove the older dotenvx decryption path before 0.1.0.
  It is still implemented alongside Doppler and explicitly enabled commands.
- Review the final tracked tree and history for credentials, dotenv files,
  personal paths, internal references and generated artifacts.
- Confirm the fresh native Doppler browser-login flow end to end. Existing-login
  API reads have been checked; a new native login is not yet verified live.
  Linux keyring behavior is covered with process mocks, and Windows native
  login/storage is not implemented.
- Keep hosted CI green for the final candidate, including the same archive on
  Linux and macOS. The preparation run passed; see [validation](validation.md).
  No real provider credentials belong in these jobs.
- Confirm availability and publishing rights for `@ciqol/resenv` with npm.
  A public registry lookup alone cannot establish ownership or permissions.
- Review and approve the settings plan below, enable a private vulnerability
  reporting channel, and update SECURITY.md with its verified link.
- Obtain explicit approval for public visibility and publishing. Then enable
  only the generated manifest for publication, retaining the private root.

## Versioning and publishing

The first `0.1.0` version is explicitly requested, so it is prepared without a
Git tag or registry operation. Do not create fake release tags for the prototype
history. The reference client's semantic-release setup cannot be copied
unchanged: its normal initial release does not support a `0.x` starting
version. See the [semantic-release FAQ](https://semantic-release.org/support/faq/).

Choose and review the version automation before enabling publication, including
a dry run that reports exactly `0.1.0` and a tested policy for subsequent `0.x`
versions. No release-tool dependency or unattended publishing job is installed
by this preparation.

Use a separate protected CI publishing job, gated on the artifact tests and
restricted to the approved release ref. Prefer npm trusted publishing through
OIDC. It needs npm >=11.5.1 and Node >=22.14.0; provenance for a public package
also requires a public repository. Configure the exact repository, workflow
filename and environment in npm. Verify the first-package setup in npm before
assuming an existing-package trusted-publisher configuration is available.
See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/).

The publishing job should consume the verified archive, have only the required
permissions, and report its version, checksum and resulting links. No publishing
credentials belong in pull-request validation.

## Repository setup to approve at launch

Compared on 2026-10-06 with `ciqol/sonarqube-api-client`. These are proposed
settings, not changes made to GitHub:

| Setting | resenv now | Proposed |
| --- | --- | --- |
| Default branch | `titan/bootstrap-envref` | `main`, after reviewing the branch transition |
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
  read-only jobs, pinned actions, dependency audits and explicit timeouts.
- CODEOWNERS, a focused contribution template, a bug form that requests dummy
  data, and grouped weekly dependency-update configuration.

The existing `.mjs` sources and Node test runner fit this package. The client's
TypeScript compiler plugin, Jest, Docker service, coverage-upload permissions,
commit hooks and automatic publishing are not requirements for this resolver.

## Draft 0.1.0 release notes

- Resolve Doppler references already loaded in `process.env` before application
  startup, preserving the caller's dotenv loading and precedence.
- Support Node preloads through both `--require` and `--import`, a command
  wrapper, and a typed library API.
- Fetch individual values through HTTPS with explicit-token, OS-credential and
  existing-CLI authentication.
- Keep fetched output literal; apply replacements only after all lookups succeed.
- Provide opt-in diagnostics that identify variable names without printing values.

Finalize the notes after the license and decryption-scope decisions. The native
login compatibility and platform limits must remain visible in the first release.
