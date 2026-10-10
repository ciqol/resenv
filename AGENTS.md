# resenv

Node.js package: `@ciqol/resenv`, MIT licensed, copyright ciqol contributors.
The user approved public source and the transition to `beta` as the sole remote
and default branch. PR creation remains on hold. Keep the development root and
ordinary local builds private. CI generates the release version before packing,
with semantic-release on the normal branch `beta` and npm channel `beta`.
The first computed version is `1.0.0`, without a `-beta.N` suffix.

Publish only through the manually dispatched GitHub Actions workflow, after all
candidate checks. Never publish from a developer machine or request local npm
login. The user manages npm-side ownership and authentication. The OIDC path
requires an existing package and a matching trusted publisher; do not assume it
bootstraps an unpublished package. No npm publishing tokens are configured.
The `release` environment requires explicit approval before initial creation.
Keep `RELEASE_ENABLED` unset until its protections and npm setup are verified.
Never create tags before successful publication of the tested archive.

Release planning uses bounded, expiring development advisory exceptions with
executable guards. Read `docs/release-security.md` before changing release tools.
Do not broaden the exceptions, bypass their expiry or pass release-tool modules
to the privileged publisher. The platform npm CLI review is recorded separately.

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
Use `npm run release:check` for non-publishing local verification. Hosted
checks plan a version and test the final archive; publication is a separate
manual workflow input. CI's push filter is `beta`.
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
