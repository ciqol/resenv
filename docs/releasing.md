# Public release checklist

The repository remains private; both the root and generated `dist/package.json`
have `private: true`.
There is no publishing workflow. Complete these steps before requesting a
separate public release:

- Confirm the open-source license and copyright holder, add `LICENSE`, and
  update `package.json` and the lockfile consistently.
- Review tracked files and Git history for secrets, dotenv files, personal
  paths, internal references, and generated artifacts. Keep all `.env` files
  and `.env.keys` files out of this repository.
- Run `npm run build`, `npm test` and `npm run test:package`. Confirm CI on the supported
  operating systems; a workflow definition alone is not validation.
- Run the optional Nx and upstream ciphertext checks against the versions
  documented in `docs/validation.md`.
- Refresh dependency signatures, provenance, licenses and advisory checks.
  Inspect the packed files and preserve third-party license notices.
- Confirm the `@ciqol/resenv` package name and publishing access with the
  registry. Configure versioning from commit history in the release workflow
  and prepare release notes; do not hand-edit the version or reuse an archive
  already installed by a consumer.
- Enable and verify private vulnerability reporting, then update `SECURITY.md`
  with the actual reporting channel and supported-version policy.
- Obtain explicit approval before changing repository visibility or changing
  the build's publication guard for `dist/package.json`. Keep the development
  manifest private. Those are separate operations from preparing the source.

After approval, publish the already-tested `dist/` artifact through a reviewed release
process. Do not add publication to pull-request CI or store registry credentials
in this repository.
