# Maintainer handoff

## Start a session

Open the repository folder as its own Codex project. Use the same checkout for
local work or create an isolated worktree for a separately authorized task.
Read [AGENTS.md](https://github.com/ciqol/resenv/blob/beta/AGENTS.md), [CONTRIBUTING.md](../CONTRIBUTING.md) and
[the release guide](releasing.md). Inspect `git status`, the current branch,
the push remote and recent commits before changing anything.

The repository is [ciqol/resenv](https://github.com/ciqol/resenv). Authenticate
GitHub as `titan-ron` using the repository-local credential setup in AGENTS.md.
`beta` is the default and sole release branch. Work on a `titan/*` branch;
when a PR is requested, push that temporary branch and leave `beta` unchanged
for review. Never commit directly on the default branch. The repository stores
all source, tests, build configuration and operating instructions needed to continue.
Do not depend on previous chat history or copy credentials between sessions.

## Product contract

- Package: `@ciqol/resenv`; CLI: `resenv`.
- Node preloads: `--require @ciqol/resenv/resolve` and
  `--import @ciqol/resenv/resolve`.
- Public API: `resolve(env = process.env, { replace: false })`. Always return a
  copy; update the input only with `replace: true`.
- Let Nx or the caller load dotenv files. Resolve values already in the
  environment, once before application imports.
- Doppler is the only cloud provider. Infer it from
  `doppler://project/config/SECRET_NAME`; that syntax belongs to resenv.
- Commands require explicit opt-in. Fetched values remain literal, and a
  failed pass leaves the caller's environment unchanged.
- Debug selector: `NODE_DEBUG=ciqol:resenv`. Never log secret values, tokens,
  command text or provider response bodies.
- Authentication: use `doppler login/logout`; resenv only reads the existing
  CLI token for the application working directory, or an explicit
  `DOPPLER_TOKEN`. No native storage or resenv login lifecycle.
- Runtime npm dependencies: none. Dotenvx decryption has been removed;
  `encrypted:` values remain literal.

## Code map

| Path | Responsibility |
| --- | --- |
| `src/index.ts` | Resolution API and atomic replacement |
| `src/preload.ts`, `src/resolve*.ts` | Startup integration and shared preload state |
| `src/doppler/` | Reference parsing, HTTPS, bounded concurrency and CLI credential lookup |
| `src/commands.ts` | Explicit shell substitution and process limits |
| `bin/resenv.ts` | Child-process CLI |
| `rollup.config.mjs`, `scripts/build.mjs` | CJS implementation, shared ESM facades and generated types |
| `scripts/release-plan.mjs` | Official semantic-release analysis/notes plugins and beta counter |
| `scripts/publish.mjs` | OIDC staging of the tested archive and post-publication tag recording |
| `.github/workflows/ci.yml` | Build once, test the archive across runtimes, manually dispatched release |

## Verify changes

Use the exact Node.js version in `.nvmrc` and normal npm lifecycle behavior:

```sh
nvm use
npm ci
npm run audit
npm run verify
```

Unit specs live beside source modules and run with Vitest. Process tests live
in `test/`. Clean-consumer checks exercise CJS, ESM, declarations, CLI and
preloads against the packed archive. Tests use dummy values and mocked effects;
do not use a developer's Doppler account or OS credential store as a fixture.
See CONTRIBUTING for Nx integration checks and benchmarking.

## Recover release state before pushing

Read current state rather than treating a dated handoff as authoritative:

```sh
gh run list --repo ciqol/resenv --workflow ci.yml --limit 5
gh release list --repo ciqol/resenv
npm view @ciqol/resenv versions dist-tags --json
npm stage list @ciqol/resenv --json
```

Inspect the tested archive's README as well as the source README before release.
The first public beta shipped obsolete archive-only installation instructions;
later source corrections cannot update an already published archive. Package
checks now enforce npm installation guidance and README equality with the
checkout. Ship documentation corrections in a new tested release through the
same staging and approval workflow.

The first intended version is `0.1.0-beta.1`; npm tags `beta` and `latest` point
to the same tested beta release. The planner uses semantic-release's official
commit-analysis and notes plugins directly;
it does not install or run the full semantic-release engine. The committed
`.npmrc` omits that unused peer, and audit/planning guards enforce its absence.
Real published release tags
supply later beta counters. Do not fabricate tags to advance a version.

Publishing is staged: a trusted manual CI dispatch submits the exact archive
that passed all consumer checks. The `release` environment accepts only `beta`
and has no GitHub reviewer gate. npm approval with 2FA makes a stage public.
After public availability, the maintainer updates npm's `latest` tag to the
approved version. Rerun the original release job to verify integrity and both
npm tags, then record its Git tag and GitHub prerelease. Keep `beta` at that
candidate's commit until this step finishes, unless the maintainer explicitly
chooses to reject and replace the pending stage. Do not rerun the whole
workflow to recover an existing stage.

A staged version reserves its version number. To replace an unapproved
candidate, the maintainer must reject the old stage with npm 2FA before CI
stages the replacement. Check stage status before retrying an ambiguous result.
Never publish from a developer machine, add a publishing token, or delete the
whole npm package. The `0.0.0-stage` placeholder must remain until a functional
beta is public; removing the last published version
would remove the package and impose npm's publishing cooldown.

## Known limits and follow-ups

- Doppler CLI discovery covers standard macOS/Linux paths and per-user WinGet
  and Scoop on Windows. Native Windows end-to-end execution is not yet verified.
  Automated lookup checks use dummy executables and injected effects, never a
  developer login or credential store. Earlier native resenv logins are ignored;
  see [authentication and migration](doppler.md).
- The installed runtime and development audits pass after omitting the unused
  engine and publisher peer graph. Keep the committed `.npmrc` policy; audit
  and planning fail if the engine or publishing modules become resolvable.
  `npm ls` reports the intentionally missing engine peers; official standalone
  plugin behavior is covered directly. See [dependency review](dependencies.md).
- The November 9, 2026 review deadline remains in the exception policy and
  publisher's platform-npm guard. It was introduced with the October 10 review;
  it is a project review deadline. Do not extend or bypass it. See
  [release security](release-security.md).
- This beta has not had an independent security audit. Passing tests or the
  static maturity checklist does not establish production readiness.
- Consumer repositories are separate. Keep local links out of their committed
  package manifests, lockfiles and CI.
