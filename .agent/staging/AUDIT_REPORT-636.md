# AUDIT REPORT: #636 governed release integration path

**Tribunal Date**: 2026-11-10
**Target**: `.failsafe/governance/plans/plan-v6013-636-release-integration-path.md` (iteration 1).
- Committed blob sha256 `89f5a131248e1a2b5e2176ba18829af3d861bd5bb8fbd4a91f36e41c33d2301e`, which equals the gate's `plan_content_hash`.
- Gate: `.qor/gates/2026-11-10T1647-d432f4/plan.json`.
- Document under review: `docs/releases/RELEASE_INTEGRATION_PATH.md`.

**Candidate**: worktree `C:\dev\mythologiq\FailSafe-gov636`, branch `governance/636-pr-release-path`. Local HEAD `46fcfdc4` (unpushed), base `origin/main` `e7549b42` (the PR #640 merge). Branch commits:
- `9a6b3243`: the document;
- `46fcfdc4`: the plan, the gate files, `.qor/session/current` and **`.qor/session/keys/2026-11-10T1647-d432f4.key`**.

**Session**: `2026-11-10T1647-d432f4`
**Risk Grade**: L3. The plan proposes L2, but this audit raises it because of the security finding B1.
**Auditor**: The Qor-logic Judge, independent, solo mode.

**Ordering**: this is a prospective review of a process document. It changes no GitHub setting and is not yet binding. The non-release acceptance test (PR #640) has already been run, and this audit verified it retrospectively.

---

## VERDICT: VETO

---

### Steps run

| Step | Result |
|---|---|
| `gh api repos/MythologIQ-Labs-LLC/FailSafe/rulesets/16423247` | **Production Block**: active, target branch, `~DEFAULT_BRANCH`, last updated 2026-08-21. Rules: `deletion`; `non_fast_forward`; `pull_request` (0 approvals; merge methods `merge`, `squash` and `rebase`; `require_extra_approval_for_unattributed_changes: true`); `code_scanning` (CodeQL, errors and high-or-higher); `code_quality` (errors). Bypass: OrganizationAdmin always, EnterpriseOwner always, RepositoryRole 5 (admin) always. Ruleset 12543524 `main-branch protection` is disabled. **Matches the document.** No tag ruleset exists (both rulesets target branches) |
| Rule suites (`ref=refs/heads/main`, day) | 5010906494 `e5b0aee9→1c6767d4`, 5010914564 `1c6767d4→45c1957c`, 5023449656 `45c1957c→0e70e539` and 5024054118 `0e70e539→f923fffb` are all `result=bypass` by Knapp-Kevin, at the times in the document. **5025516418** `f923fffb→e7549b42` is **`result=pass`**: code_quality, code_scanning, pull_request, non_fast_forward and deletion each pass |
| PR #640 | MERGED 2026-11-10T16:46:08Z by Knapp-Kevin; `ready_for_review` at 16:45:25Z. Merge commit `e7549b42` has parents `f923fffb` and `1a5b8e3c`, and committer `GitHub` (a web/API merge, signed). `e7549b42^{tree}` = `1a5b8e3c^{tree}` = `3e208e25…2202`. PR Full Test 42854988809 on head `1a5b8e3c`: success. Nothing directly shows whether `--admin` was used. The rule-suite `pass`, meaning no rule needed a bypass, is the meaningful evidence, and it holds. The merge message contains no CI-skip marker |
| release.yml compatibility with a tag on a merge commit | The `validate` job requires `git merge-base --is-ancestor $TAG_COMMIT origin/main`; a merge commit on main satisfies this. `checkRemoteTag` compares the remote tag's peeled commit with the built SHA, which works for any commit. **Compatible** |
| How v6.0.12 was sealed (`docs/META_LEDGER.md` #922; `git log 1c6767d4`) | Release commit `c1fcaa23`, then a separate seal commit `1c6767d4` (`seal: … [skip ci]`). The seal record sits in a commit **after** the sealed tree |
| Committed files | `46fcfdc4` adds `.qor/session/keys/2026-11-10T1647-d432f4.key` (32 bytes). `.gitignore:12` (`.qor/`) and `:107` (`*.key`) exclude it, so it was force-added. `origin/main` tracks no session key at all (only `.qor/session/current`). The gate's `plan.provenance` is `HMAC-SHA256` with `hmac_tag 54cef699…`. The repository is public |
| Razor, Ghost UI, Dependency, Orphan | Not applicable: the change is documentation plus governance artifacts, with no code |

### Audit Results

- **Security**: **FAIL (B1)**.
- **Macro / specification**: **FAIL (B2)**.
- **Infrastructure alignment**: PASS. Every factual claim in the Findings section and the acceptance test was verified.
- **Honesty**: PASS. The document says the v6.0.12 PR rule was "bypassed, not satisfied", keeps GitHub authorization and the native audit as separate controls, and changes no settings.

### Violations Found

| ID | Category | Location | Description |
|---|---|---|---|
| B1 | security (secret committed) | `46fcfdc4` → `.qor/session/keys/2026-11-10T1647-d432f4.key` | The session HMAC key that authenticates this session's gate provenance is committed, despite `.gitignore` excluding `.qor/` and `*.key`. Pushing it to the public repository would let anyone forge `plan.provenance`-style receipts for session `2026-11-10T1647-d432f4`. No session key has ever been tracked on `main`. The commit is not yet pushed. **Remediation:** rebuild `46fcfdc4` without the key; it must never be pushed. Treat the key as exposed only if any copy has reached a remote. **Cross-lane advisory, not part of this verdict:** the G4 lane's local commit `5519fa66` (`plan(#638): G4 plan gate artifact`, branch `feat/638-g4-witness-v6013`) also adds `.qor/session/keys/2026-11-10T1643-b038e8.key`. I did not touch that worktree |
| B2 | specification-drift (unsatisfiable mandatory check) | `RELEASE_INTEGRATION_PATH.md` steps 1 and 4 | Step 1 requires the release PR to carry "the release commit and the governance records", with a seal that "records the repository tree hash". Step 4 then makes `git rev-parse <merge>^{tree}` **equal the sealed tree** a hard stop. A seal record committed into the PR (as #922 was: seal commit `1c6767d4` after release commit `c1fcaa23`) changes the repository tree, and a seal cannot contain the hash of a tree that contains itself. As written, the full-tree check therefore fails on every compliant release, which invites an ad-hoc override of a "hard stop". **Remediation:** define the binding precisely. For example: (a) the merged `FailSafe/extension` subtree must equal the sealed extension subtree; (b) the merge tree must equal the final PR head tree; (c) the diff from the sealed commit to the final PR head may touch only an enumerated set of governance paths (for example `docs/META_LEDGER.md`, `docs/SYSTEM_STATE.md`, `.qor/`, `.agent/`, `.failsafe/`), checked mechanically. State which tree the seal records |

### Non-blocking items

- **N1 (race before merge)**: the ruleset does not require the PR branch to be up to date. If `main` moves between the seal and the merge, step 4 detects it only **after** the merge, when `main` already holds an unsealed merge that cannot be force-reverted (because of `non_fast_forward`). Add a pre-merge check that `origin/main` is an ancestor of the sealed PR head, immediately before `gh pr merge --merge`, and state the recovery: update the branch, re-seal, and merge only through a PR.
- **N2 (CI-skip marker)**: step 5 says the merge message "carries no `[skip ci]`" as a fact. GitHub's merge-commit message includes the PR title, and this repository habitually uses `[skip ci]` in subjects and PR text. Make it a check: before tagging, confirm the merge commit message has no skip marker, or set the subject and body explicitly. Also require the **final PR head commit** to carry no skip marker. Otherwise PR Full Test is skipped on the final head, and step 2 cannot be met (seal commits here have historically carried `[skip ci]`).
- **N3 (commit identity in records)**: the artifact-producing commit becomes the merge commit, which does not exist when the seal is made. Step 6 should state that the post-publication record binds merge SHA → tree → extension subtree → tag object → release run → rule-suite id, and that this record, not the seal, names the artifact-producing commit. The provenance checks (`verify-release-provenance --commit`) use the tag commit.
- **N4 (tags are unprotected)**: no ruleset covers tags. "Never moved after publication started" is a policy only. Note this as a residual risk (any ruleset change stays out of scope and needs owner approval).
- **N5 (break-glass)**: it is narrow and honest overall: an incident or a broken pipeline *when the PR path is unavailable*, written authorization naming the exact before → after push, and the rule-suite id recorded within 24 hours. Two tightenings would help. Require the authorization to state concretely why the PR path is unavailable. Require an independent review of each bypass after the event. The v6.0.12 recovery (#634) went through a branch and could have used a PR, which shows that "restore a broken release pipeline" alone is too broad without that qualifier.
- **N6**: the evidence that no `--admin` merge occurred is the rule-suite `pass`. With every rule satisfied, an admin merge would also record `pass`. Say this, so that the acceptance test claims "no rule bypassed", not "no `--admin` flag".

### Per-ground directives

- B1: remove the key from the branch history before any push.
- B2: amend steps 1 and 4 to a satisfiable, mechanical binding, and preferably address N1–N3 at the same time.

Then re-run `/qor-audit` (iteration 2).

---
**Verdict**: VETO (Risk Grade L3). The ruleset facts, the four bypass receipts, the `pass` acceptance (5025516418) and the PR #640 tree equality are verified and are not in dispute.
