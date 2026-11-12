# G4 owner key enrollment record (2026-11-12)

## Authorization

The owner authorized enrollment on 2026-11-12 under FailSafe #647 item 1. The approved parameters:
- persistent TPM signing key `FailSafe-G4-Ledger-Witness`;
- ECDSA P-256 in the Microsoft Platform Crypto Provider;
- non-exportable, signing only;
- a 730-day certificate.

The owner then authorized one controlled retry with an explicit `-KeysDir`, also on 2026-11-12, after the first run failed (#665).

The owner confirmed on 2026-11-12 that the fingerprint below was recorded offline, independently of this repository, before this certificate was committed.

## Runs

| Run | Command | Result |
|---|---|---|
| 1 | `tools\g4\enroll-tpm-key.ps1 -OwnerApprovalRef "..." -ConfirmPersistentTpmKey -ValidDays 730`, from a clean worktree of `main` `5b7994a6` | Failed at parameter binding (`Join-Path : Cannot bind argument to parameter 'Path' because it is an empty string`): Windows PowerShell 5.1 leaves `$PSScriptRoot` empty in `param()` defaults (#665). No key and no file were created, confirmed read-only afterwards. |
| 2 | The same command plus `-KeysDir C:\dev\mythologiq\FailSafe-g4key\tools\g4\keys` | Succeeded, exit 0 |

Pre-checks before run 2:
- the key did not exist;
- the output path is a real directory inside the worktree, with no junction or symlink, and is writable;
- the script has no diff against the audited source `4bb2c324`.

The `OwnerApprovalRef` passed was: "Owner authorization 2026-11-12, FailSafe #647 item 1 (retry with explicit -KeysDir authorized 2026-11-12): enroll persistent TPM signing key FailSafe-G4-Ledger-Witness (ECDSA P-256, Microsoft Platform Crypto Provider, non-exportable, signing only, 730 days) on the owner's Windows development workstation".

## Result

- **Certificate:** `tools/g4/keys/a50c00715e7275a86fad338c80ceacd161da02bdf2b75c60b1082eb518265d8b.cer`, 418 bytes.
- **Fingerprint (SHA-256 of the DER certificate):** `a50c00715e7275a86fad338c80ceacd161da02bdf2b75c60b1082eb518265d8b`. The same value from `Get-FileHash`, `certutil -hashfile`, `sha256sum` and G4's `loadCertificate`.
- **Certificate fields:**
  - subject and issuer `O=MythologIQ Labs LLC, CN=FailSafe G4 Ledger Witness`;
  - serial `E0ADE76C79AD0AE8`;
  - valid 2026-11-12T19:54:46Z to 2028-11-11T19:54:46Z;
  - Key Usage Digital Signature (critical), Basic Constraints CA:FALSE (critical);
  - id-ecPublicKey on prime256v1, signed with ecdsa-with-SHA256.
- **Key, read-only:**
  - Microsoft Platform Crypto Provider; ExportPolicy None; KeyUsage Signing;
  - persistent, user-scoped;
  - KeySize 256, `ECCCurveName` nistP256, public blob magic `ECS1`.

  An attempt to export the private blob was refused ("Invalid type specified").
- **Signing interoperability** was checked on a throwaway message, not a checkpoint.
  - The audited `sign-checkpoint.ps1` refused the key (`is ECDSA, not ECDSA P-256`) before signing, and wrote nothing (#665).
  - With the #665 fix, it produced a 64-byte signature. G4's `verifySignature` accepted it against this certificate and rejected it for a one-bit-changed message.

No private key material exists outside the TPM, and none is in this repository.
