# Contributing

resenv is being prepared for its first public release, version 0.1.0. Repository
access remains private, and `package.json` disables registry publication.

## Local development

Use the Node version in `.nvmrc` and npm:

```sh
nvm use
npm ci --ignore-scripts
npm run verify
```

Author library and CLI code as `.ts`; Rollup's TypeScript plugin produces both
module formats and declarations from that implementation. Colocate Vitest unit
specs as `*.spec.ts` beside each tested module and import its source. Keep
process, package and integration checks in `test/` as `.mjs`; they exercise
compiled output and installed packages. Tests use generated keys and dummy commands.
Never use real secrets in fixtures, terminal output, screenshots, issues, or
pull requests.

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
npm run test:coverage     # source unit coverage, text and lcov output
npm run test:integration  # process checks, requires a build
```

`npm test` runs unit and process tests. Mock or inject provider calls, credential
helpers, browser launchers and process control in unit tests. Keep checks that
spawn actual commands or temporary applications in `test/`. The unit coverage
report measures source and is separate from packed-package and process checks.

Dependency lifecycle hooks are disabled deliberately in `.npmrc` and CI. No
required build depends on an install hook; run the explicit build/check commands.
Reassess that assumption whenever adding a dependency that declares such a hook.

The package check packs `dist/` and installs that tarball into a temporary
consumer outside the repository. The install is offline, uses npm's existing
cache and the repository's reviewed runtime lock entries. It installs with
`npm ci` without needing cached registry metadata. It does not link the source
tree or publish. Run `npm ci` first to populate the archive cache. The check
exercises both module formats, CLI and preloads, shared error identity, single
preload execution and `.cts`/`.mts` consumer types.

Pass an existing archive to test the same build CI uses:
`npm run test:package -- /absolute/path/to/package.tgz`. The supplied package's
name, version, executable mode and manifest are checked before runtime probes.
`npm run verify` runs lint, typecheck, build and tests; `npm run release:check`
also previews the package contents. Neither publishes or creates a tag.

Rebuild after source, declarations, metadata or documentation changes. The build
cleans `dist/` first and generates its manifest from the root package. See
[docs/build.md](docs/build.md). Keep both package manifests private until a
separate release decision; never edit the generated manifest by hand.

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

To check ciphertext compatibility, separately install and review the upstream
package, then run:

```sh
node test/interop.mjs /absolute/path/to/node_modules/@dotenvx/primitives
```

These integration inputs are not runtime dependencies of resenv.

## Changes

Keep dotenv file discovery with the caller. Doppler is the only built-in cloud
provider; its authentication and lookups live under `src/doppler/`.
Preserve all-or-nothing environment updates, strict failures, explicit command
opt-in and literal handling of resolved values. Update the public API types and
documentation together with behavior changes.

Add regression tests for changed behavior and avoid real provider calls. Use
Conventional Commit subjects, for example `fix(resolver): preserve empty values`.
Dependency changes require an updated [review record](docs/dependencies.md).

CODEOWNERS identifies the maintainer. Keep bug reports and pull requests focused
on observable behavior and include the checks run. Weekly dependency updates are
grouped, with major version updates reviewed separately; bots cannot merge them.

Security reports follow [SECURITY.md](SECURITY.md). Publication and repository
visibility changes require a separate maintainer decision; see the
[release checklist](docs/releasing.md).
