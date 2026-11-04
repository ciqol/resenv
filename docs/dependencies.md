# Dependencies

resenv has no runtime npm dependencies. All tools are development-only and
excluded from the consumer package. Exact direct versions and archive integrity
live in package.json and package-lock.json. Use the pinned Node version and
normal `npm ci`; review install hooks instead of disabling them globally.

| Packages | Purpose | License |
| --- | --- | --- |
| `rollup`, `@rollup/plugin-typescript` | CommonJS, ESM facades and declarations | MIT |
| `typescript` | Strict implementation and consumer checks | Apache-2.0 |
| `tslib` | Build-time compiler helpers | 0BSD |
| `@types/node` | Pinned runtime types | MIT |
| `eslint`, `typescript-eslint` | Source and tooling lint | MIT |
| `minimatch`, `@isaacs/nonrecursive-glob-match` | Transitive lint file-pattern matching | BlueOak-1.0.0 |
| `vitest`, `@vitest/coverage-v8` | Unit tests and coverage | MIT |
| `semantic-release` | Standard version, tag and release orchestration | MIT |
| `@semantic-release/commit-analyzer`, `@semantic-release/release-notes-generator` | Commit classification and release notes | MIT |
| `@semantic-release/npm`, `@semantic-release/github` | Official npm/GitHub publishing | MIT |

## Release tooling

The user selected standard semantic-release on main instead of maintaining a
custom staging/finalization lifecycle. The official engine and plugins provide
the release conventions and integrations that would otherwise need custom code.
They are pinned to 25.0.9 (engine), 13.2.0 (npm), and 12.0.10 (GitHub), alongside
the existing analysis/notes plugins. npm is pinned transitively to 11.21.1 so its
bundled implementation remains reviewable.

Use npm's official bundle unchanged. The lockfile describes the original registry
artifact, without development aliases or postinstall file replacements. Upgrade
through published upstream releases and inspect the bundled versions on disk.

Canonical sources are [semantic-release](https://github.com/semantic-release/semantic-release),
[npm plugin](https://github.com/semantic-release/npm) and
[GitHub plugin](https://github.com/semantic-release/github). Distributed artifacts
declare MIT, have no install hooks, and expose npm provenance attestations.
The packages share four listed maintainers and each receives over 12 million
monthly npm downloads; published updates support the pinned Node runtime.
Registry signatures and attestations must be verified on changes. Public npm
metadata does not establish individual maintainer MFA or complete account
ownership history; provenance and the existing official namespace are the
available trust evidence.

## Lint pattern matching

Scoped overrides pin the `minimatch` dependency of `eslint`,
`@eslint/config-array` and `@typescript-eslint/typescript-estree` to the official
11.0.4 release. This fixes pattern amplification
([GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249))
without replacing files inside npm's published bundle. Remove the overrides
when these callers declare a fixed compatible version themselves.

Minimatch 11 replaces its regular-expression matcher and removes `makeRe`,
`matchOne` and `AST`. These lint callers use the retained `Minimatch` constructor,
`match` method and `minimatch` function; they do not use those removed APIs.
The supported Node versions include the repository's Node 20/22/24/26 matrix.
Its new transitive matcher is pinned to 1.0.3 by the lockfile. Both packages use
BlueOak-1.0.0, have no install hooks, and come from the existing upstream
maintainer's [minimatch](https://github.com/isaacs/minimatch) and
[matcher](https://github.com/isaacs/nonrecursive-glob-match) repositories.

Keep the npm-plugin override independent: npm's bundled minimatch and other
components still require an official npm release containing their fixes.
An override for a lint caller must not rewrite bundled-package lock metadata or
make an unresolved npm advisory appear fixed. Verify registry signatures,
unchanged lint file coverage and the full package checks after updates.

## Toolchain boundaries

The engine/plugin tree invokes Git and npm, reads/writes repository/package
files and contacts GitHub/npm. It runs with release authority only after the
protected merge. Runtime advisories block CI; the full development/release-tool
audit remains visible and requires exposure review before merge. Findings that
threaten credentials or artifact integrity block publication. Bundled npm components
must be reviewed on disk, not just through root overrides. See
[release security](release-security.md).

Maintainer `titan-ron` owns updates, advisory review and removal. Replacing this
toolchain means changing release.config.mjs and the trusted release job; it does
not alter the library runtime. Review any replacement if upstream becomes
unsuitable. Keep review evidence in PRs.

The Doppler CLI is separately installed and managed by the user. Rollup uses
platform-specific optional binaries; preserve clean Linux/macOS install checks.
The optional fsevents lock metadata can advertise an install script even when
its reviewed archive contains neither an install hook nor binding.gyp.

Run `npm ci`, `npm run audit`, `npm run audit:tooling`, `npm audit signatures`,
and `npm run verify`.
Official GitHub actions use exact release tags under the repository publisher
policy; other remote actions require full SHAs.
