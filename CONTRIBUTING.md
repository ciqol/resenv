# Contributing

resenv is being prepared for a public release. Repository access remains
private, and `package.json` disables registry publication.

## Local development

Use the Node version in `.nvmrc` and npm:

```sh
nvm use
npm ci --ignore-scripts
npm run build
npm test
npm run test:package
```

Author JavaScript as `.mjs`; the Rollup build produces both module formats and
matching TypeScript declarations. Tests use generated keys and dummy commands. Never use real secrets in
fixtures, terminal output, screenshots, issues, or pull requests.

The package check packs `dist/` and installs that tarball into a temporary
consumer outside the repository. The install is offline, uses npm's existing
cache and pins the reviewed runtime dependency versions. It does not link the
source tree or publish. Run `npm ci` first to populate the cache. The check
exercises both module formats, CLI and preloads, shared error identity, single
preload execution and `.cts`/`.mts` consumer types.

Rebuild after source, declarations, metadata or documentation changes. The build
cleans `dist/` first and generates its manifest from the root package. See
[docs/build.md](docs/build.md). Keep both package manifests private until a
separate release decision; never edit the generated manifest by hand.

## Optional integration checks

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

Security reports follow [SECURITY.md](SECURITY.md). Publication and repository
visibility changes require a separate maintainer decision; see the
[release checklist](docs/releasing.md).
