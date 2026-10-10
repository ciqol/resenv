# Releases

## Contract

`beta` is the sole normal release branch and npm distribution channel.
Semantic-release calculates versions and notes from Conventional Commits and
actual release tags. The first computed version is `1.0.0`, tag `v1.0.0`;
there is no `-beta.N` suffix. GitHub releases are marked prerelease and are not
made latest, because this remains an experimental distribution channel.
Install published releases with `npm install @ciqol/resenv@beta`.

The development root stays private at its prototype version. Ordinary local
builds also stay private. Only a validated release plan selects the distribution
version and removes `private` before packing. Never edit generated manifests or
choose release versions by hand. Preserve previously shared local archives.

## Pipeline

The [CI workflow](../.github/workflows/ci.yml) has three stages:

1. **Read-only build:** normal npm installation, runtime audit, bounded development
   audit, signature verification, lint, strict types and colocated Vitest specs.
   Guarded semantic-release runs against a temporary local Git mirror with no
   registry credential or GitHub write permission. It computes the version and
   notes without creating a tag. Rollup builds the final manifest, then npm packs
   it once. The build records SHA-256 and npm SHA-512 integrity for the archive,
   plus a separate hash of its release metadata.
2. **Read-only consumers:** Linux Node 20, 22 and the pinned Node 24, plus macOS
   Node 24, install and exercise that same archive. Tests cover CJS and ESM,
   preloads, CLI, types, shared module identity and startup failure boundaries.
   Process tests also load the archive, without rebuilding source.
3. **Protected publication:** a manual `workflow_dispatch` with `publish: true`
   from `beta`, after every build and matrix check succeeds. The `release` job
   downloads the candidate and compares its hashes with the build job outputs.
   It checks the repository, workflow, source commit and current branch head.
   It installs no project dependencies, executes no package code, and publishes
   the exact archive using npm OIDC. Only after the registry confirms the expected
   integrity does it create the computed Git tag and GitHub release.

Publication is serialized and never cancelled by a newer release. Pushes,
pull requests and manual runs with `publish: false` cannot publish. If semantic-release
finds no releasable change, the candidate remains private and publication skips.
Artifacts are retained for seven days. Root workflow permissions are empty;
only the release job receives `contents: write` and `id-token: write`.

The protected environment is named `release`, with a branch policy allowing
only `beta` and a required `titan-ron` reviewer. Initial environment creation
requires the maintainer's separate approval. The publisher should remain unused
until these settings are applied and read back. No secrets belong in it for OIDC.

## Run a release

Publication currently stays disabled: `RELEASE_ENABLED` is unset. This prevents
GitHub from automatically creating an unprotected environment if someone checks
the publication box too early. After the approved environment settings are
verified and npm authentication is ready, the maintainer can set the repository
Actions variable `RELEASE_ENABLED` to `true`. It is not a secret or credential.

