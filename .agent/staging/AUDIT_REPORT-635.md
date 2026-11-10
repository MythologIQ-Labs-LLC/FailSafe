# AUDIT REPORT: #635 CI Playwright runner pin (PR #640, v6.0.13 cycle)

**Tribunal Date**: 2026-11-10 (evidence read through 16:23Z)

**Target**: `.failsafe/governance/plans/plan-v6013-ci-635-runner-compatibility.md`, iteration 1.
- Committed blob sha256: `e4c8ce8eef72e4e7fb3e1cf344d33a81c8d267ac238f2871ab2e4b66e9958d5a`, which equals the gate's `plan_content_hash`.
- Gate: `.qor/gates/2026-11-10T1620-7f3ffb/plan.json`.

**Candidate**: worktree `C:\dev\mythologiq\FailSafe-ci635`, branch `fix/ci-635-playwright-ubuntu24-qualifiable-20261110`.
- Local HEAD `9c3414c9` (unpushed). Remote PR head `047b0e62`. Base `origin/main` `f923fffb`.
- Commits on the branch:
  - `0817bdac`: `pr-full-test.yml`;
  - `2edb9013`: `native-vsix-qualification.yml`;
  - `047b0e62`: the plan;
  - `9c3414c9`: plan edit, gate files and `.qor/session/current`.

**Session**: `2026-11-10T1620-7f3ffb`
**Risk Grade**: L3, as declared. The change is to protected CI workflow configuration. It is narrow and does not publish.
**Auditor**: The Qor-logic Judge, independent, solo mode.

**Ordering**: implementation preceded audit. The two runner-label commits predate the plan commit, and the plan says so ("This is not a claim of prospective audit PASS"). This audit is therefore a retrospective review of a change that is committed on a branch but not merged. No local test suites were run, because this is CI-only.

---

## VERDICT: PASS

---

### Steps run

| Step | Result |
|---|---|
| `git diff f923fffb 9c3414c9 -- .github` | 4 changed lines. `pr-full-test.yml` `jobs.full-test.runs-on` and `native-vsix-qualification.yml` `jobs.package-all.runs-on` change from `ubuntu-latest` to `ubuntu-24.04`. No trigger, permission, secret, environment, concurrency or step changed |
| `smoke` matrix | Untouched. All 7 entries are unchanged: linux-x64 `ubuntu-latest`, linux-arm64 `ubuntu-24.04-arm`, alpine-x64 `ubuntu-latest` + `node:22-alpine`, win32-x64, win32-arm64, darwin-x64 `macos-15-intel`, darwin-arm64 `macos-14` |
| Whole-branch diff `origin/main..HEAD` | Two YAML lines; the plan; `.qor/gates/2026-11-10T1620-7f3ffb/*`; `.qor/session/current` |
| CI-suppression markers | Searched the full message of each of the 4 commits for `skip ci`, `ci skip`, `skip-checks` and `no ci`: 0 matches in every commit |
| `gh run list --workflow pr-full-test.yml` | Run **42851974957** on `047b0e62` (pull_request) is **in_progress**. Its job carries label `ubuntu-24.04`. Completed successfully so far: npm ci, **`npx playwright install --with-deps chromium`**, `npm run compile`. "Run complete suite with bounded transport retry" was still in progress at 16:23Z. **Its conclusion is not yet known** |
| PR #640 | OPEN, draft, base `main`. Other checks completed with SUCCESS (CodeQL, Semgrep, Dependency Review, standards, compile/lint on three OSes, verify-vsix-guardrails). Full Test is IN_PROGRESS |
| Superseded #639 | CLOSED at 16:09:13Z (head `a723e84f`). Its PR Full Test run 42851438295 then **completed with success** at 16:21:57Z on `ubuntu-24.04`, including the Playwright install and the full suite. Its first two commits (`dbbd7172`, `5ab5a11a`) carry `[skip ci]` |
| Release run 42842387243 (v6.0.12 tag, `0e70e539`) | success. Build & Test ran on `ubuntu-24.04`: Playwright install succeeded, `xvfb-run -a npm run test:all` succeeded, the branded PDF was generated, and verify-set passed. All publish jobs succeeded |
| Native qualification sequencing | Confirmed (see Rulings, item 3) |
| Rulesets and rule suites | Confirmed (see Rulings, item 4) |
| Razor, Ghost UI, Dependency, Orphan | Not applicable. There is no source, UI or dependency change; the change is two YAML runner labels |

### Audit Results

