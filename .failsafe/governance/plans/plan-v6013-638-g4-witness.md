# Plan: v6.0.13 G4 independently witnessed ledger checkpoints (#638)

**iteration**: 1
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

## Not changed

No VSIX content, no ledger history, no `.qor` history. No v6.0.12 artifact.
