# Doppler reference

For installation, login and application/Nx examples, start with the
[README](../README.md#use-with-doppler). This guide covers reference syntax,
credential lookup, limits and compatibility.

## Reference syntax

```dotenv
API_TOKEN=doppler://my-project/dev/API_TOKEN
```

This is resenv's syntax, not an official Doppler URI standard or SecretSpec URI.
Project, config and secret are required. Project/config slugs accept lowercase
letters, digits, `_` and `-`. Secret names accept punctuation and percent encoding,
such as `payments%2Fapi.key`. Query strings, fragments, credentials, ports and
executable expressions are rejected. Nx or the caller chooses and loads dotenv
files; `doppler setup` is unnecessary because references name their project/config.

## Authentication

Resolution uses an explicit `DOPPLER_TOKEN` first, otherwise the existing
[CLI login scoped to the application's working directory](https://docs.doppler.com/docs/multiple-workplaces).
An invalid explicit token or API rejection stops resolution without trying
another identity. In unattended environments, supply a suitably scoped token
through the runner's secret facility; no CLI installation is needed.

The official CLI owns browser authorization, login, logout and credential
storage. resenv retrieves its token with `doppler configure get token --plain`;
it never parses the CLI's private config or accesses the OS credential store
directly. The fixed helper uses separate arguments, `--no-check-version`,
`--no-read-env` and a restricted environment. It inherits the application's
working directory, with a fifteen-second timeout and 16 KiB output limit.
Captured output and helper errors are not forwarded to application logs.

A missing CLI requires installation or an explicit token. Empty/failed lookup
requires `doppler login`; malformed credentials, access denial and network
failures stop startup. Resolution never initiates login. Changing CLI login
affects the next startup; resenv does not persist a token cache.

### CLI discovery and platforms

Lookup deliberately ignores application `PATH` so a repository-local executable
cannot replace the credential helper. Standard locations, in lookup order:

| Platform | Locations |
| --- | --- |
| macOS / Linux | `/opt/homebrew/bin/doppler`, `/usr/local/bin/doppler`, `/usr/bin/doppler`, `~/.local/bin/doppler`, `~/bin/doppler` |
| Windows | `~/AppData/Local/Microsoft/WinGet/Links/doppler.exe`, `~/scoop/apps/doppler/current/doppler.exe` |

`~` denotes the OS user's home. Other installation locations require an explicit
`DOPPLER_TOKEN`. WSL uses its Linux CLI/login. No separate keyring package or native
Node addon is required. Windows discovery has injected tests; native Windows
end-to-end use is not yet verified. Tests never access a developer's login.

## Resolution limits

Only named secrets are fetched from a fixed HTTPS origin, with redirects disabled.
The computed value is required; missing, restricted, null or invalid values fail
rather than falling back to raw values. Repeated references share a lookup per
resolution pass; fetched values stay literal and are not cached on disk.

| Limit | Value |
| --- | --- |
| HTTPS request timeout | 10 seconds |
| Synchronous worker timeout | 60 seconds |
| Concurrent distinct lookups | 4 |
| References per pass | 128 |
| Secret value | 64 KiB |
| Response / captured worker output | 1 MiB each |

After failure, no new requests are scheduled; active requests settle before
failure returns. The synchronous API/preloads use a private Node worker receiving
references and any explicit credential through stdin, with results through a
captured pipe. Environment changes apply only after all lookups succeed.

Doppler permissions remain the authorization boundary; CLI user tokens inherit
the user's privileges. A read-only service token can limit CI to one config.
See [security guidance](../SECURITY.md) for process trust, commands and diagnostics.

## Compatibility and migration

- `/resolve-doppler` aliases canonical `/resolve`; `run --doppler` remains accepted.
  Prefer `/resolve` and `run` without a provider flag for new integrations.
- `encrypted:` values stay unchanged. resenv does not decrypt dotenvx ciphertext;
  Doppler references require no dotenvx private key.
- Removed `resenv login`/`logout` commands are replaced by the official CLI.
  Earlier credentials under service `ciqol.envref.doppler`, account `default`,
  are ignored, with no automatic migration/deletion. Remove obsolete entries
  through the OS credential manager and revoke unused tokens in Doppler.

## Provider documentation

[CLI installation and authentication](https://docs.doppler.com/docs/cli) ·
[Retrieve the CLI token](https://docs.doppler.com/docs/cli#fetch-cli-token-from-your-local-environment) ·
[Retrieve a secret](https://docs.doppler.com/reference/secrets-get) ·
[API authentication](https://docs.doppler.com/reference/api)
