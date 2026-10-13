# Contributing

Starting a new session? Read the [maintainer handoff](docs/maintainer-handoff.md)
and [repository instructions](https://github.com/ciqol/resenv/blob/beta/AGENTS.md) before editing or releasing.

The [README](README.md) covers using resenv in an application. This guide covers
changing resenv itself and verifying those changes.

Releases start at `0.1.0-beta.1` on the sole branch `beta`, using npm tags
`beta` and `latest` for the same tested version. Semantic-release's official
commit-analysis and release-notes plugins select releasable changes and generate
notes; actual beta tags supply the next
prerelease counter. The root and ordinary local builds remain private prototypes.
CI generates the publishable manifest before packing and testing it, then stages
the exact archive through npm OIDC for maintainer approval. See
[releasing](docs/releasing.md) and the bounded [release-tool review](docs/release-security.md).
The source uses the [MIT license](LICENSE), copyright ciqol contributors.

## Local development

Use the Node version in `.nvmrc` and npm:

```sh
nvm use
npm ci
npm run verify
```

`npm run verify` is the complete local check: lint, strict source/spec type
checks, build, unit/process tests and installed-package checks. To build without
running the checks, use `npm run build`.

After building, try the CLI from this checkout:

```sh
node dist/bin/resenv.cjs --help
```

Author library and CLI code as `.ts`; Rollup's TypeScript plugin produces both
module formats and declarations from that implementation. Colocate Vitest unit
specs as `*.spec.ts` beside each tested module and import its source. Build and
release scripts have colocated `*.spec.mjs` Vitest specs. Keep
process, package and integration checks in `test/` as `.mjs`; they exercise
compiled output and installed packages. Tests use dummy credentials and commands.
Never use real secrets in fixtures, terminal output, screenshots, issues, or
pull requests.

Provider detection belongs to the original environment values, including library
calls without options. Keep shell execution behind `commands: true`, preserve
literal fetched output, and validate references before any command runs.

ESLint applies rules that use type information to the TypeScript implementation and specs
and checks the JavaScript build tooling.
Use `npm run lint:fix` for available automatic fixes; preserve the repository's
existing compact formatting. Public object shapes use `type` with `readonly`
properties. `Environment` is intentionally mutable because in-place resolution
updates it. `npm run typecheck` checks the entire library and CLI with `strict`
and `noUncheckedIndexedAccess`. A separate spec configuration checks tests without
shipping them in JavaScript or declarations. Do not maintain separate handwritten declarations.

```sh
npm run test:unit         # colocated Vitest specs, no build required
npm run test:watch        # watch unit specs while editing
npm run test:coverage     # source unit coverage, text, lcov and Cobertura output
npm run test:integration  # process checks, requires a build
```

`npm test` runs unit and process tests. Mock or inject provider calls, credential
helpers, browser launchers and process control in unit tests. Keep checks that
spawn actual commands or temporary applications in `test/`. The unit coverage
report measures source and is separate from packed-package and process checks.
`npm run verify` enforces a 90% global floor for source statements, branches,
functions and lines. Worker and preload entry files stay in the denominator;
the CLI is checked separately by process and packed-package tests. CI retains
LCOV and Cobertura reports for seven days in the `resenv-coverage` artifact.
The official `actions/upload-code-coverage` action uploads Cobertura in a separate
job; fork PRs retain the local gate and reports but cannot upload. The Linux
Node 24 job also checks real Secret Service storage with dummy tokens in an
isolated D-Bus session and temporary keyring, never a developer credential store.

Use normal npm lifecycle behavior locally and in CI. Review install hooks,
including implicit native builds, when changing dependencies; record any
required setup in [the dependency review](docs/dependencies.md). Suppressing
lifecycle hooks can skip required setup, so it is not part of the standard
installation commands. The explicit build/check commands remain required.

The package check packs `dist/` and installs that tarball into a temporary
consumer outside the repository. The install is offline, uses npm's existing
cache and the repository's reviewed runtime lock entries. It installs with
`npm ci` without needing cached registry metadata. It does not link the source
tree or publish. Run `npm ci` first to populate the archive cache. The check
exercises both module formats, CLI and preloads, shared error identity, single
preload execution and `.cts`/`.mts` consumer types.

Pass an existing archive to test the same build CI uses:
`npm run test:package -- /absolute/path/to/package.tgz`. For a final CI candidate,
also pass its `release.json` as the second argument. The supplied package's
name, version, executable mode and manifest are checked before runtime probes.
The README inside the archive must match the checkout, install from npm's
`beta` channel and avoid unpublished or local-archive installation guidance.
`npm run verify` runs lint, typecheck, build and tests; `npm run release:check`
also previews the package contents. Neither publishes or creates a tag.

Rebuild after source, declarations, metadata or documentation changes. The build
cleans `dist/` first and generates its manifest from the root package. See
[docs/build.md](docs/build.md). Ordinary local builds remain private. Only a validated CI release plan removes
that guard from the distribution manifest; never edit it by hand.

## Try changes in an application

### Install a local archive

From the resenv checkout:

```sh
npm run build
npm run pack:local
```

Install the resulting archive from the application's directory:

```sh
npm install --save-exact /absolute/path/to/ciqol-resenv-0.1.0-beta.1.tgz
```

This changes the application's manifest and lockfile. The archive must exist
wherever it installs dependencies. Use a new archive version for changes to an
already shared build; never overwrite an archive another project uses. Root
package overrides do not propagate to consumers; inspect the installed tree
against [the dependency review](docs/dependencies.md).

### Try local changes without changing the application's CI

Link this checkout's built `dist/` directory at the application's ignored
`node_modules/@ciqol/resenv`, retaining any existing installation first. Keep
references in an ignored `.env.serve.local` and the application's target edit
local. Leave its manifest, lockfile and CI configuration unchanged.

Rebuild resenv after source, metadata or documentation changes and restart the
application. An application `npm ci` can remove the link; recreate it when needed.
If you only created the package link, run its CLI directly:

```sh
node node_modules/@ciqol/resenv/bin/resenv.cjs login doppler
```

For login from the resenv checkout, use
`node dist/bin/resenv.cjs login doppler`. Real login is a manual integration
check; automated tests must use injected or mocked credentials.

## Optional integration checks

`npm run bench` measures fresh-process startup, a plain 200-variable environment,
and a mocked provider with eight distinct lookups. It needs a build first and
does not contact a provider. Timings are observations, not CI pass/fail thresholds.
See [the review](docs/security-performance-review.md) for the recorded comparison.

With an existing Nx installation:

```sh
npm run test:nx -- /absolute/path/to/workspace/node_modules
```

This creates a temporary Nx workspace and checks target-file loading,
precedence and secret resolution with dummy values. It does not use the
source workspace's dotenv files, credentials or remote cache.

## Changes

Keep dotenv file discovery with the caller. Doppler is the only built-in cloud
provider; its authentication and lookups live under `src/doppler/`.
Preserve all-or-nothing environment updates, strict failures, explicit command
opt-in and literal handling of resolved values. Update the public API types and
documentation together with behavior changes.

Keep one public resolver, `resolve()`. It always returns an independent
resolved copy and replaces input values only with `{ replace: true }`. Preloads
enable that option; the CLI passes the returned copy to its child process.

Add regression tests for changed behavior and avoid real provider calls. Use
Conventional Commit subjects, for example `fix(resolver): preserve empty values`.
Dependency changes require an updated [review record](docs/dependencies.md).

CODEOWNERS identifies the maintainer. Keep bug reports and pull requests focused
on observable behavior and include the checks run. Weekly dependency updates are
grouped, with major version updates reviewed separately; bots cannot merge them.

Keep the README focused on installation, authentication, application integration,
API behavior and troubleshooting. Put contributor tooling, test commands and
local development instructions here; detailed internals belong in `docs/`.

Security reports follow [SECURITY.md](SECURITY.md). Publication and repository
visibility changes require a separate maintainer decision; see the
[release checklist](docs/releasing.md).

npm releases run only through GitHub Actions with npm trusted publishing (OIDC).
The maintainer configures the npm side. Local development and release checks
do not require `npm login`; do not publish from a developer machine or add npm
publishing tokens. CI must publish the exact candidate archive that its tests
verified.
