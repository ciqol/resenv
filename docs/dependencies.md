# Dependencies

resenv has no runtime npm dependencies. Build, test and release tools are
development-only and excluded from the consumer archive. Exact versions live
in the [source manifest](https://github.com/ciqol/resenv/blob/beta/package.json);
the lockfile pins their resolved artifacts.

## Tool choices

| Packages | Purpose | License |
| --- | --- | --- |
| `rollup`, `@rollup/plugin-typescript` | Compile TypeScript, preserve the module graph and generate declarations | MIT |
| `typescript` | Strict implementation, spec and consumer type checks | Apache-2.0 |
| `tslib` | Helpers used by the TypeScript build plugin | 0BSD |
| `@types/node` | Node platform types for the pinned development runtime | MIT |
| `eslint`, `typescript-eslint` | Lint source and tooling, including rules that use type information | MIT |
| `vitest`, `@vitest/coverage-v8` | Colocated unit tests and source coverage | MIT |
| `@semantic-release/commit-analyzer`, `@semantic-release/release-notes-generator` | Official Conventional Commit classification and release notes | MIT |

The [Doppler CLI](doppler.md) is a separately installed authentication helper,
owned and updated by the user. resenv does not download or vendor it. Supplying
`DOPPLER_TOKEN` avoids the CLI dependency.

## Installation policy

Use the Node version in `.nvmrc`, `npm ci` and normal npm lifecycle behavior.
Do not disable scripts globally. Review published install hooks and implicit
native builds when dependencies change. Rollup uses platform-specific optional
binaries; keep the Linux/macOS clean-install checks. The lockfile marks optional
`fsevents` as having an install script, although its reviewed artifact has no
install hook or `binding.gyp`; npm may warn about that metadata.

The committed `.npmrc` sets `omit=peer`. The two release plugins export the
standalone functions the planner uses, but declare the full `semantic-release`
engine as a peer for their usual integration. Omitting that unused peer also
keeps its npm/GitHub publisher dependency graph off disk. Audit and planning
guards require those modules to be unresolvable from the project and both
plugins. See [release security](release-security.md).

npm still resolves omitted peers into the lockfile. `npm ls` reports the
deliberately missing engine peers; an audit with `--include=peer` can report
vulnerabilities in those uninstalled entries. Do not conceal the peer warning
with `--force`, `--legacy-peer-deps` or an alias package. Restoring the engine
requires a dependency/security review and a deliberate guard change.

## Updating dependencies

Maintainers own dependency admission and updates. Keep direct versions exact
and review the manifest and lockfile diff, upstream source and release notes,
distributed licenses, provenance, advisories and install hooks. Keep Vitest and
its coverage provider compatible. Changes to release plugins also require
reviewing their standalone exports and executable guards.

Run `npm ci`, `npm run audit`, `npm audit signatures` and `npm run verify`.
Review hosted matrix checks before release. Record review evidence and check
results in the PR and CI; update this guide only when a lasting choice or
installation requirement changes. Do not append dated intake or test logs.

Official `actions/*` and `github/*` actions use exact release tags under the
repository's GitHub publisher trust policy. Other remote actions require full
commit SHAs. Review action source, permissions and license when updating them.
