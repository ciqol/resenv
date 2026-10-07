# Build and package contract

The repository is one Node.js package. The library and CLI are authored in
strict TypeScript. Vitest unit specs use colocated `*.spec.ts` files. Process,
package and integration checks and build orchestration use `.mjs`. Rollup's official
TypeScript plugin compiles the implementation; consumers need no TypeScript
loader or compiler.

```sh
npm ci
npm run build
npm test
npm run test:package
```

## Output

| Public entry | ESM | CommonJS | Declarations |
| --- | --- | --- | --- |
| `@ciqol/resenv` | `index.mjs` | `index.cjs` | `index.d.mts`, `index.d.cts` |
| `@ciqol/resenv/resolve` | `resolve.mjs` | `resolve.cjs` | `resolve.d.mts`, `resolve.d.cts` |
| `@ciqol/resenv/resolve-commands` | `resolve-commands.mjs` | `resolve-commands.cjs` | `resolve-commands.d.mts`, `resolve-commands.d.cts` |
| `@ciqol/resenv/resolve-doppler` | `resolve-doppler.mjs` | `resolve-doppler.cjs` | `resolve-doppler.d.mts`, `resolve-doppler.d.cts` |

These paths are relative to `dist/`. The executable points to
`bin/resenv.cjs`; Rollup also emits its ESM wrapper. The command's user-facing
name stays `resenv`.

`resolve` reads the inherited environment and replaces Doppler references with
their fetched values before application code starts. Doppler is the only
built-in cloud provider. The earlier decryption path for original ciphertext
also remains implemented. `resolve-doppler` imports that same preload, so loading
both names does not resolve fetched output again. Arbitrary commands require the
separate `resolve-commands` entry or `run --commands`.

The private `doppler-worker.cjs` entry lets synchronous preloads wait for HTTPS
without turning the public CommonJS API into a promise. The worker is packed
alongside the entries but is not a public export. It is located through package
self-resolution, so the installed tarball does not depend on source paths.

The root exports map defines the public entries. The build compiles their
source with Rollup and its TypeScript plugin, then generates ESM facades from the exported
names. Both formats load one CommonJS implementation. This preserves error
class identity and shares the module cache when both preload forms are used.
It follows Node's documented mitigation for the
[dual-package hazard](https://nodejs.org/api/packages.html#dual-commonjs-es-module-packages).

The CommonJS build preserves the module graph. Source unit specs import their
adjacent modules; higher-level process and clean-consumer checks exercise the
compiled modules and the same archive. Matrix jobs do not recompile TypeScript. Only the
entries in the exports map are public package imports.

Runtime and peer dependencies stay external. The crypto library is still loaded
only when ciphertext needs decryption, using Node's `createRequire` API in the
ESM source. The build resolves `import.meta.url` to the Node filename in CJS
output; browser-like globals in a Node test environment cannot change it.
[Rollup's external option](https://rollupjs.org/configuration-options/#external)
controls which imports remain outside the bundle.

The compiler emits declarations into `dist/types/`. Generated `.d.mts` and
`.d.cts` entry facades re-export that shared declaration graph; there is no
handwritten public declaration file or separate declaration-bundler dependency.
The generated package has no `type` field, so its shared `.d.ts` graph describes
the CommonJS implementation. The exports map lists `types` first and selects
the entry facade for the consumer's
module format, as described by
[TypeScript's ESM/CommonJS package guidance](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-7.html).
Consumer compilation checks both formats, including invalid inputs that must
remain type errors.

Public options use type aliases and readonly properties. `Environment` stays
mutable for optional in-place replacement. `resolve()` always returns a new
`Environment`, with input replacement enabled only by `{ replace: true }`. It
does not preserve a generic input type: resolved strings cannot retain a
literal reference type. This intentionally tightens the unpublished API.
ESLint uses type information and enforces the selected style rules. The compiler
checks all library/CLI source, colocated unit specs and both consumer formats with `strict` and
`noUncheckedIndexedAccess`. Provider responses and parsed worker input start as
`unknown` and are validated before use. Compiler failures stop the build.

The source target is ES2023. `ES2024.String` supplies the declaration for
`isWellFormed()`, whose availability is also checked by the Node 20/22/24 runtime
tests. Node types match the Node 24 development toolchain; the runtime matrix
remains necessary to detect use of APIs absent from the oldest supported Node.

## Generated manifest and packing

The build removes stale output first. It derives `dist/package.json` from the
root manifest, rebases entry paths, and omits development dependencies, scripts,
overrides and a package-wide `type` field. Explicit `.mjs` and `.cjs` extensions
select the output format. README, contributor/security guides and docs are
copied; `LICENSE` will be copied once the license choice is settled.

Both manifests retain `private: true`. This intentionally overrides the normal
publishable-manifest convention while the repository remains an unpublished
prototype. There is no publishing workflow.

`npm run pack:local` packs the generated directory. `npm run test:package`
instead packs into a temporary directory and installs it offline into a clean
consumer. It checks imports, requires, preloads, CLI behavior and declarations;
the consumer cannot load resenv's source files or build dependencies. The
runtime entries from the repository lockfile are used in the consumer lockfile.
Its only direct dependency is the packed archive. An offline `npm ci` verifies
archive integrity and installs the reviewed versions without registry metadata.

With `npm run test:package -- /path/to/package.tgz`, the same checks inspect
and install the supplied archive without rebuilding it. Its name, version,
manifest and executable mode must match the package contract. CI uses this
form so every platform checks the same built bytes.

Keep tarballs already consumed by other projects immutable. No existing
consumer artifact is rebuilt in place by these tests.

## CI

The `build` job uses normal npm lifecycle behavior, checks dependency advisories and
signatures, runs typed lint, implementation/spec checks and Vitest source coverage,
builds once and uploads the packed
archive. The `test` matrix downloads that artifact, verifies the installed
package, extracts the same build
for the process tests, and never recompiles it. The matrix checks Node 20
and 22 on Linux plus the `.nvmrc` version on Linux and macOS.

Jobs have read-only repository permissions and receive no application or
registry secrets. Missing artifacts and digest mismatches fail the run. The
archive is retained for seven days for maintainer review. The workflow has no
publish or deploy step. Hosted results must be observed before treating the
workflow definition as a passing CI run.

Checkout and setup/download actions use full commit pins. The GitHub-owned
upload action uses the Tashtit exception for a complete release tag; major tags
and third-party movable refs are not permitted. Installs use normal npm lifecycle
behavior, and dependency updates require an install-hook review. Build commands
run explicitly.
See the [maturity evaluation](maturity.md) for the static catalog results.
