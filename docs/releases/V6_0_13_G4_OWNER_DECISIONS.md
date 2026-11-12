# FailSafe v6.0.13: G4 owner decisions needed (#638)

> **Reconciled 2026-11-10 with the merged implementation** (`main` `6a7eced4`; PRs #644 and #646). The consolidated proposal for all ten items, with the retention procedure and the prepared commands, is `V6_0_13_G4_OWNER_DECISION_RECORD_PROPOSED.md`. It is **PROPOSED, NOT APPROVED**. Item 10 below is now enforced in code by `--release` (audit PASS #934). As of 2026-11-10 no decision had been made; see the 2026-11-12 status below.

**Status (reconciled 2026-11-12):** item 3 is DECIDED: the FreeTSA public service (`V6_0_13_G4_TSA_OWNER_SELECTION_2026-11-12.md`). The other items carry the owner's policy direction of 2026-11-12, recorded with the remaining gaps in section 2a of `V6_0_13_G4_OWNER_DECISION_RECORD_PROPOSED.md`. No executable operation is authorized by either file. The evidence and recommendation below are the 2026-11-10 record and are kept as written; their recommendation of DigiCert is superseded by the owner's FreeTSA selection. No TPM key exists, and `main` reports `BLOCKED TSA_POLICY_UNSELECTED` until the separately audited single-root policy PR merges.

The G4 deferral in `docs/releases/V6_0_12_G4_DISPOSITION.md` expires at the v6.0.13 release or on 2026-12-09, whichever comes first.

## TPM inventory (read-only, this host, 2026-11-10)

Commands run: `tpmtool getdeviceinformation`, `certutil -csplist`, and `Get-Tpm`. No key was created, opened, listed or deleted.

| Item | Result |
|---|---|
| TPM present / version | True / 2.0 |
| Manufacturer | AMD (vendor ID `AMD`), firmware version 6.32.0.6 |
| Spec version / errata | 1.59 / 2020-06-18; PC Client 1.05; PPI 1.3 |
| Initialized / ready for storage / ready for attestation | True / True / True |
| Capable for attestation | True |
| Vulnerable firmware | False |
| Clear needed to recover / clear possible | False / True |
| Lockout | not locked out; counter 0; max auth fail 32; interval 7200 s; recovery 86400 s |
| BitLocker PCR7 binding | Binding Not Possible |
| `certutil -csplist` | `Microsoft Platform Crypto Provider` listed. `Microsoft Pluton Cryptographic Provider` listed as "Not implemented" |
| `Get-Tpm` | Not run: "Administrator privilege is required to execute this command." (a non-elevated session) |
| .NET (Windows PowerShell 5.1) | .NET Framework 4.8 (release 534296). `CertificateRequest` is available in `System.Core`. `CngProvider.MicrosoftPlatformCryptoProvider` is not a property on .NET Framework, so the scripts construct the provider by name |

The TPM's "Clear possible: True" matters: a TPM clear destroys the G4 key by design (see "Recovery" in `G4_WITNESS_OPERATIONS.md`).

## TSA probe (2026-11-10T16:34Z)

Command: `node FailSafe/extension/scripts/g4-tsa-probe.cjs --out <scratch dir>`. Each TSA received one RFC 3161 request (`openssl ts -query -digest <hex> -sha256 -cert`) for SHA-256 of 64 bytes of fresh random data. No repository content was sent. Verification used OpenSSL 3.5.7: `openssl ts -verify -digest <hex> -in probe.tsr -CAfile <CA> -untrusted <certificates from the token>`. CA = Git for Windows' Mozilla bundle (`mingw64/etc/ssl/certs/ca-bundle.crt`), unless noted.

| TSA (URL) | HTTP | Granted, SHA-256 | Signer seen in token | `openssl ts -verify` |
|---|---|---|---|---|
| DigiCert (`http://timestamp.digicert.com`) | 200 | yes | DigiCert SHA256 RSA4096 Timestamp Responder 2026 1, via DigiCert Trusted G4 TimeStamping RSA4096 SHA256 2025 CA1 | **OK** (Mozilla bundle) |
| Sectigo (`http://timestamp.sectigo.com`) | 200 | yes | Sectigo Public Time Stamping Signer R37, via CA R41 and Root R46 (cross-signed by USERTrust RSA) | **OK** (Mozilla bundle) |
| FreeTSA (`https://freetsa.org/tsr`) | 200 | yes | www.freetsa.org TSA, via the FreeTSA self-signed root | **FAILED** against the Mozilla bundle ("self-signed certificate in certificate chain"). OK against `https://freetsa.org/files/cacert.pem`, which is trust-on-first-use |
| GlobalSign (`http://timestamp.globalsign.com/tsa/r6advanced1`) | 200 | yes | Globalsign R45 TSA for CodeSign 202510, via the R45 Timestamping CA, to GlobalSign Root R6 | **OK** (Mozilla bundle) |
| SSL.com (`http://ts.ssl.com`) | 200 | yes | SSL.com Timestamping Unit 2026 E1, via the Timestamping Issuing RSA CA 2 | **OK** (Mozilla bundle) |
| Entrust (`http://timestamp.entrust.net/TSS/RFC3161sha2TS`) | 200 | yes | **Sectigo** Public Time Stamping Signer R37: the same signer as Sectigo | **OK** (Mozilla bundle). Not an independent operator from Sectigo |
| Certum (`http://time.certum.pl`) | 200 | yes | Certum Timestamp 2026, via Certum Timestamping 2021 CA | **OK** (Mozilla bundle) |

Every TSA answered within the 20 s timeout, and every token's genTime was within a few seconds of the request. The probe is a single sample: it says nothing about long-term availability or rate limits.

## Recommendation (not a decision)

**Primary TSA: DigiCert, `http://timestamp.digicert.com`.**
- It validated against the public Mozilla root set with no extra trust material.
- Its token embeds the full chain to **DigiCert Trusted Root G4** (Mozilla bundle DER SHA-256 `552f7bdcf1a7af9e6ce672017f4f12abf77240c78e761ac203d1d9d20ac89988`, valid to 2038-01-15).
- It needs no account or payment.
- It is the TSA commonly used for Windows Authenticode, so its availability is in many parties' interest.
- It is operated independently of the owner and of GitHub.

**Alternative: Sectigo, `http://timestamp.sectigo.com`.** It also validated. Its root path depends on a USERTrust cross-signature, and the "Entrust" endpoint returns Sectigo tokens, so the two cannot count as two independent witnesses.

**Not recommended:** FreeTSA, because its root is outside the public root programs and can be trusted only on first use.

Listing more than one root in `tsa-policy.json` widens trust: any listed TSA can then witness a checkpoint. The recommendation is one root, unless the owner chooses a fallback on purpose.

## Approvals needed from the owner

Each item needs an explicit, dated owner record, such as a committed decision file or ledger entry. None has been given.

1. **Enrollment procedure.** Approve `tools/g4/enroll-tpm-key.ps1` and its parameters:
   - key name `FailSafe-G4-Ledger-Witness`;
   - ECDSA P-256 in the Microsoft Platform Crypto Provider, non-exportable, signing only, current user;
   - subject `CN=FailSafe G4 Ledger Witness, O=MythologIQ Labs LLC`;
   - validity (proposed 730 days).

   Then the owner runs it on the owner's workstation and commits only the `.cer`.
2. **Key fingerprint publication.** Where the owner fingerprint is recorded outside the repository, so verifiers can pin it with `--trust-fingerprint`.
3. **TSA selection.** Which TSA (recommended: DigiCert). The owner commits its root PEM under `tools/g4/tsa-roots/` and sets `tsa-policy.json` to `"status": "selected"` with the root's DER SHA-256.
4. **Trusted-head retention.** Where each checkpoint head (`g4-NNNNNN:<manifest sha256>`) is retained independently of the repository, for example an owner-held offline record or a public transparency log. Without it, truncation and re-genesis stay undetectable, and the test suite demonstrates both.
5. **Cadence and gate wiring.** Confirm one checkpoint at every `/qor-substantiate` seal and every RC promotion. Approve adding the checkpoint and verification step to the seal procedure (not wired in this change), and creating the genesis checkpoint at the v6.0.13 seal.
6. **Key transition and recovery procedure.** Approve:
   - the format of the key-transition record: timestamped and bound to the old fingerprint, with owner identity attestation and an independent technical PASS;
   - the cross-chain continuity rule.

   Until then, every key change is `REFUSED KEY_RESET`.
7. **Revocation-notice timestamps.** Decide whether the verifier must also verify an RFC 3161 token for each registry version (`tools/g4/revocation-notices/v<N>.tsr`). The v6.0.13 code binds and checks the registry digest, version and append-only history, but not notice tokens.
8. **Release disposition.** Whether the v6.0.13 release ships with G4 qualified (key enrolled, TSA selected, genesis created and verified) before the deferral expires, or needs a new, separately recorded and reviewed decision.
9. **Long-term validation (audit #638 N2).** Decide whether the verifier should validate TSA chains at token time (`openssl ts -verify -attime <genTime>`). Today it validates at the current time, so a checkpoint will REFUSE once its TSA signer certificate expires (fail-closed). If token-time validation is chosen, also decide how TSA revocation status is archived.
10. **Release verification environment (audit #638 N5).** Confirm that a release PASS is valid only from `g4-verify-checkpoint.cjs --release` run on a clean checkout of the exact release commit. Certificates and checkpoint files are read from the working tree. **Since #646 the verifier enforces this itself:** `--release` requires the pinned fingerprint, the external head, the repository and the exact commit, a clean checkout, and evidence files byte-equal to their committed blobs. The decision left is only to confirm that nothing but a `mode: release` PASS counts.
