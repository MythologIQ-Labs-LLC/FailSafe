# Governed release integration path under the Production Block ruleset (#636)

**Status:** proposed for v6.0.13. It becomes binding after independent audit and a passing acceptance test on a non-release PR (below). It does not change any GitHub setting.

## Findings (v6.0.12)

The default branch is governed by the repository ruleset **Production Block** (id 16423247, enforcement `active`). Its rules:
- `deletion`;
- `non_fast_forward`;
- `pull_request`: 0 required approvals, merge methods `merge`, `squash` and `rebase` allowed, `require_extra_approval_for_unattributed_changes: true`;
- `code_scanning`: CodeQL, errors and high-or-higher security alerts block;
- `code_quality`: errors block.

Bypass actors: OrganizationAdmin (always), EnterpriseOwner (always), and repository role 5, admin (always). The older ruleset `main-branch protection` (12543524) is disabled.

GitHub's rule-suite log records the four v6.0.12 pushes to `main` as **`result=bypass`** by Knapp-Kevin:

| Rule suite | Time (ET) | Push |
|---|---|---|
| 5010906494 | 2026-11-09 21:24:03 | `e5b0aee9 → 1c6767d4` |
| 5010914564 | 2026-11-09 21:24:40 | `1c6767d4 → 45c1957c` |
| 5023449656 | 2026-11-10 10:14:57 | `45c1957c → 0e70e539` |
| 5024054118 | 2026-11-10 10:41:34 | `0e70e539 → f923fffb` |

The owner authorized the release fast-forward. GitHub's required-PR rule was **bypassed, not satisfied**. That is a process finding, not a defect in the published bytes: v6.0.12's tag, seals #922/#925 and artifact verification (#926) stand. PR #633 was closed as superseded, not merged.

GitHub authorization (rulesets, PR merge) and the native Qor-logic audit/seal are separate controls. Neither substitutes for the other.

## Compliant release path (no bypass)

**Governance paths:** `docs/META_LEDGER.md`, `docs/SHADOW_GENOME.md`, `docs/SYSTEM_STATE.md`, `.agent/staging/**`, `.qor/gates/**`, `.qor/session/current`, `.failsafe/governance/**` and `docs/releases/**`. Excluded: any decision file cited by SHA-256 in the seal (for example a release disposition). Its SHA-256 is re-checked at H and must be unchanged. **The only exception outside those paths** is the creation of new, immutable G4 checkpoint evidence under `tools/g4/checkpoints/**`, subject to the strict conditions below. It never permits changes to G4 trust configuration, existing checkpoints or packaged product code.

1. **Release PR and seal.** The release-candidate branch (for example `release/vX.Y.Z-rc*`) is opened as a PR to `main`.
   - The seal is created on that branch at sealed commit **S**. It binds S's `FailSafe/extension` subtree hash, which identifies the packaged product source, as well as S itself.
   - Commits after S (the seal record, gate artifacts, SYSTEM_STATE) may touch **governance paths only**, except the narrowly constrained addition of G4 checkpoint files below. Any other change voids the seal.
2. **Before merging:**
   - Every required check passes on the final PR head **H**: the PR Full Test, CodeQL and code quality. A missing or skipped check is not a pass.
   - H's commit message has no CI-skip marker (`[skip ci]`, `[ci skip]`, `[no ci]`, `[skip actions]`, `[actions skip]`, `skip-checks: true`), so the PR Full Test runs on H.
   - **Ancestry**, checked immediately before `gh pr merge`: `origin/main` is an ancestor of H. If `main` moved after S, the release branch is updated and the seal is redone on the new base before merging. A stale seal is never merged.
   - **Seal scope.** `git merge-base --is-ancestor S H` exits 0 and `git rev-list --merges S..H` prints nothing; otherwise re-seal on the new base. Every post-seal commit C is inspected with `git diff-tree --no-renames -r --name-status C~1 C` (run in Git Bash or PowerShell, not `cmd.exe`): each path is a governance path or, when G4 applies, part of the one permitted checkpoint addition (see the exception, checks 1 to 7). `git rev-parse H:FailSafe/extension` equals S's sealed subtree. When G4 applies, a release-mode verification on a clean H must pass as check 7 defines; a missing owner key or approved TSA is NO-GO.
