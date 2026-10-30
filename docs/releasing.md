# Releases

One workflow handles checks, npm staging and GitHub finalization:
[CI](https://github.com/ciqol/resenv/actions/workflows/ci.yml).

## Normal flow

1. Merge releasable changes into `beta`. CI checks dependencies, lint, types and
   coverage, builds one versioned archive, and tests those same bytes on Linux
   Node 20/22/24 and macOS Node 24. The protected release job preserves the tested
   package and notes in a private GitHub draft, then stages it in npm through OIDC.
2. Review and approve the version in npm with 2FA. Wait for public availability.
   Promote `latest` to the approved version in your maintainer session:

   ```sh
   npm stage view <stage-id> --json
   npm stage approve <stage-id>
   npm dist-tag add @ciqol/resenv@<approved-version> latest
   ```

3. Open **Run workflow**, select `beta`, choose action **finalize**, and enter
   the approved version, such as `0.1.0-beta.3`. This job verifies the preserved
   archive against public npm integrity, creates its Git tag at the original
   source commit, and publishes the GitHub prerelease. It runs no build or npm
   operation. Repeating Finalize is safe.

The default manual action is **check**, which only runs validation. Choose
**release** to build/test/stage a fresh candidate manually. PRs cannot stage or
finalize. There is no scheduler, release queue, state machine or recovery job.

## Versions and preserved candidates

`beta` remains the sole default/release branch. Versions start at `0.1.0-beta.1`.
Official semantic-release analysis and notes plugins decide whether changes
since the last recorded Git release need another beta. The counter exceeds
all real release tags, GitHub draft/release versions and public npm versions.
A draft reserves its number before npm is contacted; failed or rejected
candidates may leave gaps. Keep their drafts so numbers are not reused.

A draft is simply the original release notes plus two assets: `release.json`
and the tested archive. The plan hash is stored in the draft notes; the plan
contains the source SHA, package version, archive hashes and npm integrity.
No Git tag or public GitHub release is created before successful npm publication.
Actions artifacts last seven days, but Finalize uses the draft assets instead.
Do not edit the preserved plan, archive or hash marker.

Merges can continue while approvals are pending. Each new candidate gets its
own version. Finalize records the original source even after beta advances,
provided that source remains an ancestor of beta. It never moves npm channels
backward or requires their current pointers to equal an older candidate.
Maintainers choose approval order and keep `beta`/`latest` on the intended
approved version. There is no automatic dispatch of additional CI runs.

## Failures and old releases

If staging fails or its response is lost, inspect npm before doing anything
else. The existing draft prevents the same version from being staged again.
If the stage exists, approve or reject it in npm. An approved version can still
be finalized from its original draft. If no stage exists, or it was rejected,
leave the draft reserved and start a fresh **release** run for a new version.
A partial draft upload is handled the same way; no archive is rebuilt under an
already reserved version.

Finalize stops on changed assets, registry integrity, source ancestry or an
existing conflicting tag. It also stops if npm has not made the version public.
Fix/review the reported condition and repeat **finalize** for the same version.
Legacy public versions without a preserved draft require separate recovery
using their original tested archive and evidence; they still reserve their
numbers. Never rebuild/restage a public version or unpublish the whole package.
Remove obsolete npm versions only with explicit authorization.

## Setup and boundaries

Keep the npm trusted publisher at `ciqol/resenv`, workflow `ci.yml`, environment
`release`, with stage-only permission. The existing GitHub environment permits
only `beta` and has no required GitHub reviewers; npm approval is the publication
gate. Verify that setup before setting `RELEASE_ENABLED=true`. Environment or
protection changes need explicit authorization.

The publisher keeps the reviewed Node.js 24.19.0/npm 11.17.0 platform, installs
no project dependencies and stages only the hash-verified archive. Finalize
needs GitHub contents write permission, with no npm credentials or OIDC. No
permanent npm tokens, local publication or npm login setup are needed for
contributors. `latest` remains manual; CLI upgrades and added npm permissions
are separate reviews. The existing security review expiry still applies; see
[release security](release-security.md).

The root and ordinary local builds remain private. `npm run release:check`
validates locally without publishing. Moving to `main` is a separate release
policy change.
