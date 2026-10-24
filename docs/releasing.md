# Releases

## Versions

`beta` is the sole release and default branch. Releases start at `0.1.0-beta.1`
and use npm tags `beta` and `latest`, both pointing to the same tested beta.

The planner uses semantic-release's official commit-analysis and release-notes
plugins. Conventional Commits decide whether changes need a release. Each
releasable update increments the counter from the latest reachable
`v0.1.0-beta.N` tag; docs-only changes do not release. Breaking changes during
this experimental line also increment the beta counter. Selecting a stable
line or another base version is a separate release-policy change.

The full semantic-release engine requires a normal release branch and defaults
to a first version of 1.0.0. Using its official plugins directly preserves the
requested sole-beta-branch setup without inventing a stable branch or a release
that never happened. The base line is declared in `release.config.mjs`.

The development manifest and ordinary local builds stay private. Only a valid
release plan sets the distribution version and removes `private` before packing.
Never edit a generated manifest or overwrite a previously shared archive.

## CI pipeline

The [CI workflow](https://github.com/ciqol/resenv/blob/beta/.github/workflows/ci.yml) builds one archive:

1. **Build:** normal npm installation, runtime/development audits, registry
   signatures, lint, strict types and colocated Vitest specs. The read-only
   planner generates the beta version and notes from Git history. Rollup builds
   it once; npm packs it and records SHA-256 and SHA-512 integrity.
2. **Consumers:** Linux Node 20, 22 and the pinned Node 24, plus macOS Node 24,
   install and test the same archive. Checks cover ESM, CJS, types, preloads,
   CLI, literal secret output and failure boundaries. Nothing is rebuilt.
3. **Release:** a manual dispatch from `beta` with `publish: true`, after every
   check passes. The protected job verifies hashes, workflow identity and the
   current branch head. It installs no project dependencies and runs no package
   code. `npm stage publish` submits the exact archive through OIDC with
   provenance and the explicit `beta` tag. The job validates and saves npm's
   staging receipt; no Git tag or GitHub release is created yet.
4. **Approval and recording:** the maintainer reviews and approves the staged
   package in npm using interactive 2FA. Wait for npm to make it available,
   update `latest` to the approved version, then rerun the original release job.
   It verifies the published integrity against the original tested archive and
   requires npm tags `beta` and `latest` to point to that version before creating
   its Git tag and GitHub prerelease. It does not stage or publish the package again.

Pushes, PRs and dispatches with `publish: false` cannot stage a package. Release
jobs are serialized and not cancelled. Artifacts last seven days. A fresh
workflow run is not a substitute for rerunning the original release job when
recovering an already staged/published candidate.

## Required setup

The existing npm trusted publisher must match:

| Field | Value |
| --- | --- |
| Provider | GitHub Actions |
| Organization | `ciqol` |
| Repository | `resenv` |
| Workflow filename | `ci.yml` |
| Environment | `release` |
| Permission | `npm stage publish` |

No permanent npm token or direct-publish permission is needed. The pinned
Node 24.19.0/npm 11.17.0 platform includes staged publishing. New trusted
publisher configurations must be validated by a successful CI operation before
the deadline shown in npm settings.

The GitHub environment `release` accepts only the `beta` branch and has no
required GitHub reviewers. CI submits staged packages; the maintainer approves
publication in npm. After reading back the branch policy and verifying npm
setup, set Actions variable `RELEASE_ENABLED=true`. Leave it unset until then
to prevent a dispatch from creating an unrestricted environment automatically.
Environment creation or protection changes require explicit authorization.

## Run a beta release

Open [CI](https://github.com/ciqol/resenv/actions/workflows/ci.yml), choose
**Run workflow**, select `beta`, and enable the staging input. When build and
consumer checks pass, the release job stages the archive without another GitHub
approval. Its summary and the `resenv-stage` artifact contain the stage
identifier and tested integrity.

Review the staged package in npm, then approve it with the stage identifier:

```sh
npm stage view <stage-id> --json
npm stage approve <stage-id>
```

These are maintainer review/approval commands; the archive is built and staged
by GitHub Actions. OIDC cannot perform the approval step. Wait for npm scanning
and public availability, then update the default install tag in the maintainer
session:

```sh
npm dist-tag add @ciqol/resenv@<approved-version> latest
```

Rerun the original release job to record the release. Verify the npm version,
`beta` and `latest` tags, archive integrity, provenance and GitHub
prerelease. Never infer success from a staging receipt alone.

For a hosted rehearsal, leave the staging input off. Local verification is:

```sh
npm ci
npm run audit
npm run release:check
```

None of these commands publishes. The planner can generate a non-publishing
plan with `node scripts/release-plan.mjs /absolute/path/to/candidate-directory`.

## Recovery and old versions

A failed stage operation creates no Git tag or GitHub release. Check npm before
retrying an ambiguous outcome: a staged version reserves its version number.
Do not attempt to stage it again while awaiting approval. Approve or reject the
existing stage through npm. Rejection requires a reviewed replacement candidate.

The original release job accepts an existing public version only if integrity
matches its candidate. A conflicting archive, changed beta head or conflicting
Git tag stops recovery. Keep the beta branch at the reviewed commit until the
release is recorded. If its artifact expires, review recovery separately.

Retain the `0.0.0-stage` placeholder until a functional beta is publicly
available and verified.
With explicit authorization, remove that exact placeholder version and check
remaining versions and tags. Never unpublish the whole package. npm's unpublish
policy still applies; deleted versions cannot be reused.
See [npm's policy](https://docs.npmjs.com/policies/unpublish/).

## Security and platform limits

The runtime package has no npm dependencies or advisory exceptions. Installed
runtime and development audits must pass with the unused engine/publisher peer graph
omitted. Audit and planning enforce that absence; the lockfile still records
the uninstalled peers. The existing November 9, 2026 review deadline remains
for the policy and separately reviewed platform npm. The privileged job does
not install release-tool modules. See [release security](release-security.md).

Doppler is the only built-in cloud provider. Authentication is owned by the
Doppler CLI; resenv reads its existing directory-scoped token or accepts
`DOPPLER_TOKEN` for unattended use. It does not manage native credential storage
or browser login. Standard Windows CLI discovery has injected coverage but no
native Windows end-to-end verification. Commands require explicit opt-in.
Dotenvx ciphertext is left unchanged. See [Security](../SECURITY.md).

Sources: [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/),
[staged publishing](https://docs.npmjs.com/cli/v11/commands/npm-stage/),
[semantic-release branching](https://semantic-release.org/foundation/workflow-configuration/).
