# Plan: v6.0.13 CI Playwright runner compatibility (#635)

**iteration**: 1 (submitted for native `/qor-plan` gate and independent `/qor-audit`; implementation preceded audit, disclosed below)
**change_class**: infrastructure
**risk_grade (proposed)**: L3 (protected CI workflow configuration)
**pr_target**: `fix/ci-635-playwright-ubuntu24-qualifiable-20261110` -> `main`
**issue**: #635; planning umbrella #637
**baseline**: `main` after v6.0.12 publication (release tag source `0e70e53956e893cda40c7eea01722dfc25db7cf0`)
**intent**: restore actionable PR and native packaging qualification gates after `ubuntu-latest` switched to unsupported Ubuntu 26.04.

## Evidence and bounded change

- Failed v6.0.12 tag run `42742575394` showed `npx playwright install --with-deps chromium` fail with `Playwright does not support chromium on ubuntu26.04-x64`; the successful publication pinned all five release jobs to `ubuntu-24.04` (#634).
- `.github/workflows/pr-full-test.yml`: pin only `jobs.full-test.runs-on` from `ubuntu-latest` to `ubuntu-24.04` because this job installs Playwright Chromium.
- `.github/workflows/native-vsix-qualification.yml`: pin only `jobs.package-all.runs-on` from `ubuntu-latest` to `ubuntu-24.04` because it builds the branded PDF with Playwright.
- Retain the separate `smoke` matrix's explicit OS variety (Linux native, Alpine container, Windows, macOS); it does not install Playwright, and pinning its Linux targets would unnecessarily change platform coverage.
- Leave unrelated `ubuntu-latest` workflows unchanged until there is evidence they need the same pin. No changes to Node, dependency versions, package scripts, release publishing, permissions, secrets, triggers or branch protection.

**Ordering disclosure**: The two runner-label edits were staged on a dedicated branch before this plan draft was committed. This is not a claim of prospective audit PASS. Native `/qor-plan` and independent `/qor-audit` remain required before integration into protected `main`.

## CI trigger safeguard

This replacement branch uses commit messages **without** `[skip ci]` on every change. The earlier draft PR #639 was left unmerged because its initial commits included CI-suppression markers and a full PR suite had not been observed. The new PR must show an actual complete `PR Full Test` run; do not accept any absent or skipped required check as a PASS.

## Threats and negative controls

1. The PR workflow must not silently skip the test suite because of a commit `[skip ci]`; on the final PR head verify GitHub Actions actually starts and completes tests.
2. The Playwright installation must run on Ubuntu 24.04 in both affected workflows with pinned Node 22 and the existing dependency lockfile.
3. The native smoke matrix must retain all seven existing target entries; no accidental host coverage reduction or target omission.
4. A mere YAML parse/static diff is not a substitute for the actual workflow run; any missing reviewer permission or PR gate remains an explicit blocker.
5. A future Playwright/runner upgrade must be independently qualified and not automatically reverse the pin.

## Acceptance evidence

- [x] Exact diff restricted to the two named runner declarations plus this governance plan and its `.qor` gate artifacts and session pointer (audit #927).
- [x] Independent plan/audit PASS (ledger #927). Protected-workflow owner approval: the owner instruction of 2026-11-10 (v6.0.13 execution brief, Priority 1) directs this change and its merge through the normal protected-branch PR process after mandatory checks and audit PASS.
- [ ] `pr-full-test.yml` runs on a real pull request and completes its Playwright install and `test:all` (no skipped workflow).
- [ ] `native-vsix-qualification.yml` runs on the first actual v6.0.13 release-candidate branch push (`release/v6.0.13-rc*`), with a complete package/PDF/release rehearsal and the native smoke matrix. **Sequencing (2026-11-10):** this workflow's "published lookups" step fails by design for an already-published version. On any branch still at 6.0.12, including this PR's branch or a manual dispatch of it, the run stops before the artifact upload, so the smoke matrix cannot run. A throwaway branch with a fake version bump would violate the CI budget rule against branches opened only to trigger CI. The native qualification is therefore taken on the real v6.0.13 RC branch, cut from `main` after this PR merges, before any v6.0.13 tag. A failure there is fixed forward under its own gate and blocks the v6.0.13 release, not this merge. The pin itself is the same one already proven by release run 42842387243 (Playwright chromium installed and the PDF built on `ubuntu-24.04`).
- [ ] No weakening of release workflow, secrets, permissions, tests, checksums or protected-main rules.
- [ ] Record exact passing commit SHA and workflow run IDs; do not merge before the PR Full Test evidence and audit PASS. The merge goes through the normal PR merge (no bypass), and GitHub rule-suite evaluation for the merge must report `pass`, not `bypass` (#636 acceptance evidence).

## Non-goals

No Statewright integration work (#602), G4 signing (#638), GitHub branch ruleset changes (#636), or marketplace publication. These are separate v6.0.13 lanes with their own acceptance.
