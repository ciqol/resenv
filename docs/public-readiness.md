# Public repository readiness

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
- State the unresolved license clearly; do not claim an open-source release.
- Mark historical validation/dependency entries so old APIs and version plans
  are not mistaken for current usage instructions.
- Remove unnecessary references to other project names from current docs.
  Historical commits remain unchanged.
- Direct security questions from the issue chooser to the security policy.
- Prepare CI pushes for the requested sole `titan/beta` branch. PR checks and
  manual dispatch remain; publishing stays disabled.
- Recalculate maturity: 91% including generated output, 100% for the maintained
  source tree. These scores do not establish release readiness.

## Remaining decisions and settings

1. **License:** both manifests are `UNLICENSED`, and no `LICENSE` exists. Select
   the license and copyright holder before presenting the project as open source.
2. **Branches:** only `titan/beta` can remain while npm publication is disabled.
   A local semantic-release dry run with only that prerelease branch returned
   `ERELEASEBRANCHES`. The current engine requires a real stable release branch
   before the first npm beta, or a reviewed change of release tooling. See
   [release preparation](releasing.md).
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
| `titan/beta` | `cb6ebe92c3182051a034dd29e192d51a182b5d22` | Keep, including cleanup; make default |
| `titan/bootstrap-envref` | `b25da7cfe730bfaca0a470d9a31a303cef7d33ad` | Delete branch pointer |
| `titan/rename-resenv` | `60e70a4e43b39fc9a87379990e4ed44de50726cb` | Delete branch pointer |
| `titan/prepare-first-release` | `0c313483d7123b8b4afd360b4e8daae58abc4241` | Delete after changing the default |

All three older heads are ancestors of `titan/beta`; none contains unique
commits. Re-check the remote heads before deletion and stop if any changed.
If retaining the stable branch for semantic-release, preserve
`titan/prepare-first-release` and revise the plan instead of deleting it.

After license and branch decisions, obtain explicit approval for the default
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