Open [CI](https://github.com/ciqol/resenv/actions/workflows/ci.yml), select
**Run workflow**, choose `beta`, and enable **Publish the tested release candidate**.
Approve the `release` environment when the build and consumer checks pass.
Afterward verify the npm version, `beta` dist-tag, integrity and provenance,
and the matching source tag and GitHub release. Never promote to `latest` as
part of this workflow.

For a hosted rehearsal, leave the publication checkbox off. For ordinary local
verification, use:

```sh
npm ci
npm run audit
npm run release:check
```

Neither command publishes. A local mirror dry run can also produce a candidate
plan with `node scripts/release-plan.mjs /absolute/path/to/new-candidate-directory`.
The planner does not create tags or contact a secret provider.

## npm authentication and first-package limitation

The maintainer manages npm ownership and authentication. Never publish from a
developer machine, request local npm login as a release prerequisite, or add a
permanent npm publishing token. The implemented publication path uses OIDC only.

For an **existing** package, configure this trusted publisher in npm:

| Field | Value |
| --- | --- |
| Provider | GitHub Actions |
| Organization or user | `ciqol` |
| Repository | `resenv` |
| Workflow filename | `ci.yml` |
| Environment | `release` |
| Permission | Direct publication (`npm publish`) |

The workflow filename is just `ci.yml`. Use npm 11.5.1+ and Node 22.14+ for OIDC;
the publisher uses the repository's pinned Node 24 runtime. Saving a trust
configuration does not verify it, and a new trust expires after two days without
a successful publication. `npm whoami` is not an OIDC publishing check.

**npm requires a package to already exist before configuring its trusted publisher.**
The unauthenticated `@ciqol/resenv` lookup returned 404 on October 10, 2026.
An OIDC-only first publication is therefore not established. Do not tell a
maintainer to configure a nonexistent package's settings or silently introduce
a token fallback. A one-time CI bootstrap with an explicitly approved,
short-lived credential is a separate decision; it is not implemented here.

Staged publishing supports new packages and creates a public `0.0.0-stage`
placeholder, but initial staging also requires package publishing access. It
does not demonstrate a credential-free OIDC bootstrap. Preserve the requirement
that any publication or staging occur through CI unless the maintainer changes it.

Sources: [trusted publishing](https://docs.npmjs.com/trusted-publishers/),
[trust prerequisites](https://docs.npmjs.com/cli/v11/commands/npm-trust/#prerequisites),
[staged publishing](https://docs.npmjs.com/staged-publishing/).

## Failure recovery

If npm publication fails, no tag or GitHub release is created. Correct the npm
trust or access issue, then rerun the failed release job while its original
artifact remains available. This keeps the tested bytes, version and hashes.

If npm succeeds but GitHub recording fails, rerun the failed job. The publisher
accepts an existing npm version only if its integrity exactly matches this
candidate; it then completes the tag/release without republishing. An existing
tag must target the same commit. A different npm archive or tag stops recovery.

Do not rerun the entire workflow to recover a partially published release:
version planning may change once a tag exists. Do not delete real release tags,
overwrite versions, unpublish, or move `latest` to repair a failed job. If the
artifact has expired or `beta` has advanced, review recovery from the recorded
version, source commit and registry integrity separately.

## Dependency security and platform limits

The runtime audit has no exceptions. Release planning admits exact development
tools with a bounded, executable advisory review expiring November 9, 2026.
New findings, affected runtime paths, version drift and expiry fail CI. This
release-tool tree is not vulnerability-free. See [release security](release-security.md),
including the separate assessment of npm's bundled publishing dependencies.
Never install the semantic-release tree in the privileged publisher.

Doppler is the only built-in cloud provider. Fresh native browser login has not
been verified end to end; its compatibility relies on the protocol observed in
the official MCP client. Linux credential storage has mock coverage. Windows
native login/storage is not implemented. Explicit tokens and existing CLI
credentials remain supported. Ciphertext compatibility and explicitly enabled
commands remain existing optional behavior. These limits belong in the beta
release and [security documentation](../SECURITY.md).

## Reference and evidence

The setup was compared with
[sonarqube-api-client at 100f323](https://github.com/ciqol/sonarqube-api-client/tree/100f323544ec0a517eeabd978c60fe5eb7170ca6).
It retains automated Conventional Commit versioning, generated distribution
manifests, dual-module consumer checks and GitHub Actions OIDC. It adapts the
artifact handoff: resenv publishes the previously tested archive rather than
rebuilding and letting a directory-based release plugin repack it. PR jobs
receive neither publication credentials nor write permissions.

Local final-version validation on October 10 passed strict types, lint, 98 unit
tests, 43 process tests, installed CJS/ESM runtime checks and typed consumers.
The merged installation verified 606 registry signatures and 186 attestations.
The runtime audit reported zero findings. Hosted validation and actual OIDC
publication must be observed separately; local tests do not establish them.
The [validation log](validation.md) retains earlier prototype and branch decisions.
