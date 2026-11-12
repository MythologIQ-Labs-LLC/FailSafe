# AUDIT REPORT: G4 owner certificate (#638), iteration 1

**Verdict:** PASS
**Risk grade:** L3 (trust input: the certificate becomes the key that every G4 checkpoint signature is verified against)
**Auditor:** independent `/qor-audit` tribunal (did not author the change)
**Date:** 2026-11-12
**Target:** worktree `C:\dev\mythologiq\FailSafe-g4key`, branch `feat/638-g4-owner-key` (not pushed), commit `d7f3b61b9363ba017e95e95cad61ac2a58576e36`
**Reviewed diff:** `git diff origin/fix/665-g4-tpm-scripts d7f3b61b` (base `08e8920a`, PR #666, PASS ledger #965)
**Plan:** `.failsafe/governance/plans/plan-v6013-638-g4-owner-key.md` (SHA-256 `b9eb669d...a984662`, equal to `plan_content_hash` in `.qor/gates/2026-11-12T2029-3ab1f1/plan.json`)
**Violations:** none

## 1. Certificate

Committed blob `tools/g4/keys/a50c00715e7275a86fad338c80ceacd161da02bdf2b75c60b1082eb518265d8b.cer` (git blob `1fb861cf`, mode 100644, 418 bytes).

| Check | Result |
|---|---|
| `git show d7f3b61b:<path> \| sha256sum` | `a50c00715e7275a86fad338c80ceacd161da02bdf2b75c60b1082eb518265d8b`: equals the file name and the fingerprint reported to the owner |
| Working-tree file | byte-identical to the committed blob (`cmp`) |
| Encoding | DER X.509 v3 (`openssl x509 -inform DER` parses) |
| Public key | id-ecPublicKey, prime256v1 (NIST P-256), 256 bit |
| Signature algorithm | ecdsa-with-SHA256; self-signature verifies (`openssl verify -check_ss_sig`) |
| Extensions | exactly two: Key Usage = Digital Signature, critical; Basic Constraints CA:FALSE, critical. No EKU, no SAN, no other extension (asn1parse) |
| Validity | 2026-11-12T19:54:46Z to 2028-11-11T19:54:46Z = exactly 730 days |
| Subject / issuer | `O=MythologIQ Labs LLC, CN=FailSafe G4 Ledger Witness` (self-issued) |
| Serial | `E0ADE76C79AD0AE8` (matches ENROLLMENT.md) |
| G4 loader | `signer.cjs` `loadCertificate` accepts it; its fingerprint and `certFingerprint` both return `a50c0071...265d8b` |
| `.gitattributes` | `tools/g4/keys/** binary`; `git check-attr` reports binary set, text/diff/merge unset |

**TPM key, read-only** (`CngKey.Exists`/`Open` on `FailSafe-G4-Ledger-Witness`, Microsoft Platform Crypto Provider; public blob export only; no signing, creation, deletion or private export attempted):
- Exists True; Algorithm ECDSA; KeySize 256; ECCCurveName nistP256; ExportPolicy None; KeyUsage Signing; IsMachineKey False; IsEphemeral False.
- EccPublicBlob magic `ECS1`, cbKey 32. X||Y equals the certificate's uncompressed point `04 1c66869e...6eb0b647` byte for byte. The certificate is the public half of the enrolled TPM key.

## 2. Scope of the diff

Files changed (11): the `.cer`; `ENROLLMENT.md`; the plan; four gate files under `.qor/gates/2026-11-12T2029-3ab1f1/` (plan.json and plan-iter1.json identical); `.qor/session/current`; three docs under `docs/releases/`.
- No `.cjs`, `.js`, `.ts`, `.ps1`, workflow or `.gitattributes` change. No code or trust-semantics change. The only trust-input change is the new certificate.
- No private key material: no `PRIVATE KEY` or `BEGIN EC/RSA/ENCRYPTED` text, and no `.key`, `.pfx`, `.p12` or `.pem` file added. The only hits are prose ("No private key material") and pre-existing table rows naming `.pem` files.
- The merge `e002ff1a` has parents `3a0aa5a4` and `08e8920a`. The reviewed diff is the merged tree against the #666 tip.
- All new and changed files are ASCII. The one non-ASCII line in `G4_WITNESS_OPERATIONS.md` (line 44) was already there and this change does not touch it. Nothing in the diff writes the forbidden product-name token.
- Gate metadata: `high_risk_target: false` is correct. By the schema (`qor/gates/schema/plan.schema.json`) the flag means an EU AI Act Annex III high-risk AI system, not risk grade. This is not an understatement of L3.

## 3. Documentation accuracy

- `G4_WITNESS_OPERATIONS.md`: the status line and the `tools/g4/keys` row now state that the key was enrolled on 2026-11-12 and name the certificate path. "No checkpoint exists" is true: `tools/g4/checkpoints` is empty at `d7f3b61b` and the verifier returns BLOCKED NO_CHECKPOINTS.
- `V6_0_13_G4_OWNER_DECISIONS.md`: "No TPM key exists" is replaced by the enrolled state. The 2026-11-10 lines that remain are explicitly dated history.
- `V6_0_13_G4_OWNER_DECISION_RECORD_PROPOSED.md`:
  - The status line is updated.
  - The section 2a row for items 1 and 2 records enrollment as done, cites #665 and the single authorized retry, and keeps rotation, recovery and replacement behind new authorization.
  - Row 8 is updated ("key is enrolled, but no genesis exists"), which is accurate.
  - The general prohibition on unauthorized key operations is unchanged and still consistent.
- `ENROLLMENT.md`, checked where independently checkable:
  - 418 bytes, the fingerprint, subject, serial, validity, extensions and algorithms all match.
  - The key properties (provider, ExportPolicy None, Signing, user-scoped persistent, 256, nistP256, ECS1) all match my read-only reads.
  - "Script has no diff against the audited source `4bb2c324`" is consistent. `4bb2c324` is an ancestor of `main` `5b7994a6` with no later change to `enroll-tpm-key.ps1`. #666 is what changes that script, so run 2 used the audited main script with an explicit `-KeysDir`.
- A sweep of `docs/releases` and `tools/g4` (excluding scripts) finds no remaining statement that no owner key exists, except dated history: `V6_0_12_G4_DISPOSITION.md` (the v6.0.12 record) and `V6_0_13_G4_TSA_OWNER_SELECTION_2026-11-12.md` (the dated TSA record, whose authority boundary was superseded by a separate authorization). The enrollment procedure section reads as procedure, not as a claim about current state.

Not independently reproducible, by constraint or by nature (recorded, not counted as violations):
- the owner's offline fingerprint record and the authorizations under #647 item 1;
- the run-1 failure and its no-side-effect claim;
- the refused private-blob export: I was not permitted to attempt it, but ExportPolicy None corroborates it;
- the throwaway-message signing check.

The docs attribute the offline record to the owner and do not claim that the repository proves it. Consistency with the reported fingerprint is confirmed.

## 4. Tests and verifier (run from `FailSafe/extension`)

- `node --test src/test/scripts/g4*.test.cjs`: 163 tests, 163 pass, 0 fail.
- `node --test src/test/docs/*.test.cjs`: 145 tests, 145 pass, 0 fail.
- `node scripts/g4-verify-checkpoint.cjs --repo-root ../..`: `BLOCKED NO_CHECKPOINTS`, exit 2 (diagnostic mode), as expected.

## 5. Ledger

- `git diff origin/fix/665-g4-tpm-scripts d7f3b61b -- docs/META_LEDGER.md` is empty. The last entry is #965.
- `qor.cli verify-ledger --post-anchor` prints `post-anchor clean (boundary=#382)`. Its only other output is pre-anchor DISCLOSED residuals.
- By the caller's constraint, this audit makes no ledger or gate edit.

## Audit passes

| Pass | Result |
|---|---|
| Security (L3) | PASS: no credentials, no private material, no bypassed check, and the certificate is restricted to signing (non-CA, no EKU) |
| Ghost UI | N/A: no UI |
| Simplicity Razor | N/A: no code |
| Dependency | PASS: none added |
| Macro-level architecture | PASS: no module or layering change |
| Orphan / build path | PASS: the certificate is consumed by the existing `tools/g4/keys/` loader path; the docs and evidence are records |

## Verdict

PASS. The committed certificate is exactly the public half of the enrolled non-exportable TPM P-256 signing key, and its SHA-256 equals both the file name and the reported fingerprint. The diff changes no code or trust semantics, and the docs are accurate and not overstated.
