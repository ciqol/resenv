# Doppler references and login

envref can resolve individual Doppler secrets through HTTPS after Nx or another
loader has populated the environment. This mode does not execute shell commands.
The canonical `--require @ciqol/envref/register` preload infers Doppler from
`doppler://` values. The equivalent `--import` and `envref run -- ...` do the
same. The library accepts `{ doppler: true }`. `register-doppler` and
`run --doppler` remain supported for compatibility.

## Local setup

From the checkout, build and log in:

```sh
npm run build
node dist/bin/envref.cjs login doppler
```

After installing a packed build, the same command is `envref login doppler`.
If the references are already loaded into the shell environment, `envref login`
infers Doppler without naming it. No cloud references means no login is needed.
Neither command loads dotenv files; Nx remains responsible for file selection.
It requests a browser authorization code, opens Doppler's authorization page,
and waits up to five minutes for you to approve the login. `--no-browser`
prints the page and code without opening it. Login requires a terminal outside
CI; application startup never opens a browser or prompts for credentials.
If login falls back to the Doppler CLI, that CLI handles its own browser prompt.

The native flow follows the protocol observed in Doppler's published
`@dopplerhq/mcp-server` 1.0.5 package. These login endpoints are not a documented
third-party OAuth contract. They can change independently of the public API.
envref identifies itself with its own version and user agent.

The user token is saved in the OS credential store under service
`ciqol.envref.doppler`, account `default`. Nothing is saved in the repository,
dotenv files or worktree. The current prototype stores one workplace login per
OS user; logging in again replaces that saved identity. Each developer logs in
separately and receives the permissions of their own Doppler account.

Native persistence supports macOS Keychain via `/usr/bin/security` and Linux
Secret Service via an installed `/usr/bin/secret-tool`. The token is passed to
the helper through stdin, never through process arguments. envref does not
install these tools or fall back to a plaintext credential file. Windows can
use a supplied `DOPPLER_TOKEN`; native Windows login/storage is not implemented.

## Declare a reference

Put references in the dotenv file Nx already selects, such as `.env.serve`:

```dotenv
API_TOKEN=doppler://my-project/dev/API_TOKEN
```

This is **envref's own syntax**, not an official Doppler URI standard or
SecretSpec's provider URI. All three fields are required: project, config and
secret name. Project/config slugs must be lowercase letters, digits, `_` or
`-`. Secret names can use Doppler's permissive punctuation; percent encoding
is accepted for a secret name, such as `payments%2Fapi.key`. Query strings,
fragments, credentials, ports and executable expressions are rejected.

For an Nx Node target, put the preload on the application process:

```json
"runtimeArgs": ["--require", "@ciqol/envref/register"]
```

For an Nx command target, use `envref run -- node app.mjs` inside the
target. Preloading the outer Nx process would run before Nx loads target files.
envref does not choose, read or rewrite dotenv files.

## Credentials and CLI fallback

Resolution checks these sources in order:

1. An explicitly supplied `DOPPLER_TOKEN`.
2. The envref credential in the OS store.
3. The current directory's existing Doppler CLI login, retrieved with the
   documented `doppler configure get token --plain` operation.

The fallback captures that token internally and still fetches secrets through
HTTPS. It does not parse the CLI's private config format. It invokes a fixed
executable with separate arguments and a restricted environment. Current
executable locations are `/opt/homebrew/bin/doppler`,
`/usr/local/bin/doppler` and `/usr/bin/doppler`; a repository's `PATH` cannot
select a different credential helper. Other installations can supply a token.

Native login falls back to `doppler login` when the OS store is unavailable or
the authorization endpoint returns HTTP 404, 405 or 501. To select it directly:

```sh
envref login doppler --cli
```

An explicit invalid token, access denial, login rejection, timeout or network
error stops the operation. These failures do not silently switch identities.
Unset `DOPPLER_TOKEN` before interactive login because it overrides saved logins.
In CI, supply a suitably scoped token through the runner's credential facility.

`envref logout doppler` removes only envref's local credential. It does not
revoke the remote token, unset an environment variable or log the Doppler CLI
out. Those other credential sources can still authenticate. Revoke unwanted
tokens from Doppler's CLI Tokens page.

## Resolution and security boundaries

- Fetches only named secrets from the public retrieve-secret endpoint. Repeated
  references share one request per startup; values are not cached on disk.
- Requires the computed value. Restricted, missing, null and invalid values
  fail startup; envref never substitutes a raw value as a fallback.
- Keeps fetched output literal, including strings that start with `encrypted:`
  or contain `$()`. A reference may supply `DOTENV_PRIVATE_KEY` for original
  ciphertext in the same environment.
- Resolves everything before applying changes. A failure leaves the caller's
  environment untouched. Existing command mode remains separately opt-in.
- Uses a fixed HTTPS origin, disables redirects, and has a ten-second timeout
  per request. The synchronous preload uses a private Node worker with a
  sixty-second overall limit. Limits are 128 references, 64 KiB per value and
  1 MiB for each response and the worker's captured output.
- Preloads use a child Node process to wait for asynchronous HTTPS while
  retaining `--require` compatibility. It receives only references and an
  explicit credential through stdin, with results returned through a private
  pipe. No Doppler CLI is required when a native credential is available.
- Diagnostics show variable names and error codes, never tokens, provider
  response bodies or resolved values. Only explicit interactive login displays
  its temporary human authorization code.

This removes shell evaluation from Doppler lookups. It does not isolate
untrusted repository code or agents that can access the same user's credential
store. Doppler account permissions remain the authorization boundary. CLI user
tokens inherit the user's privileges; a read-only service token can limit CI
to a specific config.

## Sources

- [Doppler MCP authentication](https://docs.doppler.com/docs/mcp#1-authenticate)
- [Published MCP package](https://www.npmjs.com/package/@dopplerhq/mcp-server/v/1.0.5)
- [Retrieve a secret](https://docs.doppler.com/reference/secrets-get)
- [API authentication](https://docs.doppler.com/reference/api)
- [Retrieve the CLI token](https://docs.doppler.com/docs/cli#fetch-cli-token-from-your-local-environment)
