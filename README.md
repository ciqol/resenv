# @ciqol/resenv

**Replace references already in `process.env` with their resolved values at
application startup.** Your existing loader, such as Nx, chooses the dotenv
files. resenv resolves the resulting environment before application code runs.

**Doppler is the only built-in cloud provider.** A value such as
`doppler://my-project/dev/API_TOKEN` tells resenv which secret to fetch. The
application then reads the actual value from `process.env.API_TOKEN`.

```text
Nx or another loader sets process.env
                  |
resenv fetches the referenced values and replaces them in memory
                  |
Application starts with ordinary environment values
```

Resolution happens once at startup. It does not watch the provider for changes;
restart the application to fetch updated values. No filename is passed to
resenv, and dotenv files are never rewritten.

Requires Node.js 20 or later. This is an experimental beta, published on npm's
`beta` channel.

## Install

Install the beta in your application project:

```sh
npm install --save-exact @ciqol/resenv@beta
```

This records the selected beta version in your project's manifest and lockfile.
The `latest` tag points to the same beta; omitting `@beta` installs it too.

The CLI examples below use `npx --no-install` to run the copy installed in your
project. In an npm script, use `resenv` directly.

## Use with Doppler

Doppler manages application secrets. If you're new to it, start with
[Doppler's introduction](https://docs.doppler.com/docs/start).

### 1. Authenticate locally

Follow the [official Doppler CLI installation guide](https://docs.doppler.com/docs/cli#installation)
for your operating system, then log in from your application directory:

```sh
doppler login
```

Each developer authenticates with their own Doppler access.

> [!WARNING]
> Authentication and credential storage depend on the Doppler CLI's implementation
> and may vary by platform or CLI version. resenv only reuses its existing token;
> it does not manage login, logout or credential storage, or access the OS
> credential store directly.

At startup, resenv uses `DOPPLER_TOKEN` when supplied; otherwise it reads the
existing Doppler CLI token for the application's working directory. It then
fetches only referenced secrets through the HTTPS API. Missing credentials or
access stop startup without opening a browser or prompting for login.

For CI and other unattended environments, supply `DOPPLER_TOKEN` through your
runner's secret facility; the CLI is not needed in that mode. See
[Doppler authentication and platform details](docs/doppler.md), including
migration from the earlier resenv-managed login.

Need another secrets provider, operating system or CLI installation method?
[Request support](https://github.com/ciqol/resenv/issues/new) with your use case
and platform details.

### 2. Declare references in the environment your app already loads

For example, in an Nx application's `.env.serve`:

```dotenv
API_TOKEN=doppler://my-project/dev/API_TOKEN
PORT=3000
```

The reference contains the Doppler project, config and secret name. This is
resenv's reference syntax. Plain values such as `PORT` pass through unchanged.
The reference itself grants no access: the authenticated identity needs
permission to read that secret. Doppler references need no dotenvx private key.

### 3. Preload resenv on the application process

Once the environment has been loaded:

```sh
node --require @ciqol/resenv/resolve app.cjs
node --import @ciqol/resenv/resolve app.mjs
```

The preload replaces `process.env.API_TOKEN` before the application and its
imports execute. It infers Doppler from the value, so no provider flag is needed.

Alternatively, wrap a command whose environment is already populated:

```sh
npx --no-install resenv run -- node app.mjs
```

The wrapper supplies resolved values to the child process. It inherits
stdin/stdout/stderr, preserves exit status and forwards SIGINT, SIGTERM and
SIGHUP to that child. On POSIX, the child runs in its own session so terminal
signals reach it only through the wrapper.

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

Run `nx serve app`. Nx selects `.env.serve` and any applicable overrides,
then starts the application with resenv. Use your application's existing path
and target options. For an existing `@nx/js:node` target, add:

```json
"runtimeArgs": ["--require", "@ciqol/resenv/resolve"]
```

Preloading the outer `nx` process runs too early. A shell-wide `NODE_OPTIONS`
setting also affects unrelated processes. Keep the preload on the application
target. If a build needs secrets, its process needs its own integration after
its environment is loaded; values embedded in build output remain in that output.

## Resolution behavior

- Only the enabled reference forms are resolved. Ordinary values pass through.
- Doppler fetches only the named secrets; repeated references share one request
  within a resolution pass. Values are not cached on disk.
- All lookups must succeed before the environment is changed or a child starts.
  Missing access, malformed references and provider failures stop startup.
- Fetched values stay literal, even if they contain `$()` or another reference.
- The canonical preload leaves shell expressions literal. Executing commands
  requires the separate opt-in described below.
- Application code can read its resolved environment. Access to the same
  credentials also permits other code or sessions to retrieve those secrets.

See [Doppler limits](docs/doppler.md#resolution-and-security-boundaries) and
[security guidance](SECURITY.md).

## Library API

Call the library after your loader has populated the environment, before
importing modules that read configuration:

```js
import { resolve } from '@ciqol/resenv'

const childEnv = resolve()

// Also replace values in process.env; the returned copy can be ignored.
resolve(process.env, { replace: true })
```

`resolve(env = process.env, options = {})` always returns a new resolved
environment. `replace` defaults to `false`, leaving the input unchanged. With
`replace: true`, it also replaces values in the input after every lookup succeeds;
the return value is still an independent copy.

Providers are inferred from each original value, just as with `/resolve` and
`run`. Doppler is the only supported cloud provider today. No options are
required: without references, the result is an unchanged copy and no credentials
are accessed. An environment can contain several references, including different
Doppler projects/configs. Each value selects its own source; a command can supply
a Doppler token. Commands still require
`commands: true`. Returned secret values are never interpreted again.

CommonJS uses the same API through
`require('@ciqol/resenv')`. Both formats share the `ResenvError` class, whose
`code` identifies the failure. CLI and preload failures exit with a safe message.

Using `replace: true` requires `process.env` or writable data properties. A read-only
property, setter or Proxy target fails before any replacement is committed.
Keep the default copy mode for inputs that should remain unchanged. The Node
preloads enable in-place replacement so application imports see resolved values.

## Debug startup

```sh
NODE_DEBUG=ciqol:resenv node --require @ciqol/resenv/resolve app.mjs
```

For the Nx target above, use `NODE_DEBUG=ciqol:resenv nx serve app`. Set `NODE_DEBUG`
when launching Node, before dotenv loading. Diagnostics use `node:util`'s
`debuglog` and are off by default:

```text
CIQOL:RESENV 12345: Replaced secret value for "API_TOKEN".
CIQOL:RESENV 12345: Done: replaced 1 secret value(s).
```

With no matching references, the only message is `Nothing to handle.` Failures
include a safe error and completion summary. Logs omit values, tokens, command
text and provider responses; no log files are created.

`NODE_DEBUG=child_process` (including `NODE_DEBUG=*`) makes Node print spawn
options containing credentials. resenv blocks its subprocess operations with
`UNSAFE_DEBUG_LOGGING` in that mode. Use `NODE_DEBUG=ciqol:resenv` instead.

## Optional commands

- **Opt-in shell commands:** `/resolve-commands` resolves complete `$(command)`
  values through `/bin/sh`. The canonical `/resolve` preload leaves these values
  literal for both `--require` and `--import`, including when `RESENV_COMMANDS`
  is set in the environment. `resenv run --commands -- ...` enables commands
  alongside inferred Doppler references, as does the command preload. Use only
  trusted configuration; commands run with your permissions. A timeout limits
  execution time, but cannot undo file changes, network requests or other effects.
  Leave this option disabled when the environment can contain untrusted input.
  Commands have closed stdin, a 30-second timeout and a 64 KiB combined output
  limit. Trailing LF characters are removed; fetched output stays literal.
  Embedded forms such as `prefix$(command)suffix` are unsupported.

Values beginning with `encrypted:` are left unchanged. resenv resolves cloud
references; dotenvx decryption is outside its scope. The package has no runtime
npm dependencies.

`/resolve-doppler` is an equivalent name for `/resolve`; `run --doppler` remains
accepted. New integrations should use the canonical entry points above.

Use one preload mode per process. Combining `/resolve` and `/resolve-commands`
or combining a preload with `resenv run` fails with `CONFLICTING_PRELOADS` to
prevent reinterpreting fetched values. Do not configure a second resolver in
the child process through `NODE_OPTIONS` or other launch hooks.
For both modes together, use `resenv run --commands -- ...` or one library call
with `{ commands: true }`.

## Contributing

For checkout setup, building, testing, trying local changes in another project
and submitting fixes, see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE). Copyright (c) 2026 ciqol contributors.
