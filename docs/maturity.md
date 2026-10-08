# Maturity evaluation

Evaluated on October 8, 2026 with the Tashtit maturity 0.3.1 catalog, using
static working-tree evidence only. This measures the catalog's repository
hygiene rules; it does not certify security or readiness to publish. Tests
and hosted checks are recorded separately in [validation](validation.md).

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
  timeouts, no `pull_request_target`, and pinned remote actions. The GitHub-owned
  upload action's exact `v7.0.1` tag is permitted by the catalog.

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
