# envref

Resolve dotenvx `encrypted:` values, Doppler references and opted-in
`$(command)` values already loaded into `process.env`, just before an application
starts. Nx keeps ownership of dotenv discovery and precedence, including target
files such as `.env.serve`.

The repository is currently private and the package is unpublished. Public
release preparation is tracked in [the release checklist](docs/releasing.md).
Requires Node.js 20 or later; use the version in `.nvmrc` for development.

## Choose an entry point

| Input | Node preload | Command wrapper |
| --- | --- | --- |
| Encrypted values and inferred cloud references | `--require @ciqol/envref/register` | `envref run -- <command>` |
| Command references, with optional encryption | `--require @ciqol/envref/register-commands` | `envref run --commands -- <command>` |

Your existing loader supplies the environment. envref resolves it in memory
before application imports, and stops startup if resolution fails.
The canonical preload infers the provider from each value: `doppler://` uses
Doppler and `encrypted:` uses dotenvx-compatible decryption. No provider flag
or file argument is required. Plain values, ordinary URLs and `$()` stay literal.
`register-doppler` and `run --doppler` remain compatibility aliases.

## How it works

```text
Nx loads the task's dotenv files into the environment
                  |
envref resolves enabled commands, Doppler references, then original ciphertext
                  |
Application starts with ordinary environment values
```

Supply `DOTENV_PRIVATE_KEY` through your existing secret manager or runtime
environment. Anyone with a matching private key can decrypt those values.
Your provider controls access and storage. A Doppler reference or an opted-in
command can fetch the key. No envref account is needed. Doppler login saves its
access token in your OS credential store.

Alternatively, command mode can fetch individual secrets through each user's
existing provider login. This needs no dotenvx decryption key for those values.
Continue using dotenvx to create and rotate encrypted values.
Do not commit private keys or plaintext secrets. This repository ignores all
`.env` files.

## Fetch individual cloud secrets

### Doppler through HTTPS

Log in with `envref login doppler`, then use a reference in the dotenv file
Nx already loads:

```dotenv
API_TOKEN=doppler://your-project/dev/API_TOKEN
```

Enable `--require @ciqol/envref/register` on the application process,
or run `envref run -- node app.mjs` inside the Nx target. Both CommonJS
and ESM preloads are supported. Reference syntax belongs to envref; it is not
an official Doppler standard.

Login first tries the browser flow used by Doppler's official MCP client and
stores the credential in macOS Keychain or Linux Secret Service. The Doppler
CLI is a fallback for login or an existing credential. The browser protocol is
not a public OAuth contract; normal secret reads use the documented API.
See [Doppler setup, fallback rules and platform limits](docs/doppler.md).
If your shell already contains the references, `envref login` infers the
provider too. It does not read dotenv files; `envref login doppler` also works
before Nx loads them. Startup reports a missing login without opening a browser.

### Arbitrary provider commands (explicit opt-in)

