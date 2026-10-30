# Releases

## Contract

`beta` is the sole default/release branch. CI stages one tested candidate at a
time through npm OIDC; the maintainer approves it in npm with 2FA. Development
and PR merges continue while approval is pending. A GitHub draft release is
the durable pending record, not an announcement of a published package.

Versions start at `0.1.0-beta.1`. The official semantic-release analysis and
notes plugins determine whether commits since the last recorded release need
a release. The next counter exceeds every real Git release tag, GitHub release
reservation (including rejected drafts), and public npm version. Only completed
publication creates a Git tag. The full semantic-release engine remains unused.

The intended npm channels remain `beta` and `latest` on the tested beta. npm
approval updates the staged `beta` channel; the maintainer promotes `latest`
after public availability. Channel promotion and immutable GitHub release
recording are separate operations: a delayed tag update or a newer channel
version cannot prevent recording an older approved archive. CI never changes
npm tags or grants itself additional npm permissions.

## Lifecycle

| State | Durable evidence and next action |
| --- | --- |
| `prepared` | A private draft reserves the version, source SHA, original CI run/attempt, release plan and hashes. CI uploads the exact tested archive and plan as draft assets and verifies them before staging. A partial upload can resume without rebuilding. |
| `staging` | Intent is saved before the npm call. A lost response or failed receipt write leaves the reservation intact. Automation never repeats that staging call. |
| `staged` | The npm receipt and stage ID are saved in the draft. Approval is the maintainer's next action; no runner waits for it. |
| `recorded` | npm exposes the identical archive. Automation verifies durable assets and original CI evidence, creates the tag at the original source SHA, and publishes the draft as a GitHub prerelease. |
| `rejected` | After the maintainer rejects the stage in npm, an explicit finalizer dispatch marks the draft rejected. The version stays reserved forever; no tag or public GitHub release is created. |

The draft metadata and assets do not use Actions artifact retention. Workflow
artifacts are short-lived diagnostics and transport into staging, not the
source of truth for pending publication. Do not delete or edit managed drafts,
metadata, or assets manually. Unknown drafts or conflicting records stop
allocation for maintainer review.

There is at most one active candidate. While it is pending, beta CI still runs
all checks but builds a private validation artifact and skips staging another
version. After recording or rejection, the finalizer dispatches CI against the
current `beta` head when needed. That run re-analyzes all accumulated changes,
builds a new version once and repeats every candidate check. No candidate is
renamed, repacked, or rebuilt after testing to fit a reservation.

## Workflows and trust

[CI](https://github.com/ciqol/resenv/actions/workflows/ci.yml) installs the pinned
lockfile, audits dependencies and signatures, checks lint/types/coverage, plans,
builds and packs once, and tests that archive on the pinned runtime. The
`smoke` matrix tests the same bytes on Linux Node 20/22 and macOS Node 24.
`coverage` uploads the report separately from project scripts.

Trusted beta pushes and manual dispatches with `publish: true` can stage after
all checks pass. PRs and non-publishing dispatches cannot stage. Before staging,
the protected job rechecks reservations, source ancestry, original run/attempt,
all required job results and candidate hashes. It creates a draft only after
those checks, preserves the exact candidate, and then records staging intent.
No tag is created while publication is pending. A stale version plan fails
rather than substituting a new version for the tested archive.

[Finalize release](https://github.com/ciqol/resenv/actions/workflows/finalize-release.yml)
checks after trusted CI completions and every 15 minutes (subject to GitHub
scheduling delays). It follows managed release records, not current-head CI
artifact searches. It downloads durable assets as data, verifies the public
npm SHA-512 integrity, metadata/archive hashes and manifest, and rechecks the
original CI attempt and source ancestry before recording. The source must remain
an ancestor of `beta`; it need not remain its head. A force-pushed divergent
history requires review. Channel tags need not equal the candidate version.

Both mutation jobs use the existing protected `release` environment and the
same release concurrency group. Beta CI is also serialized at workflow level.
The finalizer has contents write and Actions write (to verify source checks and
dispatch the next beta run), with no npm tokens or OIDC permission. It cannot
stage, approve, reject in npm, or promote npm tags. Repeated checks do not
republish packages or duplicate GitHub releases. A lost continuation response
may dispatch CI again; reservations and serialization make that harmless.

## Maintainer actions

For each candidate, inspect the stage ID in the CI summary or managed draft,
review it in npm, then approve with 2FA:

```sh
npm stage view <stage-id> --json
npm stage approve <stage-id>
```

After scanning/public availability, promote the default install channel:

```sh
npm dist-tag add @ciqol/resenv@<approved-version> latest
```

No original-job rerun is needed for normal GitHub recording. Check the finalizer
summary and GitHub prerelease, and verify both npm channels. The root manifest
and ordinary local builds remain private. Never publish from a developer
machine or configure npm publishing tokens.

To reject a candidate, first reject it in npm using the maintainer session.
Then manually dispatch **Finalize release** with `reject` set to that exact
version. This is an explicit assertion that npm rejection is complete; public
versions cannot be marked rejected. The draft and its assets remain retained,
and replacement CI is dispatched even when the source head did not change.

A `prepared` candidate can resume without its CI artifact: manually dispatch
**CI** with publishing enabled and `resume` set to its exact version. The
protected recovery job downloads the preserved draft assets, verifies the
original checks and source, and makes the first staging call. It runs no build
or project dependency installation. A candidate with staging intent or a
receipt is never restaged by this input. If a partial preservation failure left
an asset missing, the original release job can complete it while its input
artifact remains available. If both copies are lost, reject that reservation
and test a replacement version rather than reconstructing a tested archive.
A `staging` intent without a receipt
requires npm inspection: approve/reject the existing stage, never blindly retry.
The finalizer can still record an identical public version after a lost receipt.
Conflicting public integrity, tags, source ancestry, run evidence or durable
assets stop automatic recovery. Failed continuation dispatches retry from the
terminal record on the next check.

## Required setup and migration

The npm trusted publisher remains `ciqol/resenv`, workflow `ci.yml`, environment
`release`, with stage-only permission. The existing GitHub `release` environment
allows only `beta`, without required reviewers. Read back these settings and
verify npm setup before setting `RELEASE_ENABLED=true`; leave it unset until
then. Environment/protection changes require explicit authorization. No npm
permission changes are introduced by this design.

The platform stays at Node.js 24.19.0/npm 11.17.0. Automating `latest` through
OIDC needs a separately reviewed, capable npm CLI and explicit npm dist-tag
permission; it is not enabled by staging permission. Do not broaden advisory
exceptions or extend the platform review to enable it. See
[release security](release-security.md).

Existing public npm versions reserve their numbers even when their GitHub
release/tag has not been recorded. This prevents a new workflow from reusing a
legacy published version. Legacy publication is not silently adopted: retain
its original tested archive, plan and run evidence for a separately reviewed
recovery. New lifecycle records are created only by the protected staging job.

`beta` remains the sole release branch; moving to `main` is a separate branch
and trusted-publisher policy change. Local `npm run release:check` is
non-publishing. For local planner experiments, omit the optional reservation
snapshot; CI fetches one with a step-scoped read-only GitHub token before
planning a trusted beta candidate. No snapshot is needed for PR validation.

Remove obsolete npm versions only with explicit approval. Never unpublish the
whole package; never reuse a rejected/reserved or previously distributed version.

Sources: [GitHub release API](https://docs.github.com/en/rest/releases/releases),
[workflow events and schedules](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows),
[npm staged publishing](https://docs.npmjs.com/staged-publishing/),
[npm trusted publishing](https://docs.npmjs.com/trusted-publishers/).
