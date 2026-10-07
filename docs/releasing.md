# First beta: 0.1.0-beta.1

The first prerelease candidate is `@ciqol/resenv@0.1.0-beta.1` on `titan/beta`.
The first stable public release will be `@ciqol/resenv@0.1.0`. Earlier version numbers
belong to unpublished prototypes; they are not public releases. Existing local
archives stay unchanged. The root manifest and lockfile now use the requested
beta version, and the build generates the same version into `dist/`.

The repository remains private. Both manifests keep `private: true`, and no
workflow publishes, creates a release or writes a tag. PR creation is on hold.

## Beta branch and registry channel

`titan/beta` is the release preparation branch. CI runs on pushes to this
branch and the current default branch, `titan/prepare-first-release`. Creating
the beta branch does not change the default branch or repository visibility.

The initial version was set with npm's version command, without a Git tag or
lifecycle scripts. This bootstraps the explicitly chosen first release line;
subsequent commit-derived version automation remains a launch requirement.

The manifest's `publishConfig` selects the public npm registry and the `beta`
dist-tag. Once publication is enabled and approved, the protected CI job must
publish the exact tested archive with `--tag beta --access public`. Consumers
will install `@ciqol/resenv@beta`; ordinary installs must not select a prerelease
through `latest`. Stable `0.1.0` needs its own reviewed candidate and promotion.

### Readiness checks - 2026-10-07

- The previous implementation CI passed with 65 source unit tests, 40 process
  tests and installed-package checks across Linux Node 20/22/24 and macOS
  Node 24. See [validation](validation.md) for the exact tested commit.
- The public npm lookup returned 404 for `@ciqol/resenv`. This does not prove
  the name is available to this account. `npm whoami` returned `ENEEDAUTH`, so
  npm identity, `ciqol` membership and publishing rights remain unverified.
- Gitleaks reviewed all local Git refs. Its nine findings are synthetic token
  fixtures in tests, including older test locations. No real credential was
  identified; this is a scan result, not a guarantee that none exists.
- License approval and a private vulnerability reporting channel remain open.
  Native browser-login and platform limitations below still apply to the beta.

## Verify the candidate

```sh
npm ci
npm run release:check
```

This runs typed lint and strict implementation checks, builds, runs unit/process tests,
installs a packed archive in a clean consumer, checks both module formats and
TypeScript declarations, and previews
the package file list. It is a local preparation check, not a publishing command
or a claim that the launch requirements below are complete.

CI builds one archive and passes it to every compatibility job. Those jobs
install and test the supplied archive without rebuilding it. To reproduce that:

```sh
npm run build
npm run pack:local
npm run test:package -- ciqol-resenv-0.1.0-beta.1.tgz
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

### Current status and tool choice - 2026-10-08

Release automation is not configured yet. `release:check` only verifies a
candidate; pushing `titan/beta` runs CI and does not publish or create a tag.

The requested first stable version remains `0.1.0`. Semantic-release's
[official FAQ](https://semantic-release.gitbook.io/semantic-release/support/faq)
states that an initial `0.x` version is unsupported. Its standard first release
is `1.0.0`, independent of the version written in package.json. Do not seed
unpublished tags to make it appear that a release already happened.

For the `0.1.0` line, release-please is the proposed alternative: it derives
versions and changelogs from Conventional Commits, supports pre-major bump
rules and a beta prerelease strategy, and proposes a release PR for review.
See its [manifest configuration](https://github.com/googleapis/release-please/blob/main/docs/manifest-releaser.md).
No tool dependency or release workflow has been added pending that choice.

If semantic-release is chosen instead, explicitly approve changing the first
line to `1.0.0-beta.1` / `1.0.0`. Configure `titan/beta` with an explicit
`prerelease: 'beta'` and `channel: 'beta'`; the branch name includes a slash,
so it must not be used as the prerelease identifier. Keep the generated
package directory as the publishing root.

The release sequence, once the tool and launch requirements are settled:

1. Run a non-publishing preview of the commit-derived candidate version and notes.
2. Generate the distribution manifest for that version, build once, and test
   the exact archive on the compatibility matrix. Test the publishable manifest
   before approval; do not change the archive after verification.
3. Review the candidate, license, package contents, version and checksum.
4. With publication approved and npm identity/trusted publishing configured,
   publish that archive from a protected CI job under `beta`, then record the
   corresponding release and tag. Stable promotion is a separate reviewed release.

Until launch approval, both manifests remain private and every release preview
must remain non-publishing. No local `npm publish` is part of this workflow.

The first stable `0.1.0` version is explicitly requested, so the beta is prepared without a
Git tag or registry operation. Do not create fake release tags for the prototype
history. The reference client's semantic-release setup cannot be copied
unchanged: its normal initial release does not support a `0.x` starting
version. See the [semantic-release FAQ](https://semantic-release.org/support/faq/).

Choose and review the version automation before enabling publication, including
a dry run that reports `0.1.0-beta.1` on `titan/beta`, keeps the `beta` dist-tag,
and follows a tested policy for subsequent prereleases and stable `0.x`
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

## Draft 0.1.0-beta.1 release notes

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

Finalize the notes after the license and decryption-scope decisions. The native
login compatibility and platform limits must remain visible in the first release.
This is an experimental prerelease. Native login relies on the browser protocol
observed in Doppler's official MCP client, and a fresh login is not yet verified
end to end. Linux credential-store integration has mock coverage; Windows native
login and storage are not implemented. Explicit tokens and existing CLI login
remain supported. Read [SECURITY.md](../SECURITY.md) before use.
