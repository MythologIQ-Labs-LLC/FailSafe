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
   - **Seal scope.** `git diff --no-renames --name-status S H` lists only governance paths and permitted **new** G4 checkpoint files (see exception). `git rev-parse H:FailSafe/extension` equals S's sealed subtree. Every post-seal checkpoint must have a clean-HEAD `mode: release` `PASS OK` verification using the owner-held fingerprint and latest external head before merge; absence of an approved TSA or owner key remains NO-GO.
3. **Merge.** Use the **merge-commit** method only (`gh pr merge <n> --merge --match-head-commit <H>`). Squash and rebase rewrite commits and are not used for release PRs. The PR title carries no CI-skip marker, because GitHub puts the title into the merge commit message.
4. **After merging, before any tag**, all of the following are checked. Any failure is a hard stop that is reported, not overridden.
   - The merge commit **M** has parents (previous `main`, H), and `M^{tree}` equals `H^{tree}`.
   - `M:FailSafe/extension` equals the sealed subtree.
   - M's message has no CI-skip marker.
   - If G4 applies, independently verify on a clean checkout of **M**, using `--release --commit M`, `--repository`, the owner-held fingerprint and externally retained trusted checkpoint head. Require `mode: release` and `PASS OK` without limitations before any tag; a diagnostic PASS never counts.
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

A checkpoint attests a **previously committed** seal or RC-promotion commit, so it cannot be included in that same commit. The signed/timestamped witness must therefore be added after S but before the final qualified PR head H. The G4 exception is **additive evidence only**, not a general expansion of mutable post-seal source.

- Allowed path shape: `tools/g4/checkpoints/g4-NNNNNN/{manifest.json,manifest.sig,timestamp.tsq,timestamp.tsr,tsa-chain.pem}`. All five named files must be added together under a **new** `g4-NNNNNN` directory; file contents remain byte-identical after first commit. No other file type, symlink, extra path, deletion, modification or rename is allowed under `tools/g4/checkpoints/`.
- `tools/g4/keys/**`, `tools/g4/tsa-roots/**`, `tools/g4/tsa-policy.json`, `tools/g4/revocations.json`, and G4 product scripts are **not** added to the post-seal allow-list. Trust selection and public owner certificates must be committed and qualified **before** S. This exception cannot retroactively authorize them.
- The operator checks `git diff --no-renames --name-status S H -- tools/g4/checkpoints`: every listed change must be `A`, in an entirely new numbered directory, with the five exact filenames; compare the committed S and H trees so an old checkpoint cannot silently disappear or be replaced. Check `git diff --no-renames --name-status S H` for every other path under the original governance-only rule.
- A complete G4 checkpoint is not sufficient on its own. Before merging, the owner must already have an independently retained certificate fingerprint and latest checkpoint head. On a clean checkout of H, run `g4-verify-checkpoint.cjs --release` with `--commit H`, the correct repository, fingerprint and trusted head; require `mode: release` and `PASS OK`. The externally retained head is recorded at creation, **before** any later GitHub Release body exists; the release body is a subsequent publication of the already retained pin.
- Immediately after the merge-commit M, re-run the same **release** verification with `--commit M` on a clean checkout. Verify the no-bypass rule-suite receipt and sealed extension subtree as above **before tagging**. If S's provenance, G4 signatures, RFC 3161 token, external pins, ancestry, CI or ruleset gate fails, stop and correct through a new audited PR/re-seal. No administrative bypass, unsigned checkpoint, diagnostic PASS or silently altered seal is permitted.
- A new RC promotion requiring another checkpoint repeats the additive-only and exact-commit verification process. A provider outage or missing owner decision is a release block, not permission to weaken the rule.

These are required operator checks, not proof that CI already enforces the allow-list. No live checkpoint is authorized or created by this documentation amendment. Any future executable preflight requires its own tests and independent audit.

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
