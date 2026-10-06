# Maturity evaluation

Evaluated on 2026-10-06 with the Tashtit maturity 0.3.1 catalog. Findings use
static working-tree evidence only; test runs and hosted checks are recorded
separately in [validation](validation.md). This score covers the catalog's
hygiene rules, not security certification or readiness to publish.

## Maturity: 88% (15/120 weight failing)

Discovery includes both the root npm project and its generated `dist/package.json`,
as the catalog requires every package manifest outside `node_modules`. Relevant
rules are counted once per npm project, and once per repository for hygiene/CI.

| Scope | Failing weight | Relevant weight |
| --- | ---: | ---: |
| Root npm project | 4 | 41 |
| Generated distribution | 11 | 23 |
| Repository hygiene | 0 | 24 |
| GitHub Actions | 0 | 32 |
| Total | 15 | 120 |

The maintained source tree alone scores 96% (4/97 weight failing). The full
score retains the generated-package findings rather than silently excluding
them. No Node Dockerfile exists, so Docker rules are not relevant.

### Findings (highest priority first)

- **[High] Generated package has no sibling lockfile** (`lockfile-missing`, 8)
  - Evidence: `dist/package.json:2`; no `dist/package-lock.json` exists.
  - Suggestion: a separately maintained npm project needs a lockfile. Here
    `dist` is generated from the root's committed v3 lockfile and installed by
    consumers with their own locks. It is intentionally not a second workspace.
  - Reference: [npm lockfiles](https://docs.npmjs.com/cli/configuring-npm/package-lock-json).
- **[Medium] CI disables dependency lifecycle scripts** (`npm-ignore-scripts`, 4)
  - Evidence: `.github/workflows/ci.yml:31` and `.github/workflows/ci.yml:76`.
  - Suggestion: document the policy or remove the flag if a reviewed dependency
    requires hooks. The policy is now documented in CONTRIBUTING and the
    workflow: required build steps run explicitly, and no install hook is needed.
    The catalog's literal flag detector still counts this finding.
  - Reference: [npm ci](https://docs.npmjs.com/cli/commands/npm-ci).
- **[Medium] Generated package has no sibling runtime-version file**
  (`setup-nvmrc`, 3)
  - Evidence: `dist/package.json:2`; no `dist/.nvmrc` exists.
  - Suggestion: use a version file for development projects. This distribution
    declares the supported runtime range and does not need development setup
    files. The maintained source uses the root `.nvmrc` at Node 24.19.0.
  - Reference: [nvm version files](https://github.com/nvm-sh/nvm#nvmrc).

### Passed checks

- The source has one v3 npm lockfile, `.npmrc`, `.nvmrc`, registry dependencies
  with exact direct versions, and clean CI installs through `npm ci`.
- CODEOWNERS contains a valid owner token; README, CONTRIBUTING and
  `.editorconfig` exist.
- CI exists with explicit scoped permissions, bounded job timeouts and no
  blanket token grants. There is no `pull_request_target` checkout.
- All remote actions have full commit pins except the GitHub-owned upload
  action's exact `v7.0.1` release tag, which the catalog explicitly permits.

### Not evaluated

- Docker rules: no candidate Dockerfiles.
- Live repository protections and owner access: outside this static catalog.
- Workflow behavior, provider login and runtime compatibility: outside the
  static evaluation; see the separately observed validation results.

### Fixable on request

No applicable automatic fix is appropriate. The only missing `.nvmrc` belongs
to generated output with a wide runtime range, so the catalog does not authorize
deriving a version for it. The remaining findings are documented report-only
items. No generated development files or install hooks were added to improve a
score.

## GitHub Actions standards review

The workflow retains stable lowercase `build`/`test` job identifiers, actual
default-branch pushes, pull-request validation and manual dispatch. Superseded
pull-request runs are cancelled; trusted runs may finish. Each job has only
`contents: read`, checkout credentials are not persisted, and no job publishes
or receives provider credentials. The build checks the TypeScript implementation,
then packs one archive for the compatibility matrix. Missing artifacts and
digest mismatches fail validation. No GitHub expression is interpolated into a
shell script. Repository access and release settings are unchanged.

Separate runtime evidence: the
[manual-dispatch CI run](https://github.com/ciqol/resenv/actions/runs/37472468215)
passed at `e0d6a8f`. This observation does not affect the static score. A
pull-request event has not been exercised while PR creation remains on hold.
