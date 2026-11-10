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

1. **Release PR.** The release candidate branch (for example `release/v6.0.13-rc*`) is opened as a PR to `main`. It carries the release commit and the governance records. A seal binds the exact **tree** of the release candidate:
   - the seal records the repository tree hash and the `FailSafe/extension` subtree hash, as well as the release-candidate commit;
   - it does not assume that a PR merge preserves the commit SHA.
2. **Checks.** Every required check passes on the PR head: the PR Full Test, CodeQL and code quality. A missing or skipped check is not a pass.
3. **Merge.** Use the **merge-commit** method (`gh pr merge <n> --merge`), never `--admin`.
   - When `main` is an ancestor of the PR head, the merge commit's tree equals the PR head's tree.
   - Squash and rebase rewrite commits and can change content under conflict resolution. They are not used for release PRs.
4. **Post-merge verification, before any tag:**
   - `git rev-parse <merge>^{tree}` equals the sealed tree, and `git rev-parse <merge>:FailSafe/extension` equals the sealed extension subtree. Any difference is a hard stop.
   - The merge's rule suite (`GET /repos/{owner}/{repo}/rulesets/rule-suites?ref=refs/heads/main`) reports **`result=pass`**. A `bypass` result is a hard stop that is reported, not hidden.
5. **Tag.** Create an annotated `vX.Y.Z` on the verified merge commit. Its message is GitHub's merge message, which carries no `[skip ci]`, so the tag-triggered release workflow runs. The tag is never moved after any publication has started.
6. **Post-publication record.** Ledger and SYSTEM_STATE updates go through a normal PR, not a direct push.

## Break-glass (emergency only)

Owner bypass stays technically available (bypass mode `always`). It may be used only:
- to stop an active security incident or restore a broken release pipeline when the PR path is unavailable;
- with a written owner authorization naming the exact push (before → after SHA) and an expiry of that push alone;
- with the rule-suite ID and `result=bypass` recorded in the ledger and the release notes or SYSTEM_STATE within 24 hours.

Routine releases never use it.

## Acceptance test (non-release)

PR #640 (#635, CI runner pin) is merged through steps 2–4 on a non-release change. The test passes only if:
- the merge was a normal PR merge (`mergedBy`, merge commit present, no `--admin`);
- its rule suite reports `result=pass` for the Production Block evaluation;
- the merge commit's tree equals the PR head's tree.

This proves that the ruleset accepts the intended path for the owner's account without a bypass. A `bypass` result fails the test, and the path is redesigned before v6.0.13.

## Not changed

No ruleset, bypass-actor or branch-protection setting is modified. Any change to them needs explicit owner approval.
