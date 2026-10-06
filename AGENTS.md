# resenv

Private Node.js package: `@ciqol/resenv`. Keep the GitHub repository private,
both package manifests `private: true`, and the package unpublished until the
user explicitly approves release. The license remains `UNLICENSED` pending a
separate license choice.

The requested first public version is 0.1.0. Earlier versions were unpublished
prototypes; preserve their archives and validation history. Hold PR creation,
public visibility, tags and publishing until explicitly requested. The release
preparation and settings decisions are recorded in `docs/releasing.md`.

## Implementation

- Author JavaScript in `.mjs`; Rollup generates CommonJS and ESM facades.
- Edit `src/`, `bin/`, tests and docs; regenerate `dist/` with `npm run build`.
- `@ciqol/resenv/resolve` is the canonical preload. Infer providers from values
  already in `process.env`. Let Nx or the caller choose and load dotenv files.
- Keep arbitrary shell commands explicitly enabled. Fetched and decrypted
  output stays literal, and failures must leave the caller's environment intact.
- Never print credentials, fetched values, commands or provider response bodies.
- Never commit dotenv files, credentials, tarballs or `node_modules`.
- Keep already distributed local tarballs immutable. Build a new version for
  changed package behavior.

## Verification

Use the Node version in `.nvmrc` and the pinned lockfile.

```sh
npm ci --ignore-scripts
npm run build
npm test
npm run test:package
```

For Nx integration, pass an existing, reviewed installation:
`npm run test:nx -- /absolute/path/to/workspace/node_modules`.
Tests must use dummy credentials and temporary fixtures. No test may depend on
the developer's OS credential store or authenticated provider access.

`npm run verify` runs the build and tests. CI builds one archive and all matrix
jobs test that same archive through `npm run test:package -- <archive.tgz>`.
Use `npm run release:check` for the non-publishing preparation check. Keep
the CI push filter aligned with GitHub's actual default branch.

## Local consumers

Cachely is a separate repository. Keep local links and secret references out of
its committed manifests, lockfile and CI. Do not publish or push Cachely changes
as part of resenv work unless the user explicitly requests that.
