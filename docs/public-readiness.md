# Public repository readiness

## Tashtit governance review — 2026-10-13

Read-only GitHub inspection as `titan-ron` confirmed a public repository with
`beta` as its default branch. The first beta release is recorded; npm's `beta`
and `latest` tags both point to `0.1.0-beta.1`. The release environment permits
only the `beta` branch. No rulesets or beta branch protection are enabled.

The maintainer approved all three security changes, applied as `titan-ron` on
2026-10-13 and verified through GitHub API read-back:

| Setting | Before | Verified |
| --- | --- | --- |
| Private vulnerability reporting | Disabled | Enabled |
| Secret scanning | Disabled | Enabled |
| Secret scanning push protection | Disabled | Enabled |

These provide a private reporting channel and detection/prevention of supported
credential patterns. `titan-ron` is the approver and implementation owner.
The [private reporting URL](https://github.com/ciqol/resenv/security/advisories/new)
redirects signed-out visitors to GitHub sign-in with that reporting route as
the return target. Report submission was not exercised. Secret scanning
returned no open alerts at verification time; this is not proof of a completed
history scan. The [security policy](../SECURITY.md) now links directly to private
reporting. Access, visibility, merge methods, branch rules and release controls
were unchanged.

Pre-change setting snapshots are retained outside the repository. Rollback
restores the two disabled scanning values with the repository PATCH endpoint
and disables private reporting with its DELETE endpoint, followed by read-back.
The API supports these inverse operations; rollback has not been executed.
See [GitHub's repository API](https://docs.github.com/en/rest/repos/repos).

## Follow-up review — 2026-10-12

The repository is now public, with `beta` as the sole remote and default branch.
CI has staged the first `0.1.0-beta.1` candidate; npm approval and release
recording are still pending. The accidental public `1.0.0` has been removed,
and the `0.0.0-stage` placeholder remains. Recheck live state before release work.

Private vulnerability reporting returned `enabled: false` during this review.
The security policy's reporting prerequisite remains outstanding until that
setting is enabled and verified. See [the session handoff](maintainer-handoff.md)
and [validation](validation.md) for current behavior and observed checks.
The dated transition plan below is historical evidence.

## Approved transition - 2026-10-10

The current release pipeline and launch state are documented in [releasing](releasing.md).
The release-tool review and expiring advisory policy are in [release security](release-security.md).
Earlier dated entries below remain historical evidence and are superseded where
the current release guide describes a different state.

The user approved public visibility, default branch `beta`, and deletion of
the four older ancestor branch references. A fresh settings snapshot, complete
Git bundle and verified restore are retained outside the repository. Recheck
remote heads and ancestry immediately before deletion. Other governance changes
and PR creation remain outside this transition.


Reviewed on October 8, 2026 at `cb6ebe92c3182051a034dd29e192d51a182b5d22`, before
the accompanying documentation cleanup. Repository: `ciqol/resenv`. Maintainer
and authenticated GitHub account: `titan-ron`.

## Result

No real credentials or private machine/employer references were identified in
the reviewed Git history or hosted Actions outputs. The source can become a
public experimental repository after the remaining decisions below. This does
not establish npm release readiness or an independent security audit.

The repository remains private. No branch, default-branch, access, protection,
or visibility setting was changed by this audit.

## Exposure review

- Gitleaks 8.30.1 scanned all 24 commits reachable from the fetched refs. Its
  nine matches were synthetic Doppler credentials in tests: eight use a dummy
  marker and one uses an alternative fixture marker with sequential digits.
  The tests inject provider and credential helpers instead of authenticating
  those values. No detector exception or history rewrite was added.
- TruffleHog 3.97.4 scanned the local Git history with network verification and
  update checks disabled. It reported no credentials. Sandbox process-inspection
  restrictions produced temporary-cleanup warnings; the scan completed.
- Reachable-blob inspection found no committed dotenv/private-key files,
  absolute developer paths, employer references, or private service URLs.
- All 14 existing Actions log archives and 14 unexpired package artifacts were
  downloaded into a private audit folder and scanned offline. Gitleaks found
  no secrets. Package inspection covered 755 regular files across the archives
  and found no credential files or private developer/employer references.
- There are no existing issues or pull requests to review for public exposure.
- The latest pre-cleanup [CI run](https://github.com/ciqol/resenv/actions/runs/37778134741)
  passed on Linux Node 20/22/24 and macOS Node 24.

Detection tools cannot prove the absence of every secret. No candidate
credential was sent to a provider to test whether it works. Git history remains
visible after deleting an ancestor branch. GitHub exposes existing Actions
history and logs when visibility becomes public; see
[GitHub's visibility documentation](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility).

## Cleanup prepared

- Ignore local `.idea/` settings without deleting the developer's files.
- Keep installation and contributor text independent of repository visibility.
- Include the MIT license and ciqol contributors copyright, selected on October 8.
  Registry publication remains disabled.
- Mark historical validation/dependency entries so old APIs and version plans
  are not mistaken for current usage instructions.
- Remove unnecessary references to other project names from current docs.
  Historical commits remain unchanged.
- Direct security questions from the issue chooser to the security policy.
- Prepare `beta` as the sole normal release branch on npm's `beta` channel. CI
  also checks the current `titan/beta` preparation branch until branch cleanup.
  PR checks and manual dispatch remain; publishing stays disabled.
- Recalculate maturity: 91% including generated output, 100% for the maintained
  source tree. These scores do not establish release readiness.

## Remaining decisions and settings

1. **License resolved:** MIT was selected on October 8, 2026, with copyright
   held by ciqol contributors. The root and generated manifests declare MIT;
   the [license](../LICENSE) is included in the package archive.
2. **Branches:** the selected sole normal release branch is `beta`, with npm
   channel `beta`. A local dry run with only that branch calculated `1.0.0`;
   another stable branch is unnecessary. Default-branch selection and deletion
   of the older branches remain pending. See [release preparation](releasing.md).
3. **Private reporting:** the endpoint returned HTTP 404 while the repository
   is private. Enable and verify it after the approved visibility transition,
   and verify the reporting option described in SECURITY.md. It is not yet available.
4. **Protections:** all branch entries report `protected: false`; the ruleset
   API returned HTTP 403 under the current private plan. Re-audit effective
   protections after the transition. No protection policy was applied.

## Proposed transition

This plan is for review. It does not authorize npm publication, collaborator or
team changes, merge-policy changes, rulesets, or a pull request.

| Branch | Observed head | Action for the beta-only layout |
| --- | --- | --- |
| `beta` | Same reviewed source head as the preparation branch | Keep; make default |
| `titan/beta` | Current preparation branch | Delete after verifying its head is retained by `beta` |
| `titan/bootstrap-envref` | `b25da7cfe730bfaca0a470d9a31a303cef7d33ad` | Delete branch pointer |
| `titan/rename-resenv` | `60e70a4e43b39fc9a87379990e4ed44de50726cb` | Delete branch pointer |
| `titan/prepare-first-release` | `0c313483d7123b8b4afd360b4e8daae58abc4241` | Delete after changing the default |

At the original audit, all three older heads were ancestors of `titan/beta`;
none contained unique commits. Before deletion, re-check every remote head and
verify all four older branches are ancestors of the retained `beta` head. Stop
if any contains newer or unique work.

After the branch decision, obtain explicit approval for the default
branch, listed deletions, public visibility, and private vulnerability reporting.
The CI push filter and release docs are prepared for this layout. Apply
only approved scopes and verify branches, default, visibility, reporting and
CI by read-back. Keep npm publishing disabled until its separate prerequisites
are complete.

## Recovery

A private settings snapshot and complete Git bundle are retained outside this
repository. Bundle verification and a restore into a separate local bare
repository reproduced all four original remote branch heads exactly.

Restore deleted branch pointers from their recorded SHAs or bundle before
restoring the old default branch. Visibility can be set back to private, but
public forks, downloaded code and copied logs cannot be recalled. A settings
rollback cannot undo public disclosure. Never overwrite newer branch work or
weaken protections to force a restore.
