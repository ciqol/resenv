# @ciqol/resenv

[![🏗️ CI](https://github.com/ciqol/resenv/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/ciqol/resenv/actions/workflows/ci.yml)
[![NPM Version](https://img.shields.io/npm/v/@ciqol/resenv)](https://www.npmjs.com/package/@ciqol/resenv)
[![NPM Downloads](https://img.shields.io/npm/dm/@ciqol/resenv)](https://www.npmjs.com/package/@ciqol/resenv)

**Resolve secret references already in `process.env` before application code
runs.** Your existing loader, such as Nx, chooses and loads dotenv files;
resenv replaces references in memory. It never rewrites those files.

Doppler is the only built-in cloud provider. For example,
`API_TOKEN=doppler://my-project/dev/API_TOKEN` becomes the fetched secret in
`process.env.API_TOKEN`. Resolution happens once at startup; restart the
application to fetch updated values.

Requires Node.js 20 or later. The package has no runtime npm dependencies and
is experimental; its API may change between 0.x releases.

## When to choose resenv

Choose resenv when your Node.js application already loads its environment through
Nx, dotenv or another loader, and you want to resolve individual Doppler secret
references before application code runs. Each reference selects its own project
and config, so one application can use secrets from multiple Doppler configs.

For Git worktrees, keep reviewed reference configuration and the startup command
with the project so each checkout receives them without copying plaintext secrets.
Each worktree still needs the application's usual setup and configured Doppler
access. Your existing loader remains responsible for selecting and loading files.

## Install

Install in your application project:

```sh
npm install --save-exact @ciqol/resenv
```

The CLI examples use `npx --no-install` to run that installed copy. In an npm
script, use `resenv` directly.

## Use with Doppler

### 1. Authenticate

Install the [official Doppler CLI](https://docs.doppler.com/docs/cli#installation),
then log in from your application directory:

```sh
doppler login
```

resenv uses `DOPPLER_TOKEN` when supplied; otherwise it reuses the CLI login
selected for the application's working directory. Doppler owns login, logout
and credential storage. Missing credentials or access stop startup without
prompting for login.

For CI and other unattended environments, supply a suitably scoped
`DOPPLER_TOKEN` through your runner's secret facility; no CLI is needed.
See [authentication and platform details](https://github.com/ciqol/resenv/blob/main/docs/doppler.md)
for supported CLI locations and lookup rules.

### 2. Declare references

In the environment your application already loads, such as Nx's `.env.serve`:

```dotenv
API_TOKEN=doppler://my-project/dev/API_TOKEN
PORT=3000
```

Each reference names a project, config and secret. The authenticated identity
must have access to that secret. Plain values such as `PORT` pass through.

### 3. Preload on the application process

After your loader has populated the environment:

```sh
node --require @ciqol/resenv/resolve app.cjs
node --import @ciqol/resenv/resolve app.mjs
```

The preload replaces references before the application and its imports execute.
Alternatively, wrap a command whose environment is already populated:

```sh
npx --no-install resenv run -- node app.mjs
```

The wrapper passes the resolved environment to its child, inherits terminal I/O,
preserves exit status and forwards termination signals.

## Nx integration

Put the preload on the application's target, after Nx loads its dotenv files:

```json
{
  "name": "app",
  "targets": {
    "serve": {
      "executor": "nx:run-commands",
      "cache": false,
      "continuous": true,
      "options": {
        "command": "node --require=@ciqol/resenv/resolve app.mjs",
        "cwd": "{projectRoot}"
      }
    }
  }
}
```

Run `nx serve app`, using your application's existing path and target options.
For an existing `@nx/js:node` target, add:

```json
"runtimeArgs": ["--require", "@ciqol/resenv/resolve"]
```

Preloading the outer `nx` process runs too early. Keep the preload on each
application or build process that needs secrets, after its environment is loaded.
Secrets embedded in build output remain in that output.

## Library API

Call the synchronous resolver after loading the environment, before importing
modules that read configuration:

```js
import { resolve } from '@ciqol/resenv'

const childEnv = resolve()
resolve(process.env, { replace: true })
```

`resolve(env = process.env, options = {})` always returns an independent
resolved copy. CommonJS uses `require('@ciqol/resenv')`.

| Option | Default | Behavior |
| --- | --- | --- |
| `replace` | `false` | Also replace input values after all lookups succeed. Requires `process.env` or writable data properties. |
| `commands` | `false` | Execute whole-value `$(command)` expressions through POSIX `/bin/sh`. |
| `commandTimeoutMs` | `30000` | Per-command timeout in milliseconds; a positive integer up to `2147483647`. |

Doppler is inferred from original values. Without references, the result is an
unchanged copy and no credentials are accessed. Library failures throw
`ResenvError`; its `code` identifies the failure. CLI and preload failures exit
with a safe message.

## Resolution and safety

- All lookups must succeed before the input environment changes or a child starts.
- Only named secrets are fetched; repeated references share a request within a
  resolution pass. Values are not cached on disk.
- Fetched values stay literal, even if they contain another reference or `$()`.
- Shell commands require explicit opt-in and run with your permissions. Failed
  resolution cannot undo their file or network effects.
- Use one preload mode per process. Combining modes or a preload with the CLI
  fails with `CONFLICTING_PRELOADS`. Avoid additional resolvers in `NODE_OPTIONS`.
- Application code can read its secrets and any credentials supplied to it.

See [Doppler limits and compatibility](https://github.com/ciqol/resenv/blob/main/docs/doppler.md)
and [security guidance](https://github.com/ciqol/resenv/blob/main/SECURITY.md).

## Optional commands

Enable commands alongside Doppler references through the library:

```js
const env = resolve({ BUILD_LABEL: '$(printf local)' }, { commands: true })
```

Or use `resenv run --commands -- ...`, or preload
`@ciqol/resenv/resolve-commands`. The canonical `/resolve` preload leaves shell
expressions literal. Only use command mode with trusted configuration; see
[command limits](https://github.com/ciqol/resenv/blob/main/SECURITY.md#command-execution).

## Debug startup

```sh
NODE_DEBUG=ciqol:resenv node --require @ciqol/resenv/resolve app.mjs
```

For Nx, use `NODE_DEBUG=ciqol:resenv nx serve app`. Enable it when launching Node,
before dotenv loading. Diagnostics omit secrets, tokens, commands and provider
responses. `NODE_DEBUG=child_process` or `NODE_DEBUG=*` can expose credentials;
resenv blocks its subprocess operations in that mode. See
[diagnostic details](https://github.com/ciqol/resenv/blob/main/SECURITY.md#diagnostics).

## Further reading

Each npm package includes this README for its installed version. The
[repository README](https://github.com/ciqol/resenv#readme) and linked online
guides follow current development and may describe newer versions. GitHub
[releases](https://github.com/ciqol/resenv/releases) contain version change notes.

- [Contributing, development and tests](https://github.com/ciqol/resenv/blob/main/CONTRIBUTING.md)
- [Request provider or platform support](https://github.com/ciqol/resenv/issues/new)
- [Background: A new Git worktree shouldn't mean another copy of your secrets](https://dev.to/titanron/a-new-git-worktree-shouldnt-mean-another-copy-of-your-secrets-424)

## License

[MIT](LICENSE). Copyright (c) 2026 ciqol contributors.
