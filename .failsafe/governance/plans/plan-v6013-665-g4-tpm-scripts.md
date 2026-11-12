# Plan: G4 TPM scripts on Windows PowerShell 5.1 with a real key (#665, #638, v6.0.13)

**Status:** iteration 2, after the independent VETO recorded as ledger Entry #964 (iteration 1 audited `9b2a304d`). This document records no PASS and no merge authority.
**Baseline:** `main` `5b7994a6b0a9f1c7d7348965b5f0569af2abc5b3`. **Branch:** `fix/665-g4-tpm-scripts`.
**Change class:** fix to owner-only release tooling. Risk grade L2: it changes which keys the checkpoint signer accepts, and it must not widen that set beyond P-256.

## What failed (owner-authorized enrollment, 2026-11-12)

1. **`tools/g4/enroll-tpm-key.ps1`.**
   - The default `[string]$KeysDir = (Join-Path $PSScriptRoot 'keys')` failed. Windows PowerShell 5.1.26100 evaluates `param()` defaults with `$PSScriptRoot` empty, so binding stopped with `Join-Path : Cannot bind argument to parameter 'Path' because it is an empty string`.
   - Read-only checks afterwards confirmed that no key and no file had been created.
   - The owner then authorized one retry that passed `-KeysDir` explicitly. It succeeded: key `FailSafe-G4-Ledger-Witness`, certificate SHA-256 `a50c00715e7275a86fad338c80ceacd161da02bdf2b75c60b1082eb518265d8b`.
2. **`tools/g4/sign-checkpoint.ps1`.**
   - The real key reports `CngKey.Algorithm = ECDSA`, with group ECDSA, `KeySize` 256, `ECCCurveName = nistP256` and public blob magic `ECS1` (P-256).
   - The signer required `ECDsaP256` and refused before signing (`... is ECDSA, not ECDSA P-256`). No signature was written.
   - Every checkpoint signature would therefore fail.

Both scripts are covered by tests that only parse them. Neither defect weakened trust: both failed closed.

## Change

- **`enroll-tpm-key.ps1`:** `KeysDir` defaults to `''` and is resolved in the script body as `Join-Path $PSScriptRoot 'keys'`, where `$PSScriptRoot` is set. Nothing else changes: the same refusals, key parameters, certificate and output.
- **`sign-checkpoint.ps1`:** a new `Test-P256Key` function. A key is P-256 when its algorithm is `ECDsaP256`, or when its algorithm group is ECDSA and `KeySize` is 256 and its `ECCCurveName` property reads `nistP256`. Any other key, or an unreadable curve, is refused.

  Unchanged: the export-policy refusal, signing SHA-256 over the exact manifest bytes, the 64-byte IEEE P1363 length check, and self-verification against the committed certificate before any signature is written.
- **New test file `FailSafe/extension/src/test/scripts/g4PowerShellScripts.test.cjs`** (Windows PowerShell only). It executes the scripts rather than only parsing them:
  - The enrollment script runs without `-ConfirmPersistentTpmKey`. It must get past parameter binding and refuse in its body. No key is touched.
  - `Test-P256Key` is extracted from the script by its AST and checked against two kinds of key. Real ephemeral software CNG keys: P-256 is accepted and P-384 refused. Stand-in key objects: the TPM-style generic ECDSA with nistP256 is accepted, while generic ECDSA with P-384, a wrong 256-bit curve or no curve property is refused, and so is RSA.

## Evidence

- Each new test fails on the original script and passes on the fix (planted by restoring the `main` version of each script).
- G4 suites: 161/161 (iteration 1); 163/163 (iteration 2). Real-key signing re-verified with the case-sensitive check.
- **Real key, verification only:** the fixed signer signed a throwaway message (not a checkpoint) with `FailSafe-G4-Ledger-Witness`. G4's `verifySignature` accepted the 64-byte signature against the new certificate and rejected it for a one-bit-changed message.

## Out of scope

- No key is created, deleted or replaced, and the certificate is not committed here; it goes through its own PR after the owner records the fingerprint offline.
- No checkpoint, genesis or release.

## Iteration 2 (VETO #964 remediation)

- **V1. "Never run by automation" had become false.** The new test runs `enroll-tpm-key.ps1`, without `-ConfirmPersistentTpmKey`.
  - The three statements now say exactly that: the script's header, the `G4_WITNESS_OPERATIONS.md` row, and the `g4Witness` test title. Automation never passes `-ConfirmPersistentTpmKey`, and runs the script only to check that it refuses.
  - The safety of that run rests on an ordering invariant, which the header now states: the `-ConfirmPersistentTpmKey` and `-OwnerApprovalRef` refusals come before any key-provider call.
  - A new test enforces the invariant: both refusals must precede the first `CngProvider` or `CngKey` reference in the script body.
- **N1.** The curve comparison is now case-sensitive (`-ceq 'nistP256'`). A test case with `NISTP256` is refused.
- **N3.** A new test checks that `Open-WitnessKey` refuses through `Test-P256Key` and no longer through the strict algorithm comparison.
- **Plan wording.** The `Test-P256Key` test fails on the original script because that script lacks the function. Its behaviour on the real defect, a generic-`ECDSA` P-256 key, is covered by the stand-in case and by the real-key verification above.

## Audit questions

1. Can `Test-P256Key` accept any key that is not ECDSA P-256?
2. Is the enrollment script's behaviour otherwise identical?
3. Do the tests really execute what they claim, and do they fail on the original defects?
