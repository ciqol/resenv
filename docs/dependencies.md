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

## Lint glob matching

Scoped overrides pin the `minimatch` used by ESLint, `@eslint/config-array` and
`@typescript-eslint/typescript-estree` to 11.0.1 for the
[glob preprocessing denial of service fix](https://github.com/isaacs/minimatch/security/advisories/GHSA-g3hv-75wg-m249).
These consumers use `Minimatch` construction, `match()` and `minimatch()`, which
remain available. Version 11 removes `makeRe()`, regular-expression entries in
`Minimatch.set` and other APIs, so do not apply this override globally or to
npm's bundled `glob`. Remove the scoped overrides when the parent packages
support the fixed major themselves.

[minimatch](https://github.com/isaacs/minimatch) retains its existing maintainer
and BlueOak-1.0.0 license. Its new matcher,
[`@isaacs/nonrecursive-glob-match`](https://github.com/isaacs/nonrecursive-glob-match),
comes from the same maintainer under the same permissive license; the lockfile
pins its registry archive and integrity. Both run in the lint process, have no
registry-install lifecycle hooks, and stay outside the consumer archive. Neither
package provides an npm provenance attestation; verify registry signatures and
review source and distributed artifacts on updates. The normal lint, strict
type, build and package checks validate the toolchain with these overrides.

These overrides do not fix npm's bundled dependencies. Keep their advisories
visible and follow the release-tool exposure review and deadline; do not treat a
clean runtime audit as resolution of development or release-tool findings.
