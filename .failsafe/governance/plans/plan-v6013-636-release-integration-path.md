# Plan: v6.0.13 governed release integration path (#636)

**iteration**: 1
**change_class**: governance (process documentation; no code, workflow or GitHub setting change)
**risk_grade (proposed)**: L2
**pr_target**: `main`
**base**: `main` `e7549b42` (PR #640 merge)

## Change

Add `docs/releases/RELEASE_INTEGRATION_PATH.md`. It defines how a release reaches `main` and gets tagged under the active **Production Block** ruleset without an owner bypass:
1. A release PR with a seal bound to the exact tree and extension subtree.
2. Required checks pass on the PR head.
3. A merge-commit merge without `--admin`.
4. Before tagging: the merge tree equals the sealed tree, and the merge's rule suite reports `result=pass`.
5. An annotated tag on the verified merge commit.
6. Post-publication records through a PR.

The document also records the four v6.0.12 `result=bypass` receipts and narrow break-glass criteria.

## Acceptance

- The non-release acceptance test passed: PR #640 merged as `e7549b42` without `--admin`; rule suite 5025516418 reports `result=pass`; merge tree = head tree.
- The v6.0.13 release itself follows this path. The release runbook step (#636 item 5) is satisfied by this document. No routine bypass.

## Not changed

No ruleset, bypass actor, workflow or protection setting is changed. Owner approval is required for any such change.
