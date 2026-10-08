# resenv

Private Node.js package: `@ciqol/resenv`. Keep the GitHub repository private,
both package manifests `private: true`, and the package unpublished until the
user explicitly approves release. The source is MIT licensed, with copyright
held by ciqol contributors.

The user selected `beta` as the sole normal release branch for semantic-release,
with `beta` as the npm channel. Its planned initial version is `1.0.0`, installed
with `@ciqol/resenv@beta`. The branch is not configured with `prerelease`;
versions therefore have no `-beta.N` suffix. This replaces the earlier
`1.0.0-beta.1` and 0.1.0 plans. Release tooling intake is blocked by an unpatched
high-severity dependency advisory. The current
0.1.0-beta.1 manifest remains a private prototype until tool-derived versioning
is available. Earlier versions were unpublished
prototypes; preserve their archives and validation history. Hold PR creation,
public visibility, tags and publishing until explicitly requested. The user
requested the beta release on October 8; tags and beta publication are now
authorized once the remaining dependency and registry requirements
are met. Keep repository visibility private and PR creation on hold. The release
preparation and settings decisions are recorded in `docs/releasing.md`.

Publish npm releases only through GitHub Actions using npm trusted publishing
(OIDC). The user manages the npm-side configuration. Do not publish from a
developer machine, request local npm login, or introduce npm publishing tokens.
Local npm authentication is not a release prerequisite. Keep version selection
automated with semantic-release and publish the exact archive verified by CI.

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
- Keep arbitrary shell commands explicitly enabled. Fetched and decrypted
  output stays literal, and failures must leave the caller's environment intact.
- Never print credentials, fetched values, commands or provider response bodies.
- Never commit dotenv files, credentials, tarballs or `node_modules`.
- Keep already distributed local tarballs immutable. Build a new version for
  changed package behavior.

## Verification

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
Use `npm run release:check` for the non-publishing preparation check. The CI push
filter includes `beta` and the current `titan/beta` preparation branch; the
remote default-branch change and older-branch cleanup remain pending. After that
transition, keep it aligned with the actual default branch and approved release branches.
Beta publication must use the `beta` npm dist-tag; never promote it to `latest`.

README documents how application users install and use resenv. Contributor setup,
tests, local linking and release preparation belong in CONTRIBUTING.md and docs/.
Use normal npm lifecycle behavior; review required dependency hooks rather than
globally disabling scripts in setup, package checks or CI.

## Local consumers

Consumer applications live in separate repositories. Keep local links and secret
references out of their committed manifests, lockfiles and CI. Do not publish or
push consumer changes as part of resenv work unless the user explicitly requests
that.
