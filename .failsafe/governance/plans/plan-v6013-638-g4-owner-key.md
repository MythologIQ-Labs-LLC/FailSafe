# Plan: commit the owner's G4 witness certificate (#638, v6.0.13)

**Status:** iteration 1, PROPOSED for independent audit. This document records no PASS and no merge authority.
**Base:** stacked on PR #666 (`fix/665-g4-tpm-scripts`, PASS #965), which is based on `main` `5b7994a6`. **Branch:** `feat/638-g4-owner-key`.
**Change class:** trust input. Risk grade L3: this certificate becomes the key that every G4 checkpoint signature is checked against. Its fingerprint, held offline by the owner, is the genesis pin for `--trust-fingerprint`.

## Change

| Path | Change |
|---|---|
| `tools/g4/keys/a50c00715e7275a86fad338c80ceacd161da02bdf2b75c60b1082eb518265d8b.cer` | New. The 418-byte public DER certificate of TPM key `FailSafe-G4-Ledger-Witness`. The file name is its SHA-256. |
| `.failsafe/governance/evidence/g4-owner-key/ENROLLMENT.md` | New. The authorization, both runs, the pre-checks, the result, read-only key properties, and the signing-interoperability check. |
| `docs/releases/G4_WITNESS_OPERATIONS.md`, `V6_0_13_G4_OWNER_DECISIONS.md`, `V6_0_13_G4_OWNER_DECISION_RECORD_PROPOSED.md` | Statements that no owner key exists are updated to the enrolled state. The decision record's section 2a row for items 1 and 2 records enrollment as done (audit #965 N1). The dated 2026-11-10 evidence line stays as history. |

There is no code change and no change to trust semantics. Genesis-key pinning, transitions and revocation behave as before; the release verification passes the owner's offline fingerprint as `--trust-fingerprint`.

## Owner record

- Enrollment authorized on 2026-11-12 (#647 item 1), and one retry with `-KeysDir` authorized the same day (#665).
- The owner confirmed on 2026-11-12, before this certificate was committed: "fingerprint recorded offline".

## Evidence

- **Certificate fields** (`openssl x509 -inform DER`):
  - subject and issuer `O=MythologIQ Labs LLC, CN=FailSafe G4 Ledger Witness`;
  - valid 2026-11-12T19:54:46Z to 2028-11-11T19:54:46Z;
  - Key Usage Digital Signature (critical), CA:FALSE (critical);
  - P-256, ecdsa-with-SHA256.
- **Fingerprint:** the same value from four tools.
- **Key, read-only:** non-exportable (a private-blob export was refused), signing only, nistP256.
- **Signing:** with the #666 signer, the key's signature over a throwaway message verifies against this certificate, and fails for a changed message.
- **Tests:** G4 suites 163/163 and docs suites 145/145 on this branch. The verifier on the repository returns `BLOCKED NO_CHECKPOINTS`.

## Audit questions

1. Is the committed blob exactly a P-256, non-CA, signing-only certificate whose SHA-256 is the file name and the value reported to the owner?
2. Does anything else in the diff change trust or code?
3. Are the updated docs accurate, and is anything overstated?
