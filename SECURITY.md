# Security

## Scope and trust

resenv resolves values in a process environment. It does not provide a vault,
access-control service, key rotation, or isolation between programs running
with the same credentials. The application can read its resolved secrets and
any credentials supplied to it.

Doppler mode uses a fixed HTTPS API origin, disables redirects and fetches only
referenced secret names. It does not execute shell expressions. Credentials
come from an explicit `DOPPLER_TOKEN` or the current directory's existing
Doppler CLI login. A fixed CLI helper captures that token privately; resenv
does not parse Doppler's config files. An API rejection never triggers a switch
to another identity. The official Doppler CLI owns browser authorization,
token storage, login and logout. See [Doppler details](docs/doppler.md)
for lookup rules, credential scope, migration and platform limits.
The canonical `resolve` preload and `run` command select Doppler only for
`doppler://` values. They do not infer shell execution from `$()` values.
Startup does not initiate login. Use `doppler login` separately for local
development or supply a suitably scoped token for unattended runs.

Doppler's credential storage does not isolate credentials from other code
running as the same user with access to them. resenv does not read or write the
OS credential store directly or persist login tokens or fetched secrets.
It does not automatically remove an explicitly supplied `DOPPLER_TOKEN` from
the application environment. Tokens, captured CLI output and provider response
bodies are not logged. The Node preload's private worker exchanges credentials
and results over captured pipes, never process arguments or dotenv files.

Command mode executes trusted configuration with the current user's
permissions. Enable it only for configuration you have reviewed. Commands can
access files and the network; failed resolution cannot undo their external
effects. Commands are bounded by timeout and output limits, and their output
is not included in resenv diagnostics.

Node's `child_process` debug category prints spawn options, including stdin
and environment values. resenv refuses its own subprocess and credential-helper
operations when that category is enabled, including through `NODE_DEBUG=*`.
Use `NODE_DEBUG=ciqol:resenv` for diagnostics that omit values. This guard does not
control application logs, other instrumentation, or a debugger attached to the
process.

All values are resolved before resenv updates the caller's environment or
starts the application. Provider failures, command failures and invalid
environment values stop startup. Fetched values are never evaluated recursively. Application logs are outside resenv's control.

Different automatic preload modes cannot be combined in one process. Otherwise
the second mode could execute literal data fetched by the first.
Combining a preload with the CLI is rejected for the same reason. Do not add
another resolver to the child through `NODE_OPTIONS` or other launch hooks.
Use one `resenv run --commands` invocation or one library call with commands
enabled to resolve cloud references and commands together. Repeated manual
library calls are separate operations; only pass original configuration to them.

Provider responses must be valid UTF-8 and JSON, and resolved strings must not
contain lone Unicode surrogates or null bytes. In-place replacement preflights
all changed properties; read-only properties, setters and Proxy targets are
rejected before any values are committed. Use `resolve()` to obtain a copy
when the input is not a writable environment record.

This experimental package has not had an independent security audit. See
[verification](CONTRIBUTING.md) and [Doppler platform limits](docs/doppler.md).

## Reporting a vulnerability

Do not open a public issue containing a vulnerability, credentials or sensitive
output. [Report a vulnerability privately](https://github.com/ciqol/resenv/security/advisories/new)
through GitHub. If that option is unavailable, contact the maintainer through
an existing private channel.

Include affected versions, platform, impact and a minimal reproduction using
dummy data. Never include production tokens, private keys or environment dumps.
There is no guaranteed response time or long-term support policy yet.
