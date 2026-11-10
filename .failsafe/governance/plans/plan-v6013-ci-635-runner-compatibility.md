# Plan: v6.0.13 CI Playwright runner compatibility (#635)

**iteration**: 1 (working draft; native Qor-logic plan/audit not run in this session)
**change_class**: infrastructure
**risk_grade (proposed)**: L3 (protected CI workflow configuration)
**pr_target**: `fix/ci-635-pin-playwright-ubuntu2404-20261110` -> `main`
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

## PR trigger check

The two runner-change commits were authored with `[skip ci]` in their messages, and at initial draft-PR inspection only CodeQL/standards checks were visible; the `PR Full Test` check had not been observed. This follow-up documentation commit deliberately omits `[skip ci]` and triggers a new PR synchronization event. **No CI pass is claimed.** The owner/independent reviewer must inspect the actual GitHub workflow run and refuse merge if the full-suite check is missing or skipped.

## Threats and negative controls

1. The PR workflow must not silently skip the test suite because of a commit `[skip ci]`; on the final PR head verify GitHub Actions actually starts and completes tests.
2. The Playwright installation must run on Ubuntu 24.04 in both affected workflows with pinned Node 22 and the existing dependency lockfile.
3. The native smoke matrix must retain all seven existing target entries; no accidental host coverage reduction or target omission.
4. A mere YAML parse/static diff is not a substitute for the actual workflow run; any missing reviewer permission or PR gate remains an explicit blocker.
5. A future Playwright/runner upgrade must be independently qualified and not automatically reverse the pin.

## Acceptance evidence

- [ ] Exact diff restricted to the two named runner declarations plus this governance plan.
- [ ] Independent plan/audit PASS and protected workflow owner approval recorded.
- [ ] `pr-full-test.yml` runs on a real pull request and completes its Playwright install and `test:all` (no skipped workflow).
- [ ] `native-vsix-qualification.yml` runs on an actual v6.0.13 release-candidate branch or authorized manual dispatch; complete package/PDF/release rehearsal and native smoke matrix.
- [ ] No weakening of release workflow, secrets, permissions, tests, checksums or protected-main rules.
- [ ] Record exact passing commit SHA and workflow run IDs; do not merge before evidence.

## Non-goals

No Statewright integration work (#602), G4 signing (#638), GitHub branch ruleset changes (#636), or marketplace publication. These are separate v6.0.13 lanes with their own acceptance.
