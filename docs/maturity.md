# Maturity evaluation

Evaluated on October 13, 2026 with the Tashtit maturity 0.3.1 catalog, using
static working-tree evidence only. This measures the catalog's repository
hygiene rules; it does not certify security or readiness to publish. Tests
and hosted checks are recorded separately in [validation](validation.md).

This score predates the maintainer's exact-release-tag policy for official
GitHub actions. That policy follows the GitHub Actions skill's publisher
exception; the older catalog's SHA-only rule will flag those tags.

## Maturity: 91% (11/120 weight failing)

The maintained source tree scores 100% (0/97 weight failing). The full catalog
also discovers the generated `dist/package.json`, so its findings are retained.

| Scope | Failing weight | Relevant weight |
| --- | ---: | ---: |
| Root npm project | 0 | 41 |
| Generated distribution | 11 | 23 |
| Repository hygiene | 0 | 24 |
| GitHub Actions | 0 | 32 |
| Total | 11 | 120 |

## Findings

- **High: generated package has no sibling lockfile** (`lockfile-missing`, 8).
  Evidence: `dist/package.json:2`; no `dist/package-lock.json` exists. A maintained
  npm project needs a lockfile. This directory is generated from the root's v3
  lockfile and consumers maintain their own locks; it is not another workspace.
  Reference: [npm lockfiles](https://docs.npmjs.com/cli/configuring-npm/package-lock-json).
- **Medium: generated package has no sibling runtime-version file**
  (`setup-nvmrc`, 3). Evidence: `dist/package.json:2`; no `dist/.nvmrc` exists.
  Development projects should pin a runtime. The generated package declares
  `engines.node: >=20` and does not need contributor setup files. The root
  `.nvmrc` pins Node 24.19.0. Reference: [nvm version files](https://github.com/nvm-sh/nvm#nvmrc).

## Passed checks

- Root: one v3 npm lockfile, no competing yarn lockfile, `.npmrc`, `.nvmrc`, and
  registry dependencies with exact direct versions. CI uses `npm ci` and
  normal lifecycle behavior; it does not pass `--ignore-scripts`.
- Repository: valid CODEOWNERS syntax, README, CONTRIBUTING and `.editorconfig`.
- CI: a parseable workflow, explicit scoped token permissions, bounded job
  timeouts, no `pull_request_target`, and full commit pins for every remote action.

The earlier 88% score included a lifecycle-script finding that is now resolved.
No dependency installation, build, test, or remote request was used to derive
this static score.

## Not evaluated by this catalog

- Docker rules: no candidate Dockerfile exists.
- Repository protections, private vulnerability reporting and maintainer access.
- License suitability, secret history, provider login, and runtime behavior.

See [public readiness](public-readiness.md) for the separate exposure audit and
[validation](validation.md) for observed checks.

## Fixable findings

No automatic fix is appropriate. The generated package's broad runtime range
does not identify a development version to pin, and adding another lockfile
would misrepresent it as a maintained workspace.

## Tashtit plugin review — 2026-10-13

The installed catalog contains 13 plugins. Nine apply to this repository:

| Plugin | Application |
| --- | --- |
| engineering-standards | Atomic resolution, bounded effects and existing failure tests |
| typescript-style-standards | Strict types, readonly public shapes and typed lint; preserve local style |
| typescript-library-build | Generated manifests, shared CJS/ESM identity and packed runtime/type consumers |
| dependency-standards | Exact development pins, review records and expiring executable advisory guards |
| logging-standards | Value-free diagnostics, safe error codes and synthetic leak checks |
| github-actions-standards | Exact official release tags under the publisher exception; isolate coverage writes |
| git-workflow | Signed Conventional Commits on a local task branch; delivery follows repository policy |
| maturity | Static score and generated-output findings above |
| repository-governance | Settings audit and approved, verified security changes in [public readiness](public-readiness.md) |

The remaining plugins do not call for changes: agent-parity concerns machine
configuration; api-design-standards concerns server HTTP contracts;
architecture-diagrams concerns C4 views; repository-onboarding duplicates the
existing maintainer handoff for this already-familiar checkout. No runtime
dependency, logging framework, diagram or style migration is needed.
