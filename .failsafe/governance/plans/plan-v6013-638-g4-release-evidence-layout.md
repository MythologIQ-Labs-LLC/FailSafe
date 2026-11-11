# Plan: v6.0.13 G4 release mode refuses a malformed checkpoint tree (#638)

**Iteration:** 1
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
- Mutation check: removing the call, the mode test, the path test, the file-name test or the missing-file loop each makes at least one test fail.
- Section 4 limits hold for the touched files.

## Not changed, and still operator-only

- History: a rewrite, replacement or deletion in an intermediate commit, and more than one new checkpoint (checks 2 and 3).
- The attested commit equals R (check 5), and product bytes (check 6).
- An edited `tsa-chain.pem` that still verifies against the pinned root.
- Stray files under `tools/g4/keys/`: a certificate is used only if a manifest names its fingerprint and the owner pin matches.

No key, TSA, policy or checkpoint is created. The verifier on this repository still reports `BLOCKED TSA_POLICY_UNSELECTED`.
