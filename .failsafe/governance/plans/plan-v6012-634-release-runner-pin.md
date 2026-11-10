# Plan: #634 recover the unpublished v6.0.12 release from runner-image drift

**iteration**: 1
**change_class**: governance (protected CI workflow correction; no product source change)
**risk_grade (proposed)**: L2 (release supply chain; narrow, no new trigger, permission or secret)
**pr_target**: `main`, then a one-time replacement of the unpublished `v6.0.12` tag (owner-authorized on 2026-11-10, #634)
**base**: `main` = `45c1957c21b3151c9ac0b3944b99d1e09f6f3b33` (empty `release: v6.0.12` commit on seal #922's commit `1c6767d4`)

## Failure being recovered (evidence)

- The tag-triggered run [42742575394](https://github.com/MythologIQ-Labs-LLC/FailSafe/actions/runs/42742575394) failed in Build & Test at `npx playwright install --with-deps chromium`: `Playwright does not support chromium on ubuntu26.04-x64`. `ubuntu-latest` now resolves to the `ubuntu-26.04` image (20261101.186.1), and the repository's Playwright 1.58.1 has no browser build for it.
- **No publication occurred** (verified 2026-11-10):
  - the run uploaded 0 artifacts;
  - the GitHub API lists no release for tag `v6.0.12`;
  - Open VSX's latest version is 6.0.11 and its version list has no 6.0.12;
  - the VS Code Marketplace gallery query lists no 6.0.12;
  - all four publish and release jobs were skipped.
- **Original tag (preserved in this record):** annotated tag object `ff833f5c410d9418291303d31702c4075846b1a0` → commit `45c1957c21b3151c9ac0b3944b99d1e09f6f3b33`, tagger Knapp-Kevin, 1794277482 -0500, message `v6.0.12`.

## Change (exactly this, nothing else)

1. `.github/workflows/release.yml`: the five `runs-on: ubuntu-latest` lines become `runs-on: ubuntu-24.04` (jobs: validate, build, publish-vscode, publish-openvsx, github-release). No trigger, permission, secret, environment, concurrency, timeout or step changes. `ubuntu-24.04` is a supported GitHub-hosted image on which Playwright's chromium installs. The v6.0.11 release run 40993501172 succeeded on image `ubuntu-24.04` (verified from its log).
2. Release date markers reconciled to the actual publication date, **2026-11-10** (owner direction: the original date was 2026-11-09):
   - both `CHANGELOG.md` `[6.0.12]` headings;
   - `FailSafe/extension/README.md` `**Current Release**: v6.0.12 (2026-11-10)`.

   The root README has no date. The PDF is generated in CI from the changelog.
3. **Not changed:**
   - product source (`FailSafe/extension/src`, `package.json`, the lockfile, scripts, assets);
   - Playwright version, extension version 6.0.12, and every other workflow.

   The extension tree changes only in the two date lines of its README and CHANGELOG. Other workflows still on `ubuntu-latest` are tracked separately (not this release).

## Qualification (on the exact new release commit)

The source code is unchanged, so the code-level evidence of seal #922 carries forward (`git diff 45c1957c <new> -- FailSafe/extension` shows only the two date lines). The checks re-run are the ones that consume the changed files:
- `scripts/validate.ps1`;
- `npm run test:node`, which includes `releaseWorkflow.test.cjs` over `release.yml`;
- `validate-vsix --source-only`;
- `release:preflight`;
- `package-all-targets` (8 targets);
- `build-release-notes-pdf`;
- `release-artifacts verify-set`;
- the installed-VSIX #475 run on VS Code 1.122.1 and 1.145.2.

## Tag replacement (one-time exception, owner-authorized for this unpublished tag only)

After this correction passes audit and qualification, and immediately before tagging, the no-publication checks above are re-run. Then:
- the remote `v6.0.12` tag is deleted and a new annotated `v6.0.12` tag is created on the new release commit;
- the old and new tag objects and targets are recorded in the seal;
- exactly one tag-triggered run is started.

If any destination shows a 6.0.12 publication, the replacement is refused and work stops.

## Governance

- **Preserved:**
  - seal #922;
  - audit PASS #919;
  - G4 acceptance #920 (decision sha256 `15db8964…118b`; the 2026-11-10 publication is before the 2026-12-09 expiry);
  - VETOs #915, #917 and #918;
  - all history.
- **New entries:** a gate entry for this plan, then an implementation entry and a seal that cite #922 and record the tag exception.
- **Unchanged:** the October VETOs #610–#612 and event `7126134e` remain UNKNOWN/UNRESOLVED.

## Open questions

None. Owner approval for the workflow pin, the date and the tag exception is in #634 and the owner instruction of 2026-11-10.
