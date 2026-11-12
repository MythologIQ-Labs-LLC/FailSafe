# Plan: v6.0.13 G4 release mode refuses a malformed checkpoint tree (#638)

**Iteration:** 2 (after the independent VETO on iteration 1)
**Change class:** feature (release-governance tooling; not packaged in the VSIX)
**Risk grade (proposed):** L3
**Base:** `main` `9f16548d83116e2d8ee7f9010545963c06e5c93a`
**Branch:** `fix/638-g4-release-evidence-layout`; target `main`
**Origin:** audits #936 and #937, note N6: "the verifier does not reject extra paths under `tools/g4/checkpoints/`, a missing `timestamp.tsq` or an edited `tsa-chain.pem`", so operator check 4 of the post-seal exception was the only control.
**Ordering:** written test-first. `g4ReleaseLayout.test.cjs` was run red before the change: six constructions returned a release-mode `PASS OK`.

## Problem

A release verification returned `PASS OK`, `mode: release`, with no limitation, on a committed tree that contained:
- an extra file inside a checkpoint directory;
- a file directly under `tools/g4/checkpoints/`;
- a nested path, or a directory not named `g4-NNNNNN`;
- a checkpoint with its `timestamp.tsq` removed;
- a symbolic link (`120000`) or an executable (`100755`) in place of a checkpoint file.

The verifier reads only the files it expects, so anything else went unseen. The release procedure asks the operator to run `git ls-tree` by hand (check 4). A manual check that the tool could do is a weak control.

## Change

- `FailSafe/extension/scripts/lib/g4/release-mode.cjs`: new `assertEvidenceLayout(repoRoot, head)`, called in release mode after the exact-commit check and before the clean-checkout check. It lists `git ls-tree -r -z HEAD -- tools/g4/checkpoints` (Git objects, replace refs disabled) and refuses with `REFUSED RELEASE_EVIDENCE_LAYOUT` unless every entry has mode `100644` (a regular, non-executable file) at `tools/g4/checkpoints/g4-NNNNNN/<one of the five file names>` and every such directory holds all five.
- Diagnostic mode is unchanged.
- `G4_WITNESS_OPERATIONS.md` gains the condition row. `RELEASE_INTEGRATION_PATH.md` states what the verifier now enforces and what remains operator-only.

## Acceptance

- `g4ReleaseLayout.test.cjs` (9 tests): a control release PASS on the unmodified base; each construction above refused with the new code on a clean checkout, so only the layout check can be the cause; a submodule entry (`160000`) refused; diagnostic mode unchanged.
- All G4 suites pass (97 on Windows).
- Mutation check: see iteration 2.
- Section 4 limits hold for the touched files.

## Iteration 2 (VETO remediation)

The independent audit of commit `2b223e5f` found the rule sound for ordinary trees, with no false refusal, and two blocking defects.

- **B1.** The record parser split on every tab and kept one field, so a tab inside a committed path cut the path short: `manifest.json<TAB>x` and a `timestamp.tsq<TAB>` standing in for the removed query were accepted by the layout check. Fix: the path is everything after the first tab, a record without a tab is `BLOCKED REPO_UNREADABLE`, and refusal messages print the path JSON-quoted.
- **B2 (present on `main` before this change).** On a case-insensitive filesystem a path committed as `tools/g4/Checkpoints/...` checks out into the real evidence directory, while every exact-path Git check looks elsewhere. The auditor obtained `PASS OK`, `mode: release`, exit 0 on Windows with the query dropped and extra files added. Fix: release mode lists the whole tree at HEAD and refuses any path that differs from `tools/g4/checkpoints`, `tools/g4/keys` only by letter case or Unicode compatibility form, at any level of the path (`Tools/g4/checkpoints/...` included).
- **N1.** A committed empty directory under the checkpoints is refused (the listing now includes directories).
- **N2 (present on `main`).** `GIT_DIR` with `GIT_WORK_TREE` pointed the verifier at another repository and returned a release PASS. Fix: `lib/g4/git.cjs` removes the variables that redirect Git to another repository, index or object store. This applies in every mode; a run without those variables is unchanged.
- **N3, N4.** New `g4ReleaseLayoutPaths.test.cjs` (11 tests) covers the tab cases, four case variants, the moved head checkpoint, a full-width look-alike, each of the five files missing, four near-miss names, empty directories beside and inside a checkpoint, and two environment redirects. Every tree is built in the index or with plumbing, so the cases run on every platform. The first ten were run against the audited code and all failed.
- **N5.** Ordering: a committed layout violation on a dirty checkout was `BLOCKED RELEASE_TREE_DIRTY` and is now `REFUSED RELEASE_EVIDENCE_LAYOUT`. Both refuse; the layout verdict is reported first because it is about what was committed.
- **N6, N7.** The two documents and the CLI header describe the rule as it is; "repeats check 4" is withdrawn. The first commit's "7/7 mutants" and the plan's five were both incomplete; for this iteration 22 mutants of the layout rule, the alias rule, the parser and the environment filter were run: 21 are killed, and one is equivalent (dropping the `$` after the file-name group changes nothing, because a longer path needs a directory entry that the directory rule refuses).
- **Not done.** A test for a failing `git ls-tree` (no practical way to induce it once HEAD resolves; the code blocks on a non-zero exit). The gate's `high_risk_target: false` is the schema's EU AI Act classification, not the L3 grade. macOS decomposed-form aliases are covered only as far as NFKC folding; no macOS run was made.

All G4 suites: 108 of 108 on Windows.

## Not changed, and still operator-only

- History: a rewrite, replacement or deletion in an intermediate commit, and more than one new checkpoint (checks 2 and 3).
- The attested commit equals R (check 5), and product bytes (check 6).
- An edited `tsa-chain.pem` that still verifies against the pinned root.
- Stray files under `tools/g4/keys/`: a certificate is used only if a manifest names its fingerprint and the owner pin matches.

No key, TSA, policy or checkpoint is created. The verifier on this repository still reports `BLOCKED TSA_POLICY_UNSELECTED`.
