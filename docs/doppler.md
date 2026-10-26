# Doppler references and CLI authentication

Doppler is resenv's only built-in cloud provider. After Nx or another loader
populates the environment, resenv fetches referenced values through HTTPS and
replaces them in memory before application startup. It resolves once per startup;
restart the application to fetch changed secrets. This mode does not execute
shell commands.
The canonical `--require @ciqol/resenv/resolve` preload infers Doppler from
`doppler://` values. The equivalent `--import` and `resenv run -- ...` do the
same. The library also infers Doppler from values; call `resolve()` without
a provider option. `resolve-doppler` and
`run --doppler` remain supported for compatibility.

## Local setup

After [installing resenv](../README.md#install) in your application project,
install the [official Doppler CLI](https://docs.doppler.com/docs/cli) and run
this from the application's directory:

```sh
doppler login
```

Doppler owns browser authorization, token persistence, login scopes and logout.
Use `doppler logout` to manage the CLI login. resenv never opens a browser,
prompts for login, issues or revokes tokens, or reads or writes the OS
credential store directly. There is no separate resenv login.

Existing Doppler users can reuse their login. resenv asks the CLI for the token
selected by its current working directory, so Doppler's directory-scoped
workplace identities continue to apply. See
[Doppler's scope guide](https://docs.doppler.com/docs/multiple-workplaces).
`doppler setup` is not required for resenv references: their project and config
are already explicit in each `doppler://` value. Nx or the caller remains
responsible for dotenv file loading.

### Platforms and installation locations

The CLI handles its own credential storage on macOS, Linux and Windows. resenv
does not require `secret-tool`, a separate keyring package or native Node addons.
It discovers the CLI in these standard locations:

| Platform | Locations, in lookup order |
| --- | --- |
| macOS / Linux | `/opt/homebrew/bin/doppler`, `/usr/local/bin/doppler`, `/usr/bin/doppler`, `~/.local/bin/doppler`, `~/bin/doppler` |
| Windows | `~/AppData/Local/Microsoft/WinGet/Links/doppler.exe`, `~/scoop/apps/doppler/current/doppler.exe` |

Here `~` is the OS user's home directory. Windows paths cover default per-user
WinGet and Scoop installations. Custom and system-wide Windows installations
outside these locations need an explicit `DOPPLER_TOKEN`. WSL uses the Linux
installation and login within WSL. The runtime deliberately ignores the
application's `PATH` so a repository-local executable cannot replace the
credential helper.

Windows discovery is covered with injected process tests; a native Windows
end-to-end run is not yet verified. Automated checks never use a developer's
Doppler login or OS credential store.

### Migration from resenv-managed login

`resenv login` and `resenv logout` have been removed. Run `doppler login` to
establish the CLI identity, then start the application normally. Earlier resenv
credentials stored under service `ciqol.envref.doppler`, account `default`, are
ignored and are not migrated or deleted automatically. If you used that flow,
remove the obsolete entry through your OS credential manager and revoke the
obsolete token in Doppler when it is no longer needed.

## Declare a reference

Put references in the dotenv file Nx already selects, such as `.env.serve`:

```dotenv
API_TOKEN=doppler://my-project/dev/API_TOKEN
```

This is **resenv's own syntax**, not an official Doppler URI standard or
SecretSpec's provider URI. All three fields are required: project, config and
secret name. Project/config slugs must be lowercase letters, digits, `_` or
`-`. Secret names can use Doppler's permissive punctuation; percent encoding
is accepted for a secret name, such as `payments%2Fapi.key`. Query strings,
fragments, credentials, ports and executable expressions are rejected.

For an Nx Node target, put the preload on the application process:

```json
"runtimeArgs": ["--require", "@ciqol/resenv/resolve"]
```

For an Nx command target, use `resenv run -- node app.mjs` inside the
target. Preloading the outer Nx process would run before Nx loads target files.
resenv does not choose, read or rewrite dotenv files.

## Runtime credential lookup

Resolution checks these sources in order:

1. An explicitly supplied `DOPPLER_TOKEN`.
2. The current directory's existing Doppler CLI login, retrieved with the
   documented `doppler configure get token --plain` operation.

resenv captures the token internally and fetches secrets through HTTPS; it does
not parse the CLI's private config format. The command uses a fixed executable,
separate arguments, `--no-check-version` and `--no-read-env`, with a restricted
environment. It inherits the application's working directory to preserve login
scopes. Lookup has a fifteen-second timeout and a 16 KiB output limit. Captured
output and helper errors are never forwarded to application logs.

If the CLI is missing, install it in a supported location and run `doppler login`,
or supply `DOPPLER_TOKEN`. A failed or empty CLI lookup reports that login is
required. An explicitly supplied invalid token, malformed CLI token, access
denial or network failure stops the operation without switching identities or
starting login.

In CI, containers and other unattended environments, supply a suitably scoped
`DOPPLER_TOKEN` through the runner's secret facility. No CLI installation or
local credential store is needed in that mode. Changing the CLI login affects
the next application startup; resenv does not keep a persistent token cache.

## Resolution and security boundaries

- Fetches only named secrets from the public retrieve-secret endpoint. Repeated
  references share one request per startup; values are not cached on disk.
- Requires the computed value. Restricted, missing, null and invalid values
  fail startup; resenv never substitutes a raw value as a fallback.
- Keeps fetched output literal, including strings that start with `encrypted:`
  or contain `$()`. Neither fetched nor original ciphertext is decrypted.
- Resolves everything before applying changes. A failure leaves the caller's
  environment untouched. Existing command mode remains separately opt-in.
- Uses a fixed HTTPS origin, disables redirects, and has a ten-second timeout
  per request. The synchronous preload uses a private Node worker with a
  sixty-second overall limit. Up to four distinct lookups run concurrently;
  duplicate references share one lookup. After a failure, no new lookups are
  scheduled and active requests settle before failure is returned. Limits are
  128 references, 64 KiB per value and
  1 MiB for each response and the worker's captured output.
- Preloads use a child Node process to wait for asynchronous HTTPS while
  retaining `--require` compatibility. It receives only references and an
  explicit credential through stdin, with results returned through a private
  pipe. No Doppler CLI is required when `DOPPLER_TOKEN` is supplied.
- Diagnostics show variable names and error codes, never tokens, provider
  response bodies, CLI output or resolved values.

This removes shell evaluation from Doppler lookups. It does not isolate
untrusted repository code or agents that can access the same user's credential
store. Doppler account permissions remain the authorization boundary. CLI user
tokens inherit the user's privileges; a read-only service token can limit CI
to a specific config.

## Sources

- [Doppler CLI installation and authentication](https://docs.doppler.com/docs/cli)
- [Directory-scoped workplace logins](https://docs.doppler.com/docs/multiple-workplaces)
- [Retrieve a secret](https://docs.doppler.com/reference/secrets-get)
- [API authentication](https://docs.doppler.com/reference/api)
- [Retrieve the CLI token](https://docs.doppler.com/docs/cli#fetch-cli-token-from-your-local-environment)
