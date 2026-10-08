# Security and performance review

Reviewed on 2026-10-06 against the private 0.1.0 candidate, starting at
`b50fa9b`. This is a source review with targeted reproductions, regression tests
and measurements. It is not an independent audit or a security certification.

A later change on the same day migrates the implementation and CLI to strict
TypeScript. The findings below describe the reviewed baseline and fixes; see
[the current build contract](build.md) and [validation](validation.md) for the
generated declarations and implementation checks that supersede the earlier
declaration-only setup.

## Findings and changes

| Priority | Finding reproduced | Change and regression coverage |
| --- | --- | --- |
| P1 | Node's `child_process` debug category printed dummy credentials from subprocess environment values and private worker stdin. | Reject resenv subprocess/helper operations before spawning when that native debug category is enabled. Cover wildcards, case, cached debug state and safe no-work preloads in [diagnostic tests](https://github.com/ciqol/resenv/blob/e57a8fe72ecf956fc99c661d40b1ca707bbcd172/test/diagnostics.test.mjs). |
| P1 | Combining automatic resolution modes could interpret a fetched secret as a shell expression on the second pass. | Share preload state across CJS/ESM, reject mixed modes and reject CLI resolution after a preload. Verify both preload orders and the CLI combination in [runtime tests](https://github.com/ciqol/resenv/blob/e57a8fe72ecf956fc99c661d40b1ca707bbcd172/test/doppler-runtime.test.mjs). |
| P2 | Invalid UTF-8 from the provider was silently converted to a different secret value; escaped lone surrogates were also accepted. | Decode JSON with fatal UTF-8 validation and reject malformed Unicode values. Cover both paths in [Doppler tests](https://github.com/ciqol/resenv/blob/e57a8fe72ecf956fc99c661d40b1ca707bbcd172/test/doppler.test.mjs). |
| P2 | A non-writable second property could fail after the first environment property had already changed. | Preflight all changed descriptors before committing; reject setters and Proxy targets. Preserve writable sealed records. Cover atomicity in [resolver tests](https://github.com/ciqol/resenv/blob/e57a8fe72ecf956fc99c661d40b1ca707bbcd172/test/resolver.test.mjs). |
| P2 | Unique Doppler lookups ran sequentially, making startup latency grow with each request. | Deduplicate references and allow four requests at a time. Stop scheduling after failure, await active requests and discard partial results. Deterministic tests check overlap, deduplication and failure behavior. |
| P2 | The generic in-place return type preserved an input's literal reference type after its value had changed. | Return `Environment`; add compile-time regression checks to both installed CJS and ESM consumers. |

Unexpected cleanup errors now produce safe errors instead of disappearing in
empty catch blocks. Known already-exited process groups remain harmless.
Credential-revocation failures retain a safe message without raw provider
details. Regression tests cover these cases with dummy values.

The debug guard uses Node's actual `debuglog().enabled` state. Clearing
`NODE_DEBUG` after Node initializes it is insufficient. Use `NODE_DEBUG=resenv`
for variable names and outcome messages without values. See Node's
[debuglog documentation](https://nodejs.org/api/util.html#utildebuglogsection-callback).

## Reviewed boundaries

- Only original environment references are processed within a resolution call.
  Fetched and decrypted output remains literal.
- Doppler requests use a fixed HTTPS origin, reject redirects and request only
  named secrets. An explicit identity is not silently replaced after rejection.
- The synchronous worker receives references and an optional token over stdin.
  Credential helpers receive a filtered environment and fixed executable paths.
  Application secrets, loader options and a repository's PATH are not forwarded
  to those helpers.
- Requests have a ten-second deadline and a 1 MiB response limit. A resolution
  allows at most 128 references, with a 64 KiB limit per cloud value. The worker
  has a 60-second deadline and 1 MiB captured-output limit.
- Shell execution requires explicit opt-in. Startup never starts interactive
  login automatically; login rejects CI and noninteractive use.
- Plain environments avoid subprocesses, credential discovery and loading the
  cryptography dependency. Runtime dependency versions are unchanged.

These boundaries do not isolate secrets from the application, a debugger or
other code running as the same user. Commands execute with that user's access,
and their external effects cannot be rolled back. Configure one resolver per
launch; repeated manual calls or a separately installed child-process preload
can reinterpret values. See [SECURITY.md](../SECURITY.md).

## Performance measurements

Run `npm run bench` after building. The benchmark uses dummy values and a mocked
provider, with no real credentials or network requests. Measurements below use
Node 24.19.0 on macOS arm64; they are observations, not CI timing thresholds.

| Measurement | Before | After |
| --- | ---: | ---: |
| 16 references, eight unique requests, 40 ms simulated latency per request; median of five runs | 332.069 ms | 81.705 ms |
| Peak concurrent provider requests | 1 | 4 |
| No-work library call with 200 plain variables; median of 5,000 calls | 0.047 ms | 0.045 ms |

The mocked lookup case is about 4.1 times faster. Real Doppler latency, rate
limits and credential-store latency may differ; four is a conservative client
limit, not a published provider concurrency allowance.

The final fresh-process measurements interleave baseline, CJS preload and ESM
preload runs. Each reports the median of 20 samples after discarding three
warmup samples; disk caches remain warm.

| Final startup measurement | Median |
| --- | ---: |
| Node alone | 46.427 ms |
| Node with `--require @ciqol/resenv/resolve` and no references | 52.177 ms |
| Node with `--import @ciqol/resenv/resolve` and no references | 50.722 ms |

The observed extra startup cost was about 4-6 ms. Scheduling and filesystem
noise affect these small measurements; no startup speedup is claimed.

## Standards applied

The requested TypeScript authoring, library-build and style standards were
applied to the existing `.mjs` project and its public declarations:

- Public option objects use type aliases and readonly properties. `Environment`
  remains mutable because in-place resolution writes it.
- ESLint checks runtime/build JavaScript and declarations. Rules cover undefined
  names, empty handlers, parameter count, catch naming and the selected public
  TypeScript conventions. Existing compact JavaScript formatting is preserved.
- Declaration checks and installed `.cts`/`.mts` consumers use `strict` and
  `noUncheckedIndexedAccess`. This checks the declaration contract, not the
  `.mjs` implementation with TypeScript.
- Rollup still emits explicit CJS/ESM extensions with a shared implementation,
  types-first conditional exports and external runtime dependencies. Clean
  consumers verify the packed artifact without source-tree links or lint/build
  tools installed as runtime dependencies.
- CI runs lint and declaration checks before building one archive for every
  compatibility job. Actions are pinned, permissions are read-only and install
  lifecycle scripts are disabled. Both manifests remain private by request.

The new development dependencies and their provenance limits are recorded in
[the dependency review](dependencies.md). No new runtime dependency was added.

## Validation and remaining work

- All 70 unit/process tests passed locally on Node 20.20.2, 22.22.3 and 24.19.0.
- The packed package passed 13 runtime checks and two typed consumers on Node
  24. Lint and strict declaration checks passed.
- Nx 23.2.1 passed target dotenv loading, local/shell precedence, target
  isolation and strict failures for command and Doppler modes. Tests used a
  temporary workspace, dummy credentials and an existing Nx installation
  read-only; consumer files were not changed.
- npm reported zero known vulnerabilities, 103 verified registry signatures
  and 37 verified attestations in the installed development tree. Advisory and
  signature checks do not rule out unknown vulnerabilities.
- [Hosted CI](https://github.com/ciqol/resenv/actions/runs/37462966577) passed for
  `e57a8fe`: one build and four compatibility jobs on Linux (Node 20, 22 and 24)
  and macOS (Node 24). Each job passed all 70 tests, 13 installed runtime checks
  and two typed consumers against the same archive. The Linux build verified
  103 registry signatures and 38 attestations with zero known vulnerabilities.
  Counts apply to each platform's installed tree.
- Workflow structure and documentation links passed local checks. Existing
  distributed archives retained their original SHA-256 hashes. The final
  documentation update records the tested commit; it does not change runtime code.

Before public release, settle the license and whether to retain the older
dotenvx decryption feature. The fresh native browser-login flow and live Linux
keyring integration still need verification. Windows native login/storage is
not implemented. Repository reporting/protection and npm publishing setup are
also outstanding in [the release plan](releasing.md). The repository remains
private and unpublished, with PR creation on hold.
