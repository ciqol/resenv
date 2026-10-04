# resenv

Private Node.js package: `@ciqol/resenv`. Keep the GitHub repository private,
both package manifests `private: true`, and the package unpublished until the
user explicitly approves release. The license remains `UNLICENSED` pending a
separate license choice.

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

## Local consumers

Cachely is a separate repository. Keep local links and secret references out of
its committed manifests, lockfile and CI. Do not publish or push Cachely changes
as part of resenv work unless the user explicitly requests that.