3. **Merge.** Use the **merge-commit** method only (`gh pr merge <n> --merge --match-head-commit <H>`). Squash and rebase rewrite commits and are not used for release PRs. The PR title carries no CI-skip marker, because GitHub puts the title into the merge commit message.
4. **After merging, before any tag**, all of the following are checked. Any failure is a hard stop that is reported, not overridden.
   - The merge commit **M** has parents (previous `main`, H), and `M^{tree}` equals `H^{tree}`.
   - `M:FailSafe/extension` equals the sealed subtree.
   - M's message has no CI-skip marker.
   - If G4 applies, verify on a clean checkout of **M** with `--release --commit M`, `--repository`, the owner-held fingerprint and the new checkpoint's externally retained head. Require `mode: release`, the `ok g4-NNNNNN commit <R>` line for this release's seal-record commit, and `PASS OK` without limitations before any tag; a diagnostic PASS never counts.
   - The rule suite for the push to `main` reports **`result=pass`**, meaning no rule was bypassed. It is selected by `after_sha == M` and `before_sha ==` the previous `main` (`GET /repos/{owner}/{repo}/rulesets/rule-suites?ref=refs/heads/main`).
   - **Recovery if any check fails:** do not tag. Fix forward through a new PR and re-seal. The failed merge and its rule suite are recorded.
5. **Tag.** Create an annotated `vX.Y.Z` on M, so the tag-triggered release workflow runs from M. M is the artifact-producing commit. Once any publication has started, the tag is never moved.
6. **Post-publication record (through a PR).** The record binds:
   - the merge commit M;
   - `M^{tree}` and the `FailSafe/extension` subtree, equal to the seal;
   - the tag object;
   - the release run;
   - the rule-suite ID with `result=pass`;
   - the published SHA256SUMS digest.

**Residual risks:**
- **Tags are unprotected.** No ruleset protects tags, so "never move a published tag" is enforced by policy and by the post-publication record, not by GitHub.
- **Admin merges look the same.** An admin merge with every rule satisfied also records `pass`. The control proves that no rule was bypassed, not which merge flag was used.
- **"Merge commit only" is policy.** The ruleset still allows squash and rebase. The step 4 parent and tree checks detect any other method.

## Strict G4 post-seal checkpoint exception (#638)

A G4 checkpoint attests a commit that already exists, so it cannot be part of that commit. It is therefore added after the seal and before the final qualified PR head H. The exception admits **new checkpoint evidence only**. It does not widen what else may change after the seal.

**Terms.** **S** is the sealed commit (step 1). **R** is the seal-record commit: the first commit after S whose `docs/META_LEDGER.md` contains this release's `SESSION SEAL` entry. `G4_WITNESS_OPERATIONS.md` calls R "the seal commit". **K** is the checkpoint commit. The order is S, then R, then K, then H (K may be H).

**Shell.** Run every command below in Git Bash or PowerShell, never in `cmd.exe`. `cmd.exe` strips `^`, which turns a parent reference into the commit itself and prints an empty, clean-looking result. For the same reason the commands use `C~1`, not `C^`. An empty result is never accepted as proof by itself: the expected lines must be seen.

**What may be added.** Exactly one new directory `tools/g4/checkpoints/g4-NNNNNN/`, numbered one above the previous checkpoint, with exactly these five files, all added in the single commit K: `manifest.json`, `manifest.sig`, `timestamp.tsq`, `timestamp.tsr`, `tsa-chain.pem`. Nothing under `tools/g4/checkpoints/` may be modified, deleted, renamed or replaced, in any commit.

**What stays pre-seal.** `tools/g4/keys/**`, `tools/g4/tsa-roots/**`, `tools/g4/tsa-policy.json`, `tools/g4/revocations.json`, the G4 scripts and all product source are not on the post-seal list. Key, root, policy, revocation and archive changes are committed and qualified before S.

**Checks before merging** (all must hold; any failure means re-seal or NO-GO):