Install your provider's CLI and authenticate as yourself. For Doppler, use
[`doppler login`](https://docs.doppler.com/docs/cli#authentication) with your own
account. Your login must cover the worktree directory. Each developer receives
access through Doppler; no shared envref or dotenvx master key is needed.

In an existing dotenv file managed by Nx, such as `.env.serve`:

```dotenv
API_TOKEN="$(doppler secrets get API_TOKEN --plain --project your-project --config dev)"
```

Replace the project, config and secret name with your own. Explicit project and
config flags make the reference independent of directory-specific Doppler setup.

For `@nx/js:node`, enable command mode on the application process:

```json
"runtimeArgs": ["--require", "@ciqol/envref/register-commands"]
```

For an npm script or Nx command target:

```sh
envref run --commands -- node app.cjs
```

Nx loads the dotenv value, envref captures the command's stdout, and the app
receives the resulting secret in `process.env.API_TOKEN`. Files are not
rewritten. The same mechanism works with other authenticated CLI tools.

Command mode executes trusted repository configuration as shell code with your
user's permissions. It is explicitly enabled by the preload or CLI flag; an
environment variable cannot enable it. The normal `register` preload and
`envref run -- ...` continue to leave `$(...)` text literal.

### Command syntax and behavior

- Available on macOS and Linux through `/bin/sh`; native Windows is unsupported.
- The entire value must be `$(command)`. This version does not implement
  dotenvx's embedded form such as `prefix$(command)suffix`. Use a command that
  prints the complete value instead. Nested commands, quoting and pipes inside
  the outer expression are parsed by the shell.
- Commands see the inherited environment and run once per matching variable.
  One variable's command output is not available to another command in that
  resolution pass. Fetched values are never evaluated or decrypted again.
- Commands run before decryption. A `DOTENV_PRIVATE_KEY="$(...)"` reference can
  fetch a key when mixing cloud key storage with encrypted values.
- Trailing LF characters are removed, as with POSIX command substitution.
  Spaces, Unicode and internal newlines are preserved; empty output is allowed.
- Commands have closed stdin, a 30-second timeout and a 64 KiB limit on total
  captured stdout and stderr. Complete interactive provider login before
  launching the app.
  A failure stops startup without printing the command, stdout or stderr.
- The resolver applies environment changes only after all resolution succeeds.
  Commands can have external effects; failed resolution cannot undo those.
- Nx also expands ordinary `$NAME` references before envref runs. If a command
  needs shell variables, account for your dotenv loader's escaping rules. The
  Doppler example above contains no such references.

## Install privately across projects

From this checkout:

```sh
npm ci --ignore-scripts
npm run build
npm test
npm run test:package
npm run pack:local
```

Then, from a consuming project, install the resulting local tarball using its
actual path:

```sh
npm install --save-exact --ignore-scripts /path/to/ciqol-envref-0.5.0.tgz
```

Use a regular dependency if production startup requires it. This needs no
global install and makes no registry publication. Preserve the consuming
project's lockfile. The root npm overrides in this repository do not propagate
to consumers; check the installed tree against [the dependency review](docs/dependencies.md).

`pack:local` packs the generated `dist/` package, whose manifest remains private.
Keep archives already used by consumers unchanged. The current version is still
an unpublished prototype; a future release needs its own version and approval.

### Local experiments without changing CI

For a local checkout, link this checkout's built `dist/` directory at the
consumer's ignored `node_modules/@ciqol/envref`. Retain any existing installation
as a backup first. This uses the reviewed runtime dependencies from the envref
checkout and does not change the consumer's manifest or lockfile. Rebuild
envref after source changes; restart the application to load the new build.

Keep reference overrides in an ignored `.env.serve.local` and apply the
preload only to the local application's `serve` command. Keep that target edit
local too. Avoid a shell-wide `NODE_OPTIONS` setting: it would preload envref
in Nx and unrelated processes before target dotenv files are loaded.

A clean CI checkout has neither the local link nor those overrides. Its
dependency installation and test/build commands therefore remain unchanged.
`npm ci` can replace the local link, so relink after reinstalling dependencies
if you want to continue using the local prototype.

## Node preload

Once the parent has supplied the environment:

```sh
node --require @ciqol/envref/register app.cjs
node --import @ciqol/envref/register app.mjs
```

The preload finishes before application code and its imports execute. A missing
or wrong key, malformed ciphertext, invalid UTF-8, or decrypted null byte stops
startup with exit code 1. Errors identify the variable and never include its
value or the supplied key.

## Nx

For an existing `@nx/js:node` serve target, add the preload to `runtimeArgs`
while retaining its other options:

```json
{
  "targets": {
    "serve": {
      "executor": "@nx/js:node",
      "options": {
        "buildTarget": "api:build",
        "runtimeArgs": ["--require", "@ciqol/envref/register"]
      }
    }
  }
}
```

Substitute your existing build target for `api:build`. Nx documents
[`runtimeArgs`](https://nx.dev/docs/technologies/typescript/executors#node)
for passing Node flags and its
[dotenv loading rules](https://nx.dev/docs/reference/environment-variables).
No filename is passed to envref.

For a plain Node application with cloud secret references, the complete target
can be as small as:

```json
{
  "name": "app",
  "targets": {
    "serve": {
      "executor": "nx:run-commands",
      "cache": false,
      "continuous": true,
      "options": {
        "command": "node --require=@ciqol/envref/register app.mjs",
        "cwd": "{projectRoot}"
      }
    }
  }
}
```

Place this in the application's `project.json` and references in its
`.env.serve`, then run `nx serve app`. Nx loads the target environment before
launching Node. The application needs no dotenv loader or envref import.
Other targets, such as `test` and `lint`, do not select `.env.serve`.

For a command target, wrap the application command inside the target:

```json
{
  "targets": {
    "serve": {
      "executor": "nx:run-commands",
      "cache": false,
      "options": {
        "command": "envref run -- node dist/apps/api/main.js"
      }
    }
  }
}
```

Keep your existing output path and any build dependency. The package must be
installed in the workspace so Nx can find its `envref` executable.

Attach envref to the application process **after Nx loads its task environment**.
Preloading it on the outer `nx` command runs too early. A global `NODE_OPTIONS`
also runs it in Nx and unrelated subprocesses, so use the target's runtime
arguments or command instead.

The Node executor example decrypts at application startup. If a build itself
needs a secret, its process needs a separate integration after its environment
has loaded. Secrets embedded in browser bundles or cached build output become
part of those artifacts.

## Command wrapper

Inside an npm script or Nx target:

```sh
envref run -- node app.cjs
```

The wrapper passes arguments without adding a shell, inherits stdin/stdout/
stderr, preserves the child's exit status, and forwards SIGINT, SIGTERM and
SIGHUP to the direct application child. It starts no application child if
resolution fails. Shell expressions remain literal unless `--commands` is set.

## Key selection and guarantees

- Plain values pass through unchanged unless their reference mode is enabled. No
  encrypted values means no key is required and no cryptography module is loaded.
- Keys come only from `DOTENV_PRIVATE_KEY` and `DOTENV_PRIVATE_KEY_<name>`
  variables. Each accepts a 64-character hexadecimal private key, or a
  comma-separated list for rotation. Empty variables are ignored.
- File provenance is lost once Nx has assembled the environment. envref tries
  the supplied keys against each encrypted value, without inferring filenames.
- All ciphertext must decrypt before any values are applied or a child starts.
- The `encrypted:` prefix is reserved. Decryption is performed once per value;
  decrypted text is never expanded or evaluated. Do not apply the resolver
  again to a plaintext value that itself starts with this reserved prefix.
- envref never loads or rewrites dotenv files. Its decryptor makes no runtime
  network requests. In command mode, provider commands can access their own
  configuration, credentials and network services.
- Encryption protects stored values. Application code and tools allowed to run
  with the same credentials can read plaintext and private keys from the
  environment. This is not an isolation boundary between coding agents.
- envref does not redact application output or remove private keys from child
  environments. Only supply keys and privileges needed by the task.

## Library API

```js
import { resolveEnv, resolveEnvInPlace } from '@ciqol/envref'

const childEnv = resolveEnv(process.env) // returns a copy
resolveEnvInPlace(process.env) // changes values after all decryption succeeds
resolveEnvInPlace(process.env, { commands: true, commandTimeoutMs: 30000 })
resolveEnvInPlace(process.env, { doppler: true })
```

The library throws `EnvrefError` with a stable `code`. The preload and command
wrapper print a safe diagnostic and stop startup. Call the library before
importing modules that read configuration at import time.

CommonJS consumers can use
`const { resolveEnv, resolveEnvInPlace } = require('@ciqol/envref')`.
Both forms share the same functions and `EnvrefError` class.

## Debug startup

Enable diagnostics only when needed:

```sh
NODE_DEBUG=envref envref run --commands -- node app.cjs
NODE_DEBUG=envref node --require @ciqol/envref/register-commands app.cjs
```

For an application that calls the library after loading dotenv, enable the same
flag on its usual command, for example `NODE_DEBUG=envref nx serve app`.
Set `NODE_DEBUG` when launching Node, before dotenv loading.

Node's `util.debuglog('envref')` writes to stderr. If there are no references
to resolve, it prints only `Nothing to handle.` Otherwise, it prints success
or failure for each attempted variable, then a `Done` summary. On failure,
resolution stops and leaves the environment unchanged.

```text
ENVREF 12345: Replaced secret value for "API_KEY".
ENVREF 12345: Done: replaced 1 secret value(s).
```

Logs omit values, private keys, ciphertext, commands and provider output.
Diagnostics are off by default and create no log files.

## Development and verification

```sh
npm ci --ignore-scripts
npm run build
npm test
npm run test:package
npm audit signatures
npm audit --omit=dev
```

Tests generate disposable dummy keys and never inherit developer credentials
into child processes. They cover failure before startup, exact plaintext
preservation, multiple keys, file preservation, CLI arguments and signals,
and both preload forms. See [validation results](docs/validation.md) for the
tested runtime versions and upstream compatibility check. See
[CONTRIBUTING.md](CONTRIBUTING.md) for the optional real-Nx integration check.

The only direct runtime dependency is `eciesjs`, the encryption library used
by dotenvx primitives. Its API is wrapped in one module with explicit format
parameters. See [dependency review](docs/dependencies.md).

Source, tests and build scripts use `.mjs`. Rollup emits CommonJS implementation
files, ESM wrappers and matching `.d.cts`/`.d.mts` declarations into `dist/`.
The wrappers share the implementation so mixed `import`/`require` consumers do
not duplicate error classes or execute the same preload twice. Runtime
dependencies stay external; Rollup and TypeScript are build-only dependencies.
See [the build contract](docs/build.md) for package layout and CI coverage.

## Upstream alternatives

dotenv-expand 1000 adds decryption and command substitution during dotenv
loading. The [dotenvx Nx guide](https://dotenvx.com/docs/nx) documents that path,
and [Nx PR 37219](https://github.com/nrwl/nx/pull/37219) addresses environment
precedence. [dotenvx issue 993](https://github.com/dotenvx/dotenvx/issues/993)
tracks the inherited-environment request.

envref is useful when the environment has already been loaded, decryption must
fail on a missing key, or command execution must be explicitly enabled. Fetched
and decrypted values stay literal. Use one resolver for each value; upgrading
the parent loader to resolve commands itself can otherwise cause a second
evaluation. Review this integration when upgrading Nx or dotenv-expand.

See [SECURITY.md](SECURITY.md) for the trust model and reporting guidance.
