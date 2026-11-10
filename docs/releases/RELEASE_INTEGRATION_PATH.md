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

**Governance paths:** `docs/META_LEDGER.md`, `docs/SHADOW_GENOME.md`, `docs/SYSTEM_STATE.md`, `.agent/staging/**`, `.qor/gates/**`, `.qor/session/current`, `.failsafe/governance/**` and `docs/releases/**`.

1. **Release PR and seal.** The release-candidate branch (for example `release/vX.Y.Z-rc*`) is opened as a PR to `main`.
   - The seal is created on that branch at sealed commit **S**. It binds S's `FailSafe/extension` subtree hash, which identifies the packaged product source, as well as S itself.
   - Commits after S (the seal record, gate artifacts, SYSTEM_STATE) may touch **governance paths only**. Any other change voids the seal.
2. **Before merging:**
   - Every required check passes on the final PR head **H**: the PR Full Test, CodeQL and code quality. A missing or skipped check is not a pass.
   - H's commit message has no CI-skip marker (`[skip ci]`, `[ci skip]`, `[no ci]`, `[skip actions]`, `[actions skip]`, `skip-checks: true`), so the PR Full Test runs on H.
   - **Ancestry.** `origin/main` is an ancestor of H. If `main` moved after S, the release branch is updated and the seal is redone on the new base before merging. A stale seal is never merged.
   - **Seal scope.** `git diff --name-only S H` lists only governance paths, and `git rev-parse H:FailSafe/extension` equals S's sealed subtree.
3. **Merge.** Use the **merge-commit** method only (`gh pr merge <n> --merge --match-head-commit <H>`). Squash and rebase rewrite commits and are not used for release PRs. The PR title carries no CI-skip marker, because GitHub puts the title into the merge commit message.
4. **After merging, before any tag**, all of the following are checked. Any failure is a hard stop that is reported, not overridden.
   - The merge commit **M** has parents (previous `main`, H), and `M^{tree}` equals `H^{tree}`.
   - `M:FailSafe/extension` equals the sealed subtree.
   - M's message has no CI-skip marker.
   - The rule suite for the push to `main` (`GET /repos/{owner}/{repo}/rulesets/rule-suites?ref=refs/heads/main`) reports **`result=pass`**, meaning no rule was bypassed.
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

## Break-glass (emergency only)

Owner bypass stays technically available (bypass mode `always`). It may be used only:
- to stop an active security incident or restore a broken release pipeline when the PR path is unavailable;
- with a written owner authorization that states concretely **why the PR path is unavailable** and names the exact push (before → after SHA). The authorization covers that push only.

Within 24 hours, the rule-suite ID and `result=bypass` are recorded in the ledger and in the release notes or SYSTEM_STATE. Each bypass then gets an **independent after-the-fact review**, also recorded in the ledger. Routine releases never use it.

## Acceptance test (non-release)

PR #640 (#635, CI runner pin) is merged through steps 2–4 on a non-release change. The test passes only if:
- the merge was a normal PR merge (`mergedBy`, merge commit present, no `--admin`);
- its rule suite reports `result=pass` for the Production Block evaluation;
- the merge commit's tree equals the PR head's tree.

This proves that the ruleset accepts the intended path for the owner's account with no rule bypassed. A `bypass` result fails the test, and the path is redesigned before v6.0.13.

## Not changed

No ruleset, bypass-actor or branch-protection setting is modified. Any change to them needs explicit owner approval.
