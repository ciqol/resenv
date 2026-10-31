# resenv

Node.js package: `@ciqol/resenv`, MIT licensed, copyright ciqol contributors.
Start each session with [the maintainer handoff](docs/maintainer-handoff.md),
then inspect Git, GitHub and npm for current state; this chat is not required.
The user approved public source and `main` as the default and sole release
branch. Merge is the release approval: require a PR, passing checks, resolved
review threads and squash merging, with no direct-push bypass. Open PRs only
when asked, using temporary `titan/*` branches. Never merge without explicit
approval. No separate npm or GitHub environment approval is required.

Use standard semantic-release with its official commit-analysis, release-notes,
npm and GitHub plugins. Publish regular `0.x.x` versions to npm `latest` while
in initial development; `0.x.x` is not a SemVer prerelease. Breaking commits bump
the minor version until a reviewed 1.0 transition. The real `v0.1.0` release is
the baseline; use the engine's normal versioning and tag-before-publish behavior.
Keep local builds and the root private. Prefer the official plugin defaults;
do not add release wrappers, formatting overrides or tests of the release engine.

Publish only from GitHub Actions after pushes to protected `main` and all CI
checks pass. Manual dispatch runs checks only. Use npm OIDC with direct publish
permission, workflow `ci.yml`, environment `release`. Keep that environment
restricted to `main`, without required reviewers. No npm tokens, local publishing
or local npm login. The user manages npm ownership and authentication. Keep
`RELEASE_ENABLED` disabled until protection and npm setup are verified.

Read `docs/release-security.md` before changing release tools. Audit the complete
installed tree at moderate severity and preserve the review expiry. Do not add
advisory exceptions or bypass audit failures to make a release pass. Release
tools run only in the trusted release job. Remove obsolete npm versions only
with explicit authorization; never unpublish the entire package.

## Implementation

- Author the library and CLI in strict TypeScript. Rollup's TypeScript plugin
  generates CommonJS, ESM facades and declarations from the implementation.
- Colocate Vitest unit tests as `*.spec.ts` beside the source module they test.
  Unit specs import source and use injected or mocked external effects.
  Keep process, package and integration checks in `test/` as `.mjs`; those
  checks import compiled modules or exercise the packed artifact.
- Edit `src/`, `bin/`, tests and docs; regenerate `dist/` with `npm run build`.
- `@ciqol/resenv/resolve` is the canonical preload. Infer providers from values
  already in the environment, including library calls without options. Let Nx or
  the caller choose and load dotenv files.
- Keep one public `resolve()` function. Always return an independent resolved
  copy; replace input values only when `replace: true` is explicitly enabled.
  The Node preloads enable replacement; the CLI uses the returned copy.
- Delegate authentication to the official Doppler CLI. Read its existing
  directory-scoped token or an explicit `DOPPLER_TOKEN`; do not implement login,
  logout, browser authorization or direct OS credential storage.
- Keep arbitrary shell commands explicitly enabled. Fetched
  output stays literal, and failures must leave the caller's environment intact.
- Never print credentials, fetched values, commands or provider response bodies.
- Never commit dotenv files, credentials, tarballs or `node_modules`.
- Keep already distributed local tarballs immutable. Build a new version for
  changed package behavior.
- Keep docs focused on current contracts, lasting decisions and procedures.
  Record per-run test results, benchmarks, audit snapshots and session history
  in PRs or CI; do not create or append repository log documents.

## Verification

Use exact `vX.Y.Z` release tags for official `actions/*` and `github/*` actions.
The repository intentionally trusts GitHub as publisher; do not replace these
with commit digests or floating major tags. Other remote actions require full SHAs.

Use the Node version in `.nvmrc` and the pinned lockfile.

```sh
npm ci
npm run verify
```

For Nx integration, pass an existing, reviewed installation:
`npm run test:nx -- /absolute/path/to/workspace/node_modules`.
Tests must use dummy credentials and temporary fixtures. No test may depend on
the developer's OS credential store or authenticated provider access.

`npm run verify` runs typed lint, strict implementation checks, the build and tests.
`npm run test:unit` runs Vitest specs; `npm run test:coverage` measures source
unit coverage. `npm run test:integration` runs process tests against `dist/`.
The compiler checks unit specs separately and excludes them from build output.
Public object shapes use type aliases and readonly properties; `Environment`
remains mutable. Preserve existing formatting and run `npm run lint:fix`
for available fixes. Add no lint suppressions to bypass the contract.
CI builds one archive and all matrix jobs test that same archive through
`npm run test:package -- <archive.tgz>`.
Source unit specs run before the CI build; matrix jobs run only higher-level
tests against that archive and never recompile the source.
Use `npm run release:check` for non-publishing local verification. CI compiles
once and matrix jobs test that private archive. The release job consumes this
build, updates package metadata through the official npm plugin, and repeats
package consumer checks for the final version without recompiling. No stage,
finalizer, polling workflow or release queue is used.

README documents how application users install and use resenv. Contributor setup,
tests, local linking and release preparation belong in CONTRIBUTING.md and docs/.
Keep these guides in the repository. The npm package ships runtime modules,
declarations, metadata, LICENSE and a short README from README.npm.md linking to
the latest repository docs. Do not attach an additional npm archive to GitHub releases.
Use normal npm lifecycle behavior; review required dependency hooks rather than
globally disabling scripts in setup, package checks or CI.

## Local consumers

Consumer applications live in separate repositories. Keep local links and secret
references out of their committed manifests, lockfiles and CI. Do not publish or
push consumer changes as part of resenv work unless the user explicitly requests
that.

## Git and account boundaries

- Resolve repository ownership from the push remote. This repository belongs to
  `ciqol`; use GitHub account `titan-ron`, never a Copilot identity.
- Before GitHub access, unset `GH_TOKEN` and `GITHUB_TOKEN`, switch with
  `gh auth switch --hostname github.com --user titan-ron`, and configure only
  `git config --local credential.https://github.com.helper '!gh auth git-credential'`.
  Keep both token variables unset for subsequent Git/GitHub commands.
- Never write global Git configuration. Before committing, verify that
  `git config --get --show-origin user.name` and the matching `user.email`
  resolve from repository-local configuration and match `titan-ron`. If either
  is missing, global, or inconsistent, ask instead of setting an identity.
- Commit on a `titan/*` branch, never `beta`, `main`, `master`, or the default
  branch. Use Conventional Commits and preserve signing. Add no co-author
  trailers or attribution footers.
- Keep `main` as the default and sole release branch. Temporary `titan/*` remote
  branches are allowed for requested PRs. Deliver through protected PR merges;
  never push task commits directly to `main` or force-push the default branch.
- Open PRs only when asked. Do not merge, enable auto-merge, change visibility,
  collaborators, permissions or protections without explicit authorization.
- Keep credentials, dotenv files, local consumer links and employer-specific
  names or URLs out of commits, issues and release notes.