1. **S is an ancestor of H, and the history is linear.** `git merge-base --is-ancestor S H` exits 0, and `git rev-list --merges S..H` prints nothing. A moved base or a merge after S means re-sealing.
2. **Every post-seal commit, all paths.** For each commit C in `git rev-list --reverse S..H`, run `git diff-tree --no-renames -r --name-status C~1 C` with no path filter. Every listed path must be a governance path (as defined above), or, in commit K only, one of the five checkpoint files with status `A`. Any other path or status voids the seal. The net `git diff S H` is not enough: it hides an add followed by a rewrite.
3. **Commit K shows its five lines.** The step 2 output for K contains exactly five `A` lines under one new `tools/g4/checkpoints/g4-NNNNNN/`, and no other checkpoint line appears in any other commit.
4. **Tree entries at H.** `git ls-tree -r H -- tools/g4/checkpoints` shows mode `100644` for every entry (no symlink `120000`, gitlink `160000` or executable `100755`), five files per directory, and no other path.
5. **The checkpoint attests this release's seal.** The new checkpoint's `manifest.json` names `"commit"` equal to R, and `git show R:docs/META_LEDGER.md` contains this release's `SESSION SEAL` entry. A checkpoint that attests any other commit, or an S..H range with no new checkpoint, does not satisfy the exception when G4 applies.
6. **Product bytes.** `git rev-parse H:FailSafe/extension` equals S's sealed subtree, and every decision file cited by SHA-256 in the seal is unchanged.
7. **Release verification on H.** The owner already holds, outside Git, the certificate fingerprint and the head of the **new** checkpoint, written down when it was created and before it was committed. On a clean checkout of H, run `g4-verify-checkpoint.cjs --release --repository <owner/name> --commit H --trust-fingerprint <pin> --trusted-head g4-NNNNNN:<pin>`. Require all of:
   - `[g4-verify] mode: release`;
   - an `ok g4-NNNNNN commit <first 12 hex of R>` line for the new checkpoint;
   - `PASS OK` with no limitation line.

   The previous checkpoint's head is not an acceptable `--trusted-head`. The exit code alone is never evidence, and a diagnostic PASS never counts.

**After the merge commit M, before any tag:** repeat check 7 on a clean checkout of M with `--commit M`, and require the same three lines, including the `ok g4-NNNNNN commit <R>` line. Then verify the sealed extension subtree and the no-bypass rule-suite receipt as in step 4 of the release path.

**On any failure** (S's provenance, signature, token, pins, the attested commit, ancestry, CI or the ruleset gate): stop, and correct through a new audited PR and a re-seal. No administrative bypass, unsigned checkpoint, diagnostic PASS or altered seal. A provider outage or a missing owner decision blocks the release; it is not permission to weaken a check. A later RC promotion that needs another checkpoint repeats all of the above.

**Why the Git checks matter.** In release mode the verifier refuses a tree committed at H that is not exactly five regular files per `g4-NNNNNN` directory, and any committed path that differs from the evidence directories only by letter case or Unicode form (`REFUSED RELEASE_EVIDENCE_LAYOUT`). That covers the tree shape that check 4 inspects; check 4 is still run by the operator. The verifier does not see history: a checkpoint rewritten, replaced or deleted in an intermediate commit, or a second new checkpoint. It also accepts an edited `tsa-chain.pem` that still verifies, and it ignores unused files under `tools/g4/keys/`. Checks 2, 3 and 5 are the only control for the history cases.

**Status of these checks.** They are operator checks, not CI enforcement, and the #640 acceptance test did not exercise them. Their only evidence so far is the independent audits of this section, which ran them against synthetic repositories and real test checkpoints. No live checkpoint is authorized or created by this document. An executable preflight needs its own tests and audit.

## Break-glass (emergency only)

Owner bypass stays technically available (bypass mode `always`). It may be used only:
- to stop an active security incident or restore a broken release pipeline when the PR path is unavailable;
- with a written owner authorization that states concretely **why the PR path is unavailable** and names the exact push (before → after SHA). The authorization covers that push only.

Within 24 hours, the rule-suite ID and `result=bypass` are recorded in the ledger and in the release notes or SYSTEM_STATE. Each bypass then gets an **independent after-the-fact review**, also recorded in the ledger. Routine releases never use it.

## Acceptance test (non-release)

PR #640 (#635, CI runner pin) is merged through steps 2–4 on a non-release change. The test passes only if:
- the merge was a normal PR merge (`mergedBy`, merge commit present) with no rule bypassed;
- its rule suite reports `result=pass` for the Production Block evaluation;
- the merge commit's tree equals the PR head's tree.

This proves that the ruleset accepts the intended path for the owner's account with no rule bypassed. A `bypass` result fails the test, and the path is redesigned before v6.0.13.

**Result (2026-11-10): PASS.**
- PR #640 was marked ready after every required check passed on head `1a5b8e3c4d33d26c2879f3e8e8b5b58fceb3773c`, including PR Full Test run 42854988809 and CodeQL.
- It was merged with `gh pr merge 640 --merge --match-head-commit <head>` by Knapp-Kevin at 2026-11-10T16:46:08Z, as merge commit `e7549b4213d5c810daddb499a4816d49733080a4` (parents `f923fffb`, `1a5b8e3c`).
- Rule suite **5025516418** records `f923fffb → e7549b42` as **`result=pass`**: all five rules passed and none was bypassed.
- The merge tree `3e208e25…2202` equals the PR head tree.

## Not changed

No ruleset, bypass-actor or branch-protection setting is modified. Any change to them needs explicit owner approval.
