# Plan: v6.0.13 governed release integration path (#636)

**iteration**: 2 (after VETO #928)
**change_class**: governance (process documentation; no code, workflow or GitHub setting change)
**risk_grade**: L3 (raised by audit #928)
**pr_target**: `main`
**base**: `main` `e7549b42` (PR #640 merge)

## Change

Add `docs/releases/RELEASE_INTEGRATION_PATH.md`. It defines how a release reaches `main` and gets tagged under the active **Production Block** ruleset without an owner bypass:
1. A release PR with a seal bound to the sealed commit and its extension subtree; later commits may touch governance paths only.
2. Required checks pass on the PR head.
3. A merge-commit merge without `--admin`.
4. Before tagging: the merge tree equals the sealed tree, and the merge's rule suite reports `result=pass`.
5. An annotated tag on the verified merge commit.
6. Post-publication records through a PR.

The document also records the four v6.0.12 `result=bypass` receipts and narrow break-glass criteria.

## Acceptance

- The non-release acceptance test passed: PR #640 merged as `e7549b42` with no rule bypassed; rule suite 5025516418 reports `result=pass`; merge tree = head tree.
- The v6.0.13 release itself follows this path. The release runbook step (#636 item 5) is satisfied by this document. No routine bypass.

## Iteration 2 (VETO #928 remediation)

- **B1:** the session HMAC key had been force-added in an unpushed local commit. The commit was rebuilt without it, and the key was never pushed. Gate commits now stage named `.qor/gates/<sid>/` paths and `.qor/session/current`, never `.qor` as a whole. The same defect was removed from the G4 lane's unpushed commit (rebuilt as `3d92d88f`).
- **B2:** the seal binds the sealed commit S and its `FailSafe/extension` subtree. The merge tree must equal the final PR head tree, and S → head may touch only the listed governance paths. Both are checked mechanically.
- **N1–N6:**
  - a pre-merge ancestry check, with re-seal on a moved base;
  - mechanical CI-skip checks on the head, the title and the merge message;
  - a full post-publication binding chain;
  - unprotected tags and indistinguishable admin merges recorded as residual risks;
  - break-glass requires a stated reason and an independent after-the-fact review;
  - the acceptance wording now says "no rule bypassed".

## Not changed

No ruleset, bypass actor, workflow or protection setting is changed. Owner approval is required for any such change.
