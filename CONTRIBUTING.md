# Contributing

This guide covers changing resenv. Application installation and usage belong
in the [README](README.md). Read [repository instructions](AGENTS.md) before
editing or releasing, and work in an isolated task worktree on a `titan/*`
branch. Authenticate as `titan-ron` for [ciqol/resenv](https://github.com/ciqol/resenv).

Inspect Git status, branches, the push remote and recent commits before editing.
Check live GitHub checks, releases and npm metadata before release work; old chat
messages and check results are not authoritative. Never copy credentials between
sessions. `main` is the default and sole release branch; merge to protected
`main` approves publication. See [releasing](docs/releasing.md).

## Guides and code map

| Guide | Maintained information |
| --- | --- |
| [README](README.md) | Application installation, API and CLI usage |
| [Contributing](CONTRIBUTING.md) | Setup, tests, local consumers and dependency policy |
| [Security](SECURITY.md) | Trust boundaries, command limits, diagnostics and private reporting |
| [Doppler](docs/doppler.md) | Authentication, reference syntax, platforms and migration |
| [Releasing](docs/releasing.md) | Versioning, publishing, security review and recovery |

| Path | Responsibility |
| --- | --- |
| `src/index.ts` | Resolution API and atomic environment replacement |
| `src/preload.ts`, `src/resolve*.ts` | Startup integration and shared preload state |
| `src/doppler/` | References, HTTPS, concurrency and CLI credential lookup |
| `src/commands.ts` | Explicit shell substitution and process limits |
| `bin/resenv.ts` | Child-process CLI |
| `rollup.config.mjs`, `scripts/build.mjs` | CJS implementation, ESM facades, types and manifest |
| `release.config.mjs` | Standard semantic-release plugins and main/0.x policy |
| `.github/workflows/ci.yml` | Checks, one compiled build and publication on main merges |

## Local development

Use the Node version in `.nvmrc` and the pinned lockfile:

```sh
nvm use
npm ci
npm run verify
```

`npm run verify` runs lint, strict implementation/spec type checks, the build,
source coverage, process tests and installed-package checks. `npm run build`
builds without the other checks; after building, try
`node dist/bin/resenv.cjs --help`. The root and ordinary builds stay private.

Author library and CLI code as `.ts`. Colocate Vitest unit specs as `*.spec.ts`
beside the module they test and import source. Mock or inject provider calls,
credential lookup and process control. Keep process, package and integration
checks in `test/` as `.mjs`, exercising compiled output or installed packages.
Tests of repository-owned tooling use colocated `*.spec.mjs` files; do not
duplicate upstream semantic-release tests. Use dummy credentials and temporary
fixtures; never access a developer's credential store or authenticated provider.

```sh
npm run test:unit         # source unit specs, no build required
npm run test:watch        # watch unit specs
npm run test:coverage     # source coverage; 90% global floor
npm run test:integration  # process checks, requires a build
```

`npm test` runs unit and process tests. Coverage includes worker and preload
entry files; the CLI is checked by process and package tests. See
[build and CI](#build-and-ci) for platforms and coverage artifacts.

ESLint checks TypeScript with type information and the JavaScript build tooling.
Run `npm run lint:fix` for available fixes and preserve existing formatting.
Public object shapes use `type` and `readonly` properties; `Environment` remains
mutable for optional replacement. `npm run typecheck` checks implementation and
specs separately with `strict` and `noUncheckedIndexedAccess`. Rollup generates
module formats and declarations; do not maintain handwritten declarations.

### Package checks

`npm run test:package` packs `dist/` and installs the archive into a temporary
consumer outside the repository. It uses offline `npm ci` with the existing
cache and reviewed lock entries, so run `npm ci` first. It checks both module
formats, CLI, preloads, shared error identity and `.cts`/`.mts` consumer types.
It does not link source or publish.

To inspect an existing archive without rebuilding:

```sh
npm run test:package -- /absolute/path/to/package.tgz
```

Pass a public archive's version as the second argument when checking a release.
The check verifies metadata, executable mode and the consumer contract, including
that the bundled README matches this source revision. Supplementary guides stay
in the repository and use absolute links from the README.

Rebuild after source, declarations, metadata or README changes. The build cleans
`dist/` and generates its manifest from the root package. `npm run release:check`
runs verification and previews package contents without publishing or tagging.
See [build and CI](#build-and-ci) for the package architecture.

## Build and CI

Rollup's TypeScript plugin compiles the library/CLI to CommonJS while preserving
its module graph, then generates ESM facades from exported names. Both formats
load the same implementation, preserving error identity and shared preload state
([Node dual-package guidance](https://nodejs.org/api/packages.html#dual-commonjs-es-module-packages)).
The private `doppler-worker.cjs` supports synchronous HTTPS resolution and is
located through package self-resolution; it is packed but not publicly exported.

The root exports map defines public entries. Generated `.d.mts` and `.d.cts`
facades re-export a shared declaration graph in `dist/types/`. The distribution
has no package-wide `type` field, so the shared `.d.ts` graph describes CommonJS.
Consumer checks compile both module formats and reject invalid inputs.

The source targets ES2023 with `ES2024.String` declarations for `isWellFormed()`.
Use the Node version in `.nvmrc` for development; Node types stay on version 24.
Runtime tests check APIs against the oldest supported Node rather than relying
on compiler declarations alone. The build resolves `import.meta.url` to the Node
filename in CommonJS output and leaves Node built-ins external.

The build cleans `dist/`, derives its manifest from the root, rebases entry paths
and omits development dependencies, scripts, overrides and the `type` field.
It packages runtime modules, declarations, metadata, LICENSE and this revision's
README. The executable is `bin/resenv.cjs`; only exports-map entries are public.
Contributor/security guides and `docs/` stay in the repository. Ordinary builds
retain `private: true`; publication is covered by [releasing](docs/releasing.md).

CI audits dependencies, verifies registry signatures and checks lint, types and
source coverage, then builds one private archive. The same bytes pass package
and process checks on Linux Node 20/22/24 and macOS with the pinned Node version;
matrix jobs never recompile. Coverage runs once and is uploaded separately for
same-repository PRs and main. Archives and coverage reports are retained for
seven days. Keep check names aligned with required CI/CodeQL contexts.

## Try changes in an application

To create a local archive:

```sh
npm run build
npm run pack:local
```

Install it from the application's directory:

```sh
npm install --save-exact /absolute/path/to/ciqol-resenv-0.1.0.tgz
```

This changes that application's manifest and lockfile; the archive must exist
wherever dependencies are installed. Keep distributed archives immutable and
use a new archive version for changed behavior. Inspect the installed runtime
tree against the [dependency policy](#dependencies).

To try changes without altering application CI, retain its existing installation
and link this checkout's built `dist/` at the application's ignored
`node_modules/@ciqol/resenv`. Keep references in an ignored `.env.serve.local`
and target edits local. Leave its manifest, lockfile and CI unchanged. Rebuild
resenv and restart the application after changes; application `npm ci` can
remove the link. Authenticate with `doppler login` from the application directory.
Real login is a manual integration check owned by the Doppler CLI.

### Optional integration checks

`npm run bench` measures fresh-process startup, a plain environment and mocked
provider lookups. It needs a build, contacts no provider and has no timing gate.

With an existing, reviewed Nx installation:

```sh
npm run test:nx -- /absolute/path/to/workspace/node_modules
```

This creates a temporary workspace to check target-file loading, precedence and
resolution with dummy data. It uses no source-workspace dotenv files,
credentials or remote cache.

## Dependencies

resenv has no runtime npm dependencies. Development tools are excluded from the
consumer package; exact versions and integrity live in `package.json` and
`package-lock.json`. The Doppler CLI is installed and managed separately by users.

| Packages | Purpose | License |
| --- | --- | --- |
| `rollup`, `@rollup/plugin-typescript` | CommonJS, ESM facades and declarations | MIT |
| `typescript` | Strict implementation and consumer checks | Apache-2.0 |
| `tslib` | Build-time compiler helpers | 0BSD |
| `@types/node` | Pinned runtime types | MIT |
| `eslint`, `typescript-eslint` | Source and tooling lint | MIT |
| `vitest`, `@vitest/coverage-v8` | Unit tests and coverage | MIT |
| `semantic-release` | Version, tag and release orchestration | MIT |
| `@semantic-release/commit-analyzer`, `@semantic-release/release-notes-generator` | Commit classification and release notes | MIT |
| `@semantic-release/npm`, `@semantic-release/github` | Official npm/GitHub publishing | MIT |

Use normal npm lifecycle behavior. Review required hooks and implicit native
builds when changing dependencies; record setup requirements and review evidence
in the PR. Rollup uses platform-specific optional binaries, so preserve clean
Linux/macOS install checks. Do not globally disable scripts, use force or legacy
peer resolution, patch installed files, or disguise findings with lock metadata.

Standard semantic-release and its official plugins provide the release flow.
Use npm's official bundle unchanged and inspect its bundled components when
upgrading. Verify registry signatures and attestations on changes; provenance
alone does not establish account ownership or maintainer MFA. Canonical sources:
[semantic-release](https://github.com/semantic-release/semantic-release),
[npm plugin](https://github.com/semantic-release/npm),
[GitHub plugin](https://github.com/semantic-release/github).

Maintainer `titan-ron` owns dependency updates, advisory review and removal.
Weekly updates are grouped, with major versions reviewed separately; bots cannot
merge. Run `npm ci`, `npm run audit`, `npm run audit:tooling`,
`npm audit signatures` and `npm run verify` when changing dependencies. Review
runtime and release-tool exposure under [release security review](docs/releasing.md#security-review).
Keep dated findings, download counts and other review snapshots in PRs or CI.

## Submitting changes

Keep dotenv discovery with the caller, provider inference tied to original
values, fetched output literal and commands explicitly enabled. Preserve atomic
environment replacement and one public `resolve()` function that always returns
an independent copy, replacing input only with `{ replace: true }`.

Update types and docs with behavior changes. Add regression tests using dummy
data. Use Conventional Commit subjects such as
`fix(resolver): preserve empty values`. CODEOWNERS identifies the maintainer.
Keep reports and PRs focused on
observable behavior and include checks run; use [SECURITY.md](SECURITY.md) for
private vulnerability reporting.

Keep documentation focused on current contracts, lasting decisions and procedures.
The README covers consumers; this guide owns contributor and build workflows.
Keep provider details and release procedures in the linked guides, and per-run
test results, benchmarks and audit evidence in PRs or CI.
