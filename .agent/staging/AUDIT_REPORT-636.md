# AUDIT REPORT: #636 governed release integration path (iteration 2)

**Tribunal Date**: 2026-11-10
**Target**: `.failsafe/governance/plans/plan-v6013-636-release-integration-path.md` (iteration 2).
- Committed blob sha256 `fe26b2c66c9bff4323a339ac971cf6e234171b900543c2da460d8e4ec1295e6a`, which equals `plan_content_hash` in `plan.json` and in `plan-iter2.json`.
- Gate: `.qor/gates/2026-11-10T1647-d432f4/plan-iter2.json`.
- Document under review: `docs/releases/RELEASE_INTEGRATION_PATH.md`.

**Candidate**: `C:\dev\mythologiq\FailSafe-gov636`, branch `governance/636-pr-release-path`, HEAD `506262f6` (unpushed), base `origin/main` `e7549b42`. Branch commits:
- `4de66e78`: the document, plan and gate (rebuilt without the key);
- `506262f6`: the VETO #928 record, the iteration-2 plan, the document and the gates.

**Session**: `2026-11-10T1647-d432f4`
**Risk Grade**: L3 (raised in #928 and kept in the plan)
**Auditor**: The Qor-logic Judge, independent, solo mode

**Ordering**: this is a prospective review of a process document. It changes no GitHub setting. VETO #928 is recorded unchanged: its Content Hash `f5006bee…9425` equals the iteration-1 report preserved in `506262f6`. This file replaces that report in the working tree only.

---

## VERDICT: PASS

---

### Steps run

| Step | Result |
|---|---|
| **B1: key removed from this branch** | `git ls-tree -r HEAD .qor/session` lists only `current`. No commit in `origin/main..HEAD` adds a `.key`. `git log --all -- '*.key'` returns nothing |
| **B1: old commits unreachable** | `46fcfdc4` and `5519fa66`: `for-each-ref --contains` returns 0 refs, both local and remote. Neither SHA appears in `git ls-remote origin` (792 refs, including PR refs). GitHub `GET /commits/<sha>` returns 422 "No commit found" for both. **Neither ever reached the remote** |
| **B1: G4 lane** | Local `feat/638-g4-witness-v6013` is `3d92d88f`. Its `.qor/session` holds only `current`, and no commit in `origin/main..` adds a key. The remote branch `d664ce03` is an ancestor of it, and its history has no key either. `git log --remotes -- '*.key' '.qor/session/keys/*'` over 174 fetched remote refs: empty |
| Gate commit hygiene | The plan states that gate commits now stage named `.qor/gates/<sid>/` paths and `.qor/session/current`, never `.qor` as a whole. That is consistent with both rebuilt commits |
| **B2: binding** | The seal binds the sealed commit S and `S:FailSafe/extension`. Later commits may touch only an enumerated list of governance paths (`docs/META_LEDGER.md`, `docs/SHADOW_GENOME.md`, `docs/SYSTEM_STATE.md`, `.agent/staging/**`, `.qor/gates/**`, `.qor/session/current`, `.failsafe/governance/**`, `docs/releases/**`), checked mechanically with `git diff --name-only S H`. Required: `H:FailSafe/extension` = the sealed subtree, `M^{tree}` = `H^{tree}`, M has parents (previous `main`, H), and `M:FailSafe/extension` = the sealed subtree. This is satisfiable, because the seal record lands on a governance path, and it is mechanical |
| Release inputs outside the extension subtree | The PDF reads the root `CHANGELOG.md` (`build-release-notes-pdf.cjs:13,146`). `release.yml`, `scripts/validate.ps1` and `tools/` are also outside the subtree. None of these is a governance path, so the S→H rule fixes them at S. Product bytes and release workflow inputs are therefore frozen by S, plus the path rule |
| **N1** | The pre-merge ancestry check (`origin/main` is an ancestor of H; a moved base means a re-seal on the new base) is present, and the merge uses `--match-head-commit <H>` |
| **N2** | CI-skip markers are checked on H's message, on the PR title (because GitHub copies it into the merge message) and on M's message. The list is complete for GitHub: `[skip ci]`, `[ci skip]`, `[no ci]`, `[skip actions]`, `[actions skip]`, `skip-checks: true` |
| **N3** | The post-publication record (through a PR) binds M, `M^{tree}`, the extension subtree, the tag object, the release run, the rule-suite id with `pass` and the SHA256SUMS digest. M is named as the commit that produced the artifacts |
| **N4, N6** | Residual risks now cover unprotected tags and admin merges that look identical. The control is stated as "no rule bypassed" |
| **N5** | Break-glass needs a written owner authorization that states concretely why the PR path is unavailable and names the exact before→after push. It is recorded within 24 hours, gets an independent review afterwards, and is never used for routine releases |
| Facts from iteration 1 | The ruleset, the four bypass receipts, rule suite 5025516418 `pass`, the PR #640 tree equality and the `release.yml` compatibility were verified in #928 and are unchanged |
| Razor, Ghost UI, Dependency, Orphan | Not applicable (documentation and governance artifacts only) |

### Audit Results

- **Security**: PASS. B1 is closed, with no remote exposure.
- **Macro and specification**: PASS. B2 is closed, and every required check can be satisfied and verified mechanically.
- **Infrastructure alignment**: PASS.
- **Honesty**: PASS. The bypasses are recorded as bypasses, and the residual risks are stated.

### Violations Found

None.

### Non-blocking items

- **N1**: a small race remains between the pre-merge ancestry check and the merge itself, because the ruleset does not require the branch to be up to date. Step 4 still catches it, but only after `main` already holds the merge commit. Running the ancestry check immediately before `gh pr merge` keeps that window minimal. The document should also state the recovery when a post-merge check fails: no tag, a fix through a new PR, and a re-seal.
- **N2**: in step 4, select the rule suite by `after_sha == M` (and `before_sha` = the previous `main`), not just by `ref`, so that a later push cannot be read by mistake.
- **N3**: the Acceptance-test bullet still says "(`mergedBy`, merge commit present, no `--admin`)", while the paragraph after it correctly says "no rule bypassed". Align the bullet.
- **N4**: `docs/releases/**` is a governance path, so files there, including the G4 disposition record, may change after S. The seal and the item 81 amendment cite that record's SHA-256, so a change would be detectable. Consider excluding cited decision files from the post-S allow-list, or requiring that their cited hashes still match at H.
- **N5**: "merge commit only" is a policy. The ruleset still allows squash and rebase. This is covered by the step-4 parent and tree checks, and could be listed with the residual risks.

---
**Verdict**: PASS (Risk Grade L3). The document becomes binding for v6.0.13 once it is merged through a PR. It authorizes no ruleset change, no bypass, and no tag.
