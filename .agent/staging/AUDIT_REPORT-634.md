# AUDIT REPORT: #634 v6.0.12 release-runner correction

**Tribunal Date**: 2026-11-10
**Target**: `.failsafe/governance/plans/plan-v6012-634-release-runner-pin.md` (iteration 1). Committed blob sha256: `9b8d356238d761878661f11f51f79ace034044a4df0d85577680dd1ff752bb4c`, which equals the gate's `plan_content_hash`. Gate: `.qor/gates/2026-11-10T1500-49ff26/plan.json`.
**Candidate**: branch `fix/634-release-runner-pin-v6012-no-ci` at `3f1b2ccd2357c053fbfdde9467e21df3491a1ac1`.
- Change commit: `64422177`, on base `45c1957c` (= origin/main, the empty `release: v6.0.12` commit).
- `531dd0b7`: plan gate.
- `3f1b2ccd`: changes only `.qor/session/current` (`2026-11-09T1958-754dfc` → `2026-11-10T1500-49ff26`).

**Session**: `2026-11-10T1500-49ff26`
**Risk Grade**: L2. This is a release supply-chain change on a protected workflow, and it is narrow. The owner approved it on 2026-11-10 (#634).
**Auditor**: The Qor-logic Judge, independent, solo mode.

**Ordering**: this is a pre-implementation review of a change already committed on a branch. The change is not merged, not tagged and not run. Seal #922, PASS #919, G4 acceptance #920 and VETOs #915, #917 and #918 are preserved and are not re-litigated. The disclosed pre-anchor breaks (#340, #382) and the October VETOs #610–#612 and event `7126134e` remain as recorded (UNKNOWN/UNRESOLVED). This audit does not touch them.

---

## VERDICT: PASS

---

### Steps run

| Step | Result |
|---|---|
| Scope of the branch diff `45c1957c..3f1b2ccd` | Non-governance files: `release.yml`, `CHANGELOG.md`, `FailSafe/extension/CHANGELOG.md`, `FailSafe/extension/README.md`. Everything else is under `.failsafe/` (the plan) or `.qor/` (gate and session) |
| `git diff 45c1957c 64422177 -- .github/workflows/release.yml` | Exactly five `runs-on: ubuntu-latest` → `ubuntu-24.04` changes, in validate, build, publish-vscode, publish-openvsx and github-release. No trigger, permission, secret, environment, concurrency, timeout or step changed. No OS matrix leg was added. None of the protected items in the user rules is removed |
| `git diff 45c1957c 64422177 -- FailSafe/extension` | Only the CHANGELOG `[6.0.12]` heading (2026-11-09 → 2026-11-10) and the README `**Current Release**` line. No source, `package.json`, lockfile, script or asset changed. The version is still 6.0.12 |
| Root `CHANGELOG.md` | Same one-line date change. Root `README.md` carries no date |
| Failed run 42742575394 (`gh run view`, job logs) | push on `v6.0.12`, headSha `45c1957c`. Build & Test ran on image `ubuntu-26.04` (20261101.186.1) and failed with `Playwright does not support chromium on ubuntu26.04-x64`. Publish to VS Code Marketplace, Publish to Open VSX and Create GitHub Release were **skipped**. Artifacts: `total_count` 0 |
| GitHub Release | `releases/tags/v6.0.12` returns 404. The release list (drafts visible to this token) shows v6.0.11 as the newest |
| Open VSX (`curl`) | latest 6.0.11; `allVersions` has no 6.0.12; `/6.0.12` returns HTTP 404 |
| VS Code Marketplace (gallery `extensionquery`) | 110 version entries, newest 6.0.11, no 6.0.12 |
| Remote tag | `refs/tags/v6.0.12` → tag object `ff833f5c410d9418291303d31702c4075846b1a0` → commit `45c1957c`, tagger Knapp-Kevin, 1794277482 -0500 (2026-11-10T02:24:42Z), message `v6.0.12`. This matches the plan's record |
| v6.0.11 release run 40993501172 | success on `v6.0.11` (`73eca5b4`). All five jobs (SemVer gate, Build & Test, both publishes, GitHub Release) logged `Image: ubuntu-24.04`. The claim is true |
| One-set guard behavior for a second run on the same tag name | `release-github.cjs` `publishHistory` refuses only if an earlier attempt **started** the step "Publish every target VSIX" (not skipped, with a start time). Run 42742575394 never reached it, so a new run on the replaced tag passes the history lookup. The marketplace and Release lookups also find nothing. The guard is not weakened |
| Date consistency | `validate-vsix --source-only` on `3f1b2ccd`: `[PASS] Source release metadata validated: v6.0.12 (2026-11-10)`. It compares the README `Current Release (date)` with the CHANGELOG heading. The PDF generator (`build-release-notes-pdf.cjs`) does not render a date; it renders the version and sections from the `[6.0.12]` heading, so the date has no effect on PDF content. 2026-11-10 is before the G4 expiry of 2026-12-09 |
| Focused node tests on `3f1b2ccd` | `releaseWorkflow` 10/0, `releasePdf` 9/0, `releaseGate` 12/0, `system-state-currency` 4/0 |
| Native lints on the plan | `plan_iteration_status_lint`, `plan_grep_lint`, `plan_test_lint`: rc 0. `prompt_injection_canaries`: rc 0. `verify-ledger --post-anchor`: "post-anchor clean (boundary=#382)". Ledger Entries #920–#922 are present |
| NOT RUN (per instruction) | VS Code host suites, Playwright, `validate.ps1`, packaging, PDF, `verify-set`, installed-VSIX. These are the orchestrator's requalification on `3f1b2ccd` and are not asserted here |

### Audit Results

- **Security / OWASP**: PASS. No secret, token scope, permission or environment changed. `publish-*` stays behind the `production` environment. Runner image pinning narrows the execution environment; it does not widen it.
- **Ghost UI**: not applicable.
- **Razor**: not applicable (no source change).
- **Dependency**: PASS. There is no dependency change. Playwright 1.58.1 is kept, and it supports ubuntu-24.04, as v6.0.11's build evidences.
- **Macro / Infrastructure alignment**: PASS. Every factual claim in the plan was verified: the failure cause, no publication, the v6.0.11 image, the original tag identity and the extension-tree scope.
- **Orphan**: not applicable.

### Rulings

1. **Diff scope**: exactly as claimed. There is no product-source change.
2. **No-publication evidence**: verified on 2026-11-10. There are 0 artifacts, all publish and release jobs were skipped, there is no GitHub Release, Open VSX's latest is 6.0.11 (6.0.12 returns 404), and the Marketplace has no 6.0.12.
3. **The v6.0.11 run on ubuntu-24.04**: true for all five jobs.
4. **Date consistency**: consistent across both CHANGELOG headings, the extension README and `validate-vsix`. The PDF carries no date. The date is inside the G4 window.
5. **Tag-replacement procedure**: sound for this one unpublished tag. The publication checks are re-run immediately before the change. The remote tag is deleted, a new annotated tag is created on the new release commit, and the old and new identities are recorded in the seal. Exactly one run is started, and the work is refused and stopped if any destination shows 6.0.12. It does not conflict with the one-set guard (FX974), which keys on a started publish step, or with `docs/RELEASE_RECOVERY.md`. It does not apply to any tag that has started publishing. Execution requirements (non-blocking, but binding on the operator) are listed in N2.
6. **Requalification scope**: acceptable. The extension tree differs from seal #922's only in two packaged date lines, so the checks that consume changed bytes are required, and the plan lists all of them: `validate.ps1` (docs coherence on the README and CHANGELOG), `test:node` with `releaseWorkflow.test.cjs` over the new `release.yml`, `validate-vsix --source-only`, `release:preflight`, the 8-target package (README and CHANGELOG are inside each VSIX), the PDF, `verify-set`, and installed-VSIX #475 on both hosts. Skipping the local host suites and Playwright is acceptable because no code changed. In addition, the tag-triggered build job itself runs `xvfb-run -a npm run test:all` (lint, runner coverage, citations, extension host, `test:node` and Playwright) on ubuntu-24.04 before packaging, so the pinned image is exercised end to end before any publish.

### Violations Found

None.

### Non-blocking items

- **N1** `docs/SYSTEM_STATE.md:7,17,19` still says "v6.0.12 (2026-11-09)", "CHANGELOG dated 2026-11-09" and "not tagged". `system-state-currency` checks only the version, so nothing fails. Update it in the implementation or seal commit so that the Tier 1 state matches the re-dated release.
- **N2** Binding execution requirements for the tag replacement:
  - Do **not** delete run 42742575394 (`RELEASE_RECOVERY.md:83`). Its history is evidence.
  - Do **not** re-run it. A re-run would rebuild `45c1957c` with the old `ubuntu-latest` workflow.
  - The new tag's target must be the merged release commit on `main` that contains `64422177`'s tree.
  - Record in the seal: the old tag object `ff833f5c…` → `45c1957c`; the new tag object → new commit; and the no-publication re-check outputs, timestamped.
- **N3** The new seal must cite the G4 decision SHA-256 `15db89647f398b84b4ea536bf70c2d96e27147a7a2eb94ed204ee75df0b6118b`, as condition 2 of acceptance #920 requires. The plan lists #920 under "Preserved" but does not state that the new seal cites it.
- **N4** The date is "the actual publication date". If the `production` approval or publication slips past 2026-11-10, the CHANGELOG and README date would again differ from the real date. That would not fail any gate, but it would contradict the plan's own rationale. Publication must still happen before 2026-12-09 (the G4 expiry).
- **N5** Other workflows still on `ubuntu-latest` are tracked separately, per the plan. They are out of scope here.

---
**Verdict**: PASS (Risk Grade L2). The release stays NO-GO until requalification on the exact candidate, merge, the seal (N2, N3) and owner publication approval.
