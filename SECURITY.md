# Security

## Scope and trust

resenv resolves values in a process environment. It does not provide a vault,
access-control service, key rotation, or isolation between programs running
with the same credentials. The application can read its resolved secrets and
any decryption keys supplied to it.

Doppler mode uses a fixed HTTPS API origin, disables redirects and fetches only
referenced secret names. It does not execute shell expressions. Credentials
come from an explicit token, resenv's OS credential store or a fixed Doppler CLI
helper. An API rejection never triggers a switch to another identity. Native
browser login uses endpoints observed in Doppler's official MCP client rather
than a public third-party OAuth contract. See [Doppler details](docs/doppler.md)
for fallback rules, credential scope and platform limits.
The canonical `resolve` preload and `run` command select Doppler only for
`doppler://` values. They do not infer shell execution from `$()` values.
Startup does not initiate login; the separate login command rejects CI and
noninteractive sessions.

The local credential store does not prevent code running as the same user from
requesting credentials. resenv does not automatically remove an explicitly
supplied `DOPPLER_TOKEN` from the application environment. Interactive login
displays a temporary human authorization code; tokens and the polling code are
not logged. The Node preload's private worker exchanges credentials and results
over captured pipes, never process arguments or dotenv files.

Command mode executes trusted configuration with the current user's
permissions. Enable it only for configuration you have reviewed. Commands can
access files and the network; failed resolution cannot undo their external
effects. Commands are bounded by timeout and output limits, and their output
is not included in resenv diagnostics.

Node's `child_process` debug category prints spawn options, including stdin
and environment values. resenv refuses its own subprocess and credential-helper
operations when that category is enabled, including through `NODE_DEBUG=*`.
Use `NODE_DEBUG=resenv` for diagnostics that omit values. This guard does not
control application logs, other instrumentation, or a debugger attached to the
process.

All values are resolved before resenv updates the caller's environment or
starts the application. Missing keys, invalid ciphertext, command failures and
invalid environment values stop startup. Fetched or decrypted values are
never evaluated recursively. Application logs are outside resenv's control.

Different automatic preload modes cannot be combined in one process. Otherwise
the second mode could execute or decrypt literal data fetched by the first.
Use one `resenv run --commands` invocation or one library call with both options
enabled to resolve cloud references and commands together. Repeated manual
library calls are separate operations; only pass original configuration to them.

Provider responses must be valid UTF-8 and JSON, and resolved strings must not
contain lone Unicode surrogates or null bytes. In-place replacement preflights
all changed properties; read-only properties, setters and Proxy targets are
rejected before any values are committed. Use `resolveEnv()` to obtain a copy
when the input is not a writable environment record.

The private prototype has not had an independent security audit. Validation
evidence and platform limits are recorded in [docs/validation.md](docs/validation.md).

## Reporting a vulnerability

Do not open a public issue containing a vulnerability, credentials or sensitive
output. While the repository is private, contact the repository owner through
an existing private channel. Before public release, maintainers must enable
GitHub private vulnerability reporting and verify that it is available.

Include affected versions, platform, impact and a minimal reproduction using
dummy data. Never include production tokens, private keys or environment dumps.
There is no guaranteed response time or long-term support policy yet.