- **Security / OWASP**: PASS. No token scope, permission, secret or environment changed. Pinning a runner image narrows the execution environment.
- **Infrastructure alignment**: PASS. The failure cause (#634 run 42742575394, Playwright refusing ubuntu26.04) and the proof that the same pin works (run 42842387243) were both verified.
- **Macro**: PASS. The pin is limited to the two jobs that install Playwright. The plan deliberately leaves other `ubuntu-latest` uses alone; that choice is stated and bounded.
- **User CI-budget rules**: complied with. The change adds no trigger, OS leg, `pull_request_target`, `workflow_run` or schedule. It removes no concurrency setting, draft skip or `timeout-minutes`. The plan rejects a throwaway fake-version branch.

### Rulings

1. **Diff scope**: exactly the two named `runs-on` lines, with the smoke matrix intact. The plan's acceptance item "restricted to the two named runner declarations plus this governance plan" understates scope slightly, because the branch also adds gate files and moves the session pointer. These are governance artifacts only (N2).
2. **CI actually runs**: yes. No branch commit carries a suppression marker. PR Full Test run 42851974957 started and has passed the Playwright install on `ubuntu-24.04`. **It is still running, so it is neither PASS evidence nor a failure yet.** In addition, pushing the local `9c3414c9` will start a new run and cancel 42851974957 (`concurrency: cancel-in-progress: true`). The required merge evidence is therefore a **completed, successful PR Full Test on the final PR head** (`9c3414c9` or later), as the plan's own threat 1 requires (N1).
3. **Native qualification sequencing: sound, and it adequately protects v6.0.13.**
   - The native workflow triggers only on `workflow_dispatch` and on pushes to `release/v*-rc*`.
   - Step "Rehearse the release guard published lookups" runs `already-published --checks vscode,openvsx,release` for the `targets.json` version. `release-artifacts-cli.cjs` `alreadyPublishedCommand` returns 1 whenever any lookup finds the version, and the package version is 6.0.12, which is published. The job therefore fails before "Upload the target VSIX set", and the `smoke` jobs (`needs: package-all`) never run.
   - A fake-version branch would breach the user-level rule against branches opened only to trigger CI.
   - Moving qualification to the first real `release/v6.0.13-rc*` push keeps it **before any v6.0.13 tag**, and a failure there blocks the v6.0.13 release.
   - The specific risk being fixed, Playwright plus the PDF on `ubuntu-24.04`, is already proven by release run 42842387243.
   - The residual exposure is the smoke matrix's unchanged `ubuntu-latest` (26.04) legs for linux-x64 and alpine. They do not install Playwright, but they will first run on 26.04 at that RC push. They are caught before tagging (N3).
4. **Merge acceptance via rule-suite `pass`: valid, but as per-merge evidence only.**
   - Ruleset "Production Block" (id 16423247) is active on the default branch: deletion, non_fast_forward, pull_request (0 required approvals), CodeQL code_scanning, code_quality.
   - Admin roles can bypass "always". The older ruleset "main-branch protection" is disabled.
   - The four v6.0.12 pushes show `result=bypass`. For example, rule suite 5024054118 failed `pull_request` ("Changes must be made through a pull request") and `code_scanning` (waiting for CodeQL), and was bypassed.
   - A normal PR merge whose PR has CodeQL results can therefore evaluate to `pass`. Recording that rule-suite id and `result=pass` for the merge is valid, objective evidence that this merge did not bypass the rules.
   - It does not show that the ruleset is adequate (it requires 0 approvals and has always-bypass actors), and it does not by itself close #636. #636 remains a separate lane, as the plan's Non-goals say.
   - One parameter is unusual: `require_extra_approval_for_unattributed_changes: true`. If GitHub requires an approval for these commits, a solo owner may not reach `pass` without a reviewer. In that case the criterion correctly forces a stop rather than a bypass (N4).
5. **Ordering honesty**: honest. Implementation preceded the plan and is disclosed, and no prospective PASS is claimed. One statement is stale, though not false when written: "#639 was left unmerged because … a full PR suite had not been observed". That was true at its closure (16:09Z), but #639's run 42851438295 later completed successfully at 16:21Z. The supersession is still justified by #639's `[skip ci]` commits (N5).

### Violations Found

None.

### Non-blocking items (merge-time obligations and accuracy notes)

- **N1**: Do not merge until PR Full Test **completes with success on the final PR head**. Pushing `9c3414c9` will cancel run 42851974957 and start a new one. Record the run id and the head SHA. A cancelled, skipped or still-running run is not acceptance.
- **N2**: Correct the scope wording in the acceptance list to include the `.qor` gate files and the session pointer.
- **N3**: At the first `release/v6.0.13-rc*` push, the native qualification must complete package-all, the PDF, the rehearsals and all 7 smoke legs, including the `ubuntu-latest` linux-x64 and alpine legs now on 26.04, before any v6.0.13 tag. Fix any failure forward under its own gate.
- **N4**: Record the merge's rule-suite id with `result=pass`. If the ruleset yields `fail` (for example, through the unattributed-changes approval), stop. Do not bypass.
- **N5**: Update the #639 sentence to note that its suite later completed with success (run 42851438295). The supersession reason (`[skip ci]` commits) stands.
- **N6**: The acceptance item "protected workflow owner approval recorded" is still unchecked. It must be recorded before merge, per the user's rule on protected workflows.

---
**Verdict**: PASS (Risk Grade L3). This is a retrospective review under the disclosed ordering. It is not a prospective PASS and not merge authorization. The merge stays gated on N1, N4 and N6.
