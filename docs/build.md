# Build and package contract

The repository is one Node.js package. All authored JavaScript uses `.mjs`;
CommonJS is generated for consumers that call `require` or use `--require`.

```sh
npm ci --ignore-scripts
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
source with Rollup, then generates ESM facades from the compiler's exported
names. Both formats load one CommonJS implementation. This preserves error
class identity and shares the module cache when both preload forms are used.
It follows Node's documented mitigation for the
[dual-package hazard](https://nodejs.org/api/packages.html#dual-commonjs-es-module-packages).

Runtime and peer dependencies stay external. The crypto library is still loaded
only when ciphertext needs decryption, using Node's `createRequire` API in the
ESM source. The build resolves `import.meta.url` to the Node filename in CJS
output; browser-like globals in a Node test environment cannot change it.
[Rollup's external option](https://rollupjs.org/configuration-options/#external)
controls which imports remain outside the bundle.

The existing public declaration source is copied into format-specific files.
The exports map lists `types` first and selects declarations for the consumer's
module format, as described by
[TypeScript's ESM/CommonJS package guidance](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-7.html).
Consumer compilation checks both formats, including invalid inputs that must
remain type errors.

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
existing runtime lock versions are applied through consumer overrides.

Keep tarballs already consumed by other projects immutable. No existing
consumer artifact is rebuilt in place by these tests.

## CI

CI installs with scripts disabled, builds once per job, runs the unit/process
tests, then verifies that same built package. The matrix checks Node 20 and 22
on Linux plus the `.nvmrc` version on Linux and macOS. Jobs have read-only
repository permissions and receive no application or registry secrets.
The workflow has no publish or deploy step. Hosted results must be observed
before treating the workflow definition as a passing CI run.
