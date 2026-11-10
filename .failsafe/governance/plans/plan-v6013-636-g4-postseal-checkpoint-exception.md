# Plan: v6.0.13 G4 post-seal checkpoint exception (#636, #638)

**Iteration:** 1 (awaiting independent `/qor-plan` and `/qor-audit`)
**Change class:** release governance documentation only
**Risk grade:** L3, exact-commit seal and independent witness integrity
**Base:** `main` `6a7eced4de4c2bf540430b440379ee3ef29af8a3`
**Target:** `main`
**Scope:** `docs/releases/RELEASE_INTEGRATION_PATH.md` plus this plan. No extension/product code, workflow, GitHub ruleset, G4 policy, TPM key, TSA or checkpoint change.

## Problem

The release-path policy approved by audit PASS #929 permits only enumerated governance paths between seal commit S and final PR head H. G4 genesis and each later checkpoint necessarily attest an *already committed* ledger/seal commit, then create immutable files under `tools/g4/checkpoints/g4-NNNNNN/`. Those files are not on the current allow-list. Without a bounded exception, the correct G4 witness would invalidate the very release seal it is supposed to protect.

## Change

- Admit **new checkpoint evidence only**, not arbitrary `tools/g4/**` changes, as a narrowly specified post-seal exception.
- Exactly five allowed file names within a *new* `g4-NNNNNN` directory: `manifest.json`, `manifest.sig`, `timestamp.tsq`, `timestamp.tsr`, `tsa-chain.pem`.
- Existing checkpoint bytes, paths, and trust policy may not be edited/deleted/replaced/renamed after S; keys, TSA roots and `tsa-policy.json` remain pre-seal inputs.
- Require an explicit `git diff --no-renames --name-status S H -- tools/g4/checkpoints` proof: every checkpoint path has status A only, directories are new, names exact, no extra files.
- Require a fresh independent owner fingerprint and checkpoint-head pin outside Git and a `mode: release` / `PASS OK` verification against clean H before the merge. On the owner-authorized normal PR merge M, require the matching tree/subtree and a second clean `--release --commit M` verification before tagging.
- On failed witness, missing owner approval or failure to validate the external pins: NO-GO. No fallback to a diagnostic PASS, override, administrative bypass, or post-seal changes to sealed product source.
- Only operations documents change in this PR. This defines a required operator preflight, not an automated CI implementation. A separate security-reviewed executable gate may implement it later.

## Acceptance and falsification

1. A synthetic S→H name-status list containing the five **new** G4 checkpoint files only is allowed under the exception, with the sealed extension subtree unchanged.
2. Every changed/deleted/renamed preexisting checkpoint file, extra file, symlink or trust-policy/key/root change is refused. A new directory that omits any of the five required files is refused.
3. Missing/bad TPM signature, TSA token, owner trust fingerprint, external head, wrong `--commit`, dirty tree, or mismatched checkout bytes blocks/refuses as defined by the merged G4 verifier (#644/#646); no claim of live operational proof until owner enrollment and TSA selection.
4. On merge, M's tree must equal H and M's extension subtree must equal S. Re-verification on M requires `mode: release` `PASS OK` before tag.
5. Existing PASS #929 / rule-suite `result=pass` merge path remains unchanged and never becomes bypass authority.

## Boundaries

This plan does not approve any item in `V6_0_13_G4_OWNER_DECISIONS.md`, choose a TSA, enroll a TPM key, create checkpoints, change Statewright priorities, or decide to ship a governance-only v6.0.13. Release stays NO-GO.

An independent reviewer must assess whether the exception is narrow enough, whether the proposed Git diff preflight can detect Git tree aliases or renames, whether the two `--release` checks are correctly placed, and whether any unaccounted post-seal path is needed. Record a VETO and remediate instead of merging a failing audit.
