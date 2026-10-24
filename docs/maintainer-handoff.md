# Maintainer guide

Start with [AGENTS.md](https://github.com/ciqol/resenv/blob/beta/AGENTS.md) for repository policy and
[CONTRIBUTING.md](../CONTRIBUTING.md) for setup and verification. Work in an
isolated task worktree on a `titan/*` branch. Authenticate as `titan-ron` for
[ciqol/resenv](https://github.com/ciqol/resenv); `beta` is the default and sole
release branch.

Inspect current Git status, branches, push remote and recent commits before
editing. Read live GitHub checks, releases and npm metadata before release
work; old chat messages or check results are not authoritative. Never copy
credentials between sessions.

| Guide | Maintained information |
| --- | --- |
| [README](../README.md) | Application installation, API and CLI usage |
| [Doppler](doppler.md) | CLI authentication, lookup, migration and platform limits |
| [Build](build.md) | Module formats, declarations, archive and CI contract |
| [Dependencies](dependencies.md) | Tool rationale, installation and update policy |
| [Releasing](releasing.md) | Candidate checks, npm staging/approval and recovery |
| [Release security](release-security.md) | Isolation guards, advisory policy and platform review deadline |
| [Security](../SECURITY.md) | Trust boundaries and private vulnerability reporting |

## Code map

| Path | Responsibility |
| --- | --- |
| `src/index.ts` | Resolution API and atomic environment replacement |
| `src/preload.ts`, `src/resolve*.ts` | Startup integration and shared preload state |
| `src/doppler/` | References, HTTPS, concurrency and CLI credential lookup |
| `src/commands.ts` | Explicit shell substitution and process limits |
| `bin/resenv.ts` | Child-process CLI |
| `rollup.config.mjs`, `scripts/build.mjs` | CJS implementation, ESM facades, types and manifest |
| `scripts/release-plan.mjs` | Official release plugins and beta counter |
| `scripts/publish.mjs` | Tested-archive staging and verified release recording |
| `.github/workflows/ci.yml` | Build once, archive matrix tests and manual release |

Keep docs focused on current contracts, decisions and procedures. Put per-run
test results, benchmarks, audit snapshots and session history in PRs or CI.
