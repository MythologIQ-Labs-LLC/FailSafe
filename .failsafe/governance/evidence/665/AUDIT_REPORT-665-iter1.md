# Audit report: #665 G4 TPM scripts, iteration 1

- Target: worktree `C:\dev\mythologiq\FailSafe-665`, branch `fix/665-g4-tpm-scripts`, commit `9b2a304d0f81d442e03a4d15f93c1709c1caa2c6` (draft PR #666)
- Baseline: `main` `5b7994a6`
- Plan: `.failsafe/governance/plans/plan-v6013-665-g4-tpm-scripts.md` (iteration 1), risk L2
- Auditor: independent adversarial auditor (/qor-audit), not the author
- Environment: Windows PowerShell 5.1.26100.9818, Node v24.19.0, Windows 11
- Date: 2026-11-12

## Verdict: VETO

One violation (V1). The code changes themselves are correct and fail closed. The
VETO is for a stated safety invariant that this change makes false and does not
reconcile.

## Scope note

As the caller instructed, I did not edit the ledger, the gates, the shadow genome or
any repository file. The only file written is this report. I did not open, use,
create or delete the TPM key `FailSafe-G4-Ledger-Witness`. I did not run
`enroll-tpm-key.ps1` with `-ConfirmPersistentTpmKey`. All probes used ephemeral
(unnamed) software CNG keys and stand-in objects. No network was used.

## Checks

### C1. Test-P256Key acceptance set (PASS)

To probe the function, I extracted it from the target script by its AST, as the test
does, and ran it under `Set-StrictMode -Version Latest` with
`ErrorActionPreference Stop`. The probe script is in the session scratchpad
(`probe.ps1`). It ran with:
`powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File probe.ps1`.

Real ephemeral software CNG keys:

| Key | Result |
| --- | --- |
| ECDSA_P256 (CngAlgorithm.ECDsaP256) | True |
| ECDSA_P384, ECDSA_P521 | False |
| ECDH_P256, ECDH_P384 | False |
| RSA | False |
| ECDsaCng(named nistP256) -> reports ECDSA_P256 | True |
| ECDsaCng(named nistP384, nistP521, brainpoolP384r1) | False |
| Generic ECDSA, KeySize 256: brainpoolP256r1, brainpoolP256t1, secP256k1 | False |
| Generic ECDSA, KeySize 256: secP256r1, X962P256v1 (P-256 aliases) | False (fails closed) |
| Generic ECDSA, KeySize 239 (X962P239v1) | False |
| ECDiffieHellmanCng(named nistP256 / brainpoolP256r1) | False |
| Explicit-parameter P-256 (no curve name) | False (fails closed) |

I confirmed that the real `ECCCurveName` readback for a generic key works: a
brainpoolP256r1 key returned `brainpoolP256r1`.

Stand-in objects (generic `ECDSA` algorithm, ECDSA group, KeySize 256, unless noted):

| Case | Result |
| --- | --- |
| `nistP256\0` and `nistP256` | True |
| `nistP256\0x` (trailing data), `nistP256 `, ` nistP256`, `nistP2560` | False |
| ASCII-encoded bytes, empty bytes | False |
| GetProperty throws, GetValue throws | False |
| GetValue returns null | throws (GetString null), so Open-WitnessKey aborts: fail closed |
| KeySize 384 with `nistP256` | False |
| ECDH group or ECDH_P256 algorithm with `nistP256` | False |
| RSA or DSA group with KeySize 256 and `nistP256` | False |
| Group `ecdsa` (lower case CngAlgorithmGroup) | False (CngAlgorithmGroup.Equals is ordinal) |
| CngAlgorithm `ecdsa_p256` (lower case) | False |
| Algorithm or KeySize getter throws, all null, null key | False or throws: fail closed |
| `NISTP256` / `nistp256` (curve casing) | True (see note N1) |
| Algorithm as a plain string `ecdsa_p256`, KeySize as string `'256'` | True (see note N2) |

Conclusion: no real CNG key that is not ECDSA on NIST P-256 was accepted. The
following refusals are unchanged by the diff and remain in place, in order: the
export policy (`ExportPolicy -ne None` throws), the 64-byte signature length, and
`VerifyHash` against the committed certificate before `WriteAllBytes`. These are
confirmed by `git diff 5b7994a6 9b2a304d -- tools/` and by reading the full script.

### C2. Enrollment script otherwise unchanged (PASS)

The diff touches only the `KeysDir` default (now `''`) and one body line,
`if ([string]::IsNullOrWhiteSpace($KeysDir)) { $KeysDir = Join-Path $PSScriptRoot 'keys' }`,
which runs before the refusals. Everything else is unchanged: the parameters and
their order, the refusal order (switch, approval ref, existing key), the creation
parameters (Platform Crypto Provider, ExportPolicy None, Signing, options None,
ECDsaP256), the certificate extensions, and the output path `Join-Path $KeysDir "<fp>.cer"`.

An explicit `-KeysDir` is used verbatim. The one delta is that an explicit empty or
whitespace `-KeysDir` now means the default, where it used to fail. The old
behaviour was a failure, so nothing is weakened. With the switch absent, the script
reaches its refusal (confirmed by the test run below).

### C3. Tests (PASS for execution and planting; see V1 for documentation)

- `node --test src/test/scripts/g4PowerShellScripts.test.cjs` (from `FailSafe/extension`): 2/2 pass.
- `node --test src/test/scripts/g4*.test.cjs`: 161/161 pass.
- Planted original `enroll-tpm-key.ps1` (`git show 5b7994a6:tools/g4/enroll-tpm-key.ps1`):
  the enroll test fails with the `Join-Path : Cannot bind argument ... empty string`
  output. The other test passes.
- Planted original `sign-checkpoint.ps1`: the P-256 test fails. The other test passes.
- Restored both files with `git checkout`. `git diff --quiet 9b2a304d -- tools` is
  clean and `git status --short` is empty.
- No persistent or TPM key: the enroll test runs without `-ConfirmPersistentTpmKey`
  and refuses before the provider is constructed. The probe uses
  `CngKey.Create(alg)` with no name, which makes an ephemeral key in the software
  KSP, plus stand-in objects. The existing `g4Witness` test only calls `Exists` for
  a random nonexistent name.

### C4. Owner key untouched (PASS)

I issued no command that names or opens `FailSafe-G4-Ledger-Witness`.

### C5. Plan accuracy and Section 4 razor

- Razor. `Test-P256Key` is 11 lines. `sign-checkpoint.ps1` is about 100 lines,
  `enroll-tpm-key.ps1` about 80, and the test file 73. Nesting is at most 2. There
  are no nested ternaries and no new dependencies. All pass. No orphan: the test
  matches the `g4*` glob and the scripts are called by `signer.cjs` or by the owner.
- Security pass. No credentials, no placeholder auth and no bypassed check. The
  certificate is not committed.
- Plan claims I verified: 161/161, and the planted failures for both tests.
- Plan claim I could not verify: the real-key throwaway signature. By constraint,
  I did not touch the owner key.
- Plan wording. "Each new test fails on the original script" is true, but for the
  signer the test fails because `Test-P256Key` does not exist in the original
  script. It does not exercise the original `Open-WitnessKey` refusal path (N3).

## Violations

### V1. The change makes a stated safety invariant false and does not reconcile it

The new test executes `tools/g4/enroll-tpm-key.ps1` from automation
(`node --test`, and so `npm run test:node`). Three shipped statements say this never
happens:

- `tools/g4/enroll-tpm-key.ps1` line 6: "NOT EXECUTED BY ANY AUTOMATION."
- `docs/releases/G4_WITNESS_OPERATIONS.md` line 20: "Owner only; never run by automation".
- `FailSafe/extension/src/test/scripts/g4Witness.test.cjs` line 118, test title:
  "(enroll-tpm-key.ps1 is never run)".

The plan does not mention or justify this change to the invariant. The run is safe
today only because the `-ConfirmPersistentTpmKey` refusal comes before any provider
or key operation. Nothing records that ordering as a load-bearing constraint, and the
test runs on the owner's TPM-equipped workstation.

Remediation:

- Either update the three statements to say exactly what automation may do. For
  example: "automation runs it only without `-ConfirmPersistentTpmKey`, to check that
  it refuses; nothing is created". State in the script that the switch refusal must
  stay ahead of any CNG call.
- Or drop the execution test and keep the binding check by another means.
- Record the decision in the plan.

## Notes (not violations)

- N1. PowerShell `-eq` is case-insensitive, so the curve test accepts `NISTP256` and
  `nistp256`. These name the same curve, and the key comes from the provider, so the
  accepted set does not grow beyond P-256. A `-ceq` comparison would match the plan's
  wording ("reads `nistP256`") exactly.
- N2. A plain-string `Algorithm` is compared case-insensitively, and a string KeySize
  is coerced. A real `CngKey` returns typed `CngAlgorithm` and `int` values, so
  neither path is reachable from `CngKey.Open`.
- N3. The tests exercise the extracted function only. That `Open-WitnessKey`
  actually calls `Test-P256Key` is confirmed by inspection, not by a test. A mutant
  that drops the call would pass both new tests. Downstream, the self-verification
  against the certificate still bounds what can be written.
- N4. P-256 aliases reported as generic ECDSA with names `secP256r1` or `X962P256v1`,
  and explicit-parameter P-256 keys, are refused. This fails closed. It is relevant
  only if a future TPM reports such a name.
- N5. The diff also carries `.qor/gates/...` plan gate files and a
  `.qor/session/current` bump. They are outside this audit's code scope.
