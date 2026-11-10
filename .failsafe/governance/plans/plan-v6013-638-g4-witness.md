# Plan: v6.0.13 G4 independently witnessed ledger checkpoints (#638)

**iteration**: 2 (after the independent audit VETO; ledger entry recorded once ledger order allows)
**change_class**: feature (release-governance tooling; not packaged in the VSIX)
**risk_grade (proposed)**: L3 (governance integrity, cryptographic verification)
**pr_target**: `main` via draft PR #641
**base**: `main` `f923fffb` (v6.0.12 published; the G4 deferral #920 expires at v6.0.13 publication or 2026-12-09)
**Ordering disclosure:** the implementation (commits `1d557ce9`, `d664ce03`) was written before this plan file. Its specification is the already-audited corrected G4 design in `plan-v6012-release-governance.md` (G4 section and Iteration 3; audits #917–#919). This plan is reviewed retrospectively against that design and the code. It is not a pre-implementation PASS.

## Scope (what the code does)

- **`FailSafe/extension/scripts/lib/g4/*.cjs` and the CLIs `g4-create-checkpoint.cjs`, `g4-verify-checkpoint.cjs` and `g4-tsa-probe.cjs`.**
  - **Checkpoint manifest:** the exact persisted UTF-8 bytes. It binds the repository, the commit, the complete ledger blob SHA-256 and byte length, the entry count and last entry, and the previous checkpoint (ID, manifest SHA-256, previous imprint) or the genesis marker "after clean epoch #914". It also carries:
    - the previous ledger length and SHA-256, for byte-prefix continuity;
    - the revocation registry SHA-256 and version;
    - the historical-gap statement SHA-256;
    - the key fingerprint and UTC instant.
  - **Signatures:** P-256 ECDSA over SHA-256(manifest), in IEEE P1363 encoding.
  - **RFC 3161 imprint:** SHA-256(`"FailSafe-G4-v1\0"` ‖ u64be(len manifest) ‖ manifest ‖ u64be(len sig) ‖ sig).
  - **Verifier:** checks the signature, the token (via `openssl ts -verify` against a pinned TSA root), the imprint, the key window, the chain, prefix continuity at each commit and at HEAD, registry monotonicity and non-revocation.
- **`tools/g4/`:**
  - `sign-checkpoint.ps1`: TPM signer, Microsoft Platform Crypto Provider.
  - `enroll-tpm-key.ps1`: **never executed**; it refuses to run without explicit owner-approval flags.
  - `revocations.json` (version 1), `tsa-policy.json` (`pending-owner-decision`), `HISTORICAL_GAPS.md`.
  - `.gitattributes` keeps every G4 artifact byte-exact.
- **Docs:** `docs/releases/G4_WITNESS_OPERATIONS.md` and `docs/releases/V6_0_13_G4_OWNER_DECISIONS.md`.

## Acceptance (for the code; owner steps are separate)

Falsification tests (`g4Witness`, `g4FalsifyLedger`, `g4FalsifyKeys`, `g4FalsifyTokens`) must refuse each of the following:
- an edited Verdict or Decision text, with or without a re-signed checkpoint;
- removed or reordered entries;
- a modified earlier prefix;
- an edited manifest;
- a changed commit;
- a forged ledger or registry digest;
- registry deletion, edit or rollback;
- a wrong, unknown, revoked, untrusted or reset key, or one outside its window;
- a missing, corrupt, replayed, out-of-policy or wrong-root token;
- an offline TSA;
- a checkpoint gap or an incomplete checkpoint.

The tests use a local OpenSSL test TSA and ephemeral software keys. With OpenSSL absent they **skip with a stated reason**; they never pass vacuously.

**Disclosed limit:** deleting the head checkpoint (with the ledger tail), or a full re-genesis under a new committed key, is undetectable without an external trusted head or a pinned fingerprint. `--trusted-head` and `--trust-fingerprint` detect it.

## Release gate (v6.0.13)

G4 counts as **qualified for v6.0.13** only when all of the following hold:
1. The owner enrolls the TPM key and publishes its fingerprint.
2. The owner selects a TSA and commits its pinned root.
3. A genesis checkpoint is created at the v6.0.13 seal, with a real token from that TSA.
4. `g4-verify-checkpoint.cjs` returns PASS on the release candidate with `--trust-fingerprint`.
5. The checkpoint head is recorded outside the repository.

Until then the verifier reports BLOCKED, and v6.0.13 is NO-GO unless a new owner decision, independently reviewed, changes the requirement.

## Owner decisions required (not made by this plan)

These are listed in `V6_0_13_G4_OWNER_DECISIONS.md`:
- TPM enrollment approval;
- where the fingerprint is published;
- which TSA (DigiCert is recommended; all seven probed TSAs answered on 2026-11-10);
- where the external head is kept;
- cadence and seal wiring;
- the key-transition format;
- whether revocation-notice timestamps must be verified.

## Iteration 2 (audit VETO remediation)

**B1.** Falsification tests now kill every mutant the audit listed: M06/M07 (registry rollback hidden by a merge, at HEAD and under a forged checkpoint), M18 (a validly signed substitute for an earlier checkpoint), M21 (a changed gap statement) and M31 (a genesis with no #914 epoch heading). They also kill M19, M20 and M23 (time skew, chain time order, token hash algorithm), plus the newly found M01, M02b and M10. Mutation re-run: 38 mutants, 37 caught. The one survivor is the token `granted` check, which `openssl ts -verify` already makes impossible to exercise; it is documented as defense in depth.

**Non-blocking fixes:**
- N3: `--release` refuses `--tsa-ca`, and `--repository` pins the expected repository.
- N4: unexpected errors return BLOCKED `INTERNAL_ERROR`, exit 2.
- N6: `granted`, the repository and the key algorithm are enforced.
- N2 (validate at token time with `-attime`) and N5 (a release PASS counts only from a clean checkout with `--release`) are documented as limitations and owner decisions 9 and 10.

Tests: 65/65 G4; full `test:node` 1045 passed, 0 failed.

## Not changed

No VSIX content, no ledger history, no `.qor` history. No v6.0.12 artifact.
