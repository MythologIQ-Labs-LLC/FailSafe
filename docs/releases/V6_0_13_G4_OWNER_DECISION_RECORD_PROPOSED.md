# FailSafe v6.0.13: G4 owner decision record

> **STATUS: PROPOSED, NOT APPROVED.** Nothing in this file is an owner decision. Every "Proposed" entry is a recommendation. No TPM key exists, no TSA is selected, no trust anchor is published and no checkpoint has been created. The owner approves by replacing each "Owner response" line with a dated decision, in a commit of the owner's own or one made on the owner's explicit instruction, and by retitling the file. Until then the verifier reports `BLOCKED TSA_POLICY_UNSELECTED` and v6.0.13 is NO-GO on G4.

**Prepared:** 2026-11-10. **Implementation baseline:** `main` `6a7eced4de4c2bf540430b440379ee3ef29af8a3` (PR #644 merged as `42f61921`, PR #646 as `6a7eced4`). **Audits:** VETO #930, PASS #931, delta ACCEPT #932; release mode VETO #933, PASS #934, delta ACCEPT #935. This record supersedes the list in `V6_0_13_G4_OWNER_DECISIONS.md` only once approved.

## 1. Evidence gathered without enrollment or signing

### TPM (read-only, owner workstation, 2026-11-10T21:01Z)

- `tpmtool getdeviceinformation`: TPM 2.0 present, AMD, firmware 6.32.0.6, initialized, ready for storage and for attestation, no clear needed.
- `certutil -csplist` lists the **Microsoft Platform Crypto Provider**.
- `CngKey.Exists('FailSafe-G4-Ledger-Witness', Platform Crypto Provider)` returns **False**: no G4 key exists.
- Not checked: `Get-Tpm` (needs administrator rights), and whether key creation needs elevation or a TPM owner authorization on this machine. Both are only knowable at enrollment.

### TSA interoperability (2026-11-10T16:34Z, random data only)

Seven public TSAs each returned a granted SHA-256 token for a random digest. `openssl ts -verify` against the Mozilla root bundle passed for DigiCert, Sectigo, GlobalSign, SSL.com, Certum and Entrust (whose token is signed by Sectigo). FreeTSA failed against public roots. No repository content was sent to any TSA.

### DigiCert's permission for this use (documents read 2026-11-10)

A reachable endpoint is not an authorization, so the published terms were read:

- **CP/CPS v7.09, section 1.1:** the document "defines the policies, principles and practices related to DigiCert, Inc's ... certification and time-stamping services" and "applies to all entities participating in or using DigiCert's Publicly Trusted PKI".
- **Section 6.8:** "DigiCert operates a Timestamp Authority that complies with RFC 3161. DigiCert recommends that subscribers use the DigiCert Timestamp Authority to timestamp signed code." It names no other permitted use, and no prohibition.
- **Section 1.6.1:** a Relying Party is "an entity that relies upon either the information contained within a Certificate or a time-stamp token", and must accept the Relying Party Agreement.
- **Knowledge-base article** for `http://timestamp.digicert.com`: describes RFC 3161 timestamping as "protecting data records for the long-term". It states no customer requirement, fee, rate limit or terms.
- **Online Services Acceptable Use Policy (March 2019):** prohibits use that could "damage, disable, overburden, or impair the Service". It does not mention timestamping.
- **Legal repository:** lists no Time-Stamp Policy for the US service.

**Finding:** DigiCert publishes **no explicit permission** for a non-subscriber to timestamp arbitrary data such as a ledger checkpoint, and **no prohibition** of it. The only stated purpose is timestamping signed code by subscribers. G4's use would be one request per release seal, which cannot burden the service. It is common practice, but it rests on DigiCert's tolerance, not on a written grant, and DigiCert could restrict the endpoint at any time. MythologIQ Labs does hold a code-signing relationship through Azure Artifact Signing, which is a Microsoft service, not a DigiCert subscription.

This is an owner risk decision (item 3). The options are in the table.

## 2. Proposed decisions

Items 1 to 5 are indispensable: G4 cannot operate without each. Items 6, 7 and 9 can be deferred with the stated consequence. Item 8 is the release disposition. Item 10 is now enforced in code.

| # | Decision | Proposed | Security consequence | Owner response |
|---|---|---|---|---|
| 1 | TPM key enrollment | Approve `tools/g4/enroll-tpm-key.ps1` as written: key `FailSafe-G4-Ledger-Witness`, ECDSA P-256, Microsoft Platform Crypto Provider, non-exportable, signing only, current user, subject `CN=FailSafe G4 Ledger Witness, O=MythologIQ Labs LLC`, 730 days. The owner runs it personally. | The key is bound to this workstation's TPM. A TPM clear, motherboard replacement or Windows profile loss destroys it, and every later checkpoint is `REFUSED KEY_RESET` until item 6 exists. | _pending_ |
| 2 | Fingerprint publication | Publish the certificate SHA-256 in two places the repository cannot rewrite: the body of the GitHub Release for v6.0.13, and an owner-held offline record (section 3). | Without a pinned fingerprint, anyone who can commit a certificate can start a chain. A fingerprint kept only in the repository is not a pin. | _pending_ |
| 3 | TSA selection | One of: **(a)** DigiCert `http://timestamp.digicert.com`, accepting that the use is tolerated and not expressly granted (proposed, with (b) as follow-up); **(b)** the same, after written confirmation from DigiCert that non-subscriber RFC 3161 timestamping of arbitrary digests is permitted; **(c)** a TSA whose terms expressly allow it, chosen and qualified by the owner. One root only in `tsa-policy.json`. | The TSA is the independent witness. If it withdraws the service, new checkpoints are `BLOCKED TSA_OFFLINE` and releases stop until the owner selects another TSA; existing checkpoints stay verifiable. Each extra root widens who can witness. | _pending_ |
| 4 | Checkpoint-head retention | Retain every head `g4-NNNNNN:<manifest sha256>` in the same two places as the fingerprint, at the moment the checkpoint is created (section 3). | Without an external head, deleting the newest checkpoints together with the ledger tail, or replacing the whole chain, is undetectable. | _pending_ |
| 5 | Cadence and genesis | One checkpoint at every `/qor-substantiate` release seal and every RC promotion. The genesis checkpoint is created at the v6.0.13 seal, over a ledger that contains `Entry #914: EPOCH`. | A release without a checkpoint has no witness for its seal. | _pending_ |
| 6 | Key transition and recovery | Defer the transition-record format to v6.0.14. | Until it exists, key loss means a new genesis under a new key, with the old chain kept but not linked. That needs a new recorded and reviewed owner decision. | _pending_ |
| 7 | Revocation-notice timestamps | Defer. | The registry stays hash-bound, versioned and append-only, but the time of a revocation rests on Git history, not on a token. | _pending_ |
| 8 | v6.0.13 release disposition | Ship v6.0.13 only with G4 qualified: items 1 to 5 approved, key enrolled, genesis created, `--release` verification PASS. | The v6.0.12 deferral (#920) ends at v6.0.13 publication. Shipping without G4 needs a new decision, recorded and independently reviewed. | _pending_ |
| 9 | Token-time validation (`-attime`) | Defer. | The verifier checks TSA chains at the current time, so a checkpoint is `REFUSED` once its TSA signer certificate expires (DigiCert renews them at least every 15 months). That fails closed, but old checkpoints then need item 9 to verify. | _pending_ |
| 10 | Release verification environment | Confirm. A release PASS is valid only from `g4-verify-checkpoint.cjs --release` printing `mode: release`. | Enforced in code since #646: all four trust inputs, HEAD equal to `--commit`, a clean checkout, evidence files byte-equal to their committed blobs, no overrides. A diagnostic PASS also exits 0, so the mode line must be checked. | _pending_ |

## 3. External retention of the fingerprint and the checkpoint head

**Values retained:** the owner fingerprint (64 hex, once) and each checkpoint head `g4-NNNNNN:<64 hex>` (at every checkpoint).

**Where:**
1. **GitHub Release body** of the release the checkpoint belongs to, in a section "G4 witness". The repository's Git history cannot rewrite it, and GitHub timestamps the release.
2. **Owner offline record:** a paper or offline-device note the owner writes by hand at creation time, with the date.

**How the owner retrieves and verifies each value independently:**
- Read the values from the offline record, not from the repository and not from this tool's output.
- Compare them with the GitHub Release body in a browser. A mismatch between the two stops the release.
- Recompute from the checkout: `certutil -hashfile tools\g4\keys\<fp>.cer SHA256` must equal the fingerprint, and `certutil -hashfile tools\g4\checkpoints\g4-NNNNNN\manifest.json SHA256` must equal the head digest.
- Pass the offline values to `--trust-fingerprint` and `--trusted-head`. The verifier refuses (`KEY_UNTRUSTED`, `HEAD_MISMATCH`) if the repository disagrees.

**Limit:** both places are controlled by the owner. They protect against repository rewrites and against anyone but the owner. A third-party transparency log would be needed for more, and is not proposed for v6.0.13.

## 4. Prepared commands (NOT EXECUTED)

Each step runs on the owner workstation, in a clean checkout of `main`. Nothing below has been run.

### Step A: enrollment (needs items 1 and 2)

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\g4\enroll-tpm-key.ps1 `
  -OwnerApprovalRef "<commit or ledger entry of the approved decision record>" `
  -ConfirmPersistentTpmKey -ValidDays 730
```

- **Expected artifacts:** a TPM key `FailSafe-G4-Ledger-Witness`; one file `tools/g4/keys/<fingerprint>.cer`; the fingerprint printed.
- **Then:** write the fingerprint in the offline record; commit only the `.cer` through a PR.
- **Failure conditions:** the script refuses without both flags; refuses if the key name already exists; fails if the TPM or provider denies creation (elevation or TPM authorization).
- **Recovery:** a failed creation leaves no key (confirm with `CngKey.Exists`). A key created with wrong parameters is deleted by the owner (`certutil -csp "Microsoft Platform Crypto Provider" -delkey FailSafe-G4-Ledger-Witness`) before anything is committed. After a certificate is committed, the key is never recreated silently: that is a key change under item 6.

### Step B: TSA policy (needs item 3)

Commit the selected root PEM as `tools/g4/tsa-roots/<name>.pem` and set `tools/g4/tsa-policy.json` to `"status": "selected"` with that root's DER SHA-256, through a PR. For DigiCert the root is **DigiCert Trusted Root G4**, DER SHA-256 `552f7bdcf1a7af9e6ce672017f4f12abf77240c78e761ac203d1d9d20ac89988` (to be re-derived from an independently obtained copy before committing).

- **Failure conditions:** a root whose hash differs from the policy is `REFUSED TSA_ROOT_MISMATCH`.

### Step C: genesis checkpoint (needs items 1 to 5, and the v6.0.13 seal commit `<S>`)

```bash
node FailSafe/extension/scripts/g4-create-checkpoint.cjs \
  --cert tools/g4/keys/<fingerprint>.cer --tsa-url <selected TSA URL> --commit <S>
```

- **Expected artifacts:** `tools/g4/checkpoints/g4-000001/` with `manifest.json`, `manifest.sig`, the timestamp query and token, and the TSA chain. Nothing is committed by the tool.
- **Then:** write `g4-000001:<sha256 of manifest.json>` in the offline record; commit the directory in a follow-up commit `<S+1>` through the release PR.
- **Failure conditions:** `BLOCKED TSA_OFFLINE` or `TSA_REJECTED` (no directory is written); a signing failure from `sign-checkpoint.ps1` (no signature is written unless it self-verifies); `GENESIS_EPOCH_MISSING` if the ledger lacks entry #914.
- **Recovery:** delete an uncommitted, incomplete `g4-000001/` and rerun. Never edit a manifest. Once committed, a checkpoint is never replaced; a mistake is corrected by the next checkpoint or by a recorded decision.

### Step D: release verification (fresh clone at `<S+1>`)

```bash
node FailSafe/extension/scripts/g4-verify-checkpoint.cjs --release \
  --repository MythologIQ-Labs-LLC/FailSafe --commit <S+1> \
  --trust-fingerprint <from the offline record> --trusted-head g4-000001:<from the offline record>
```

- **Expected:** `[g4-verify] mode: release` and `PASS OK`, exit 0, no limitation. Anything else is NO-GO.

## 5. Open dependency found while preparing this record

`docs/releases/RELEASE_INTEGRATION_PATH.md` (audit PASS #929) lets commits after the seal touch "governance paths only". `tools/g4/checkpoints/**` is not on that list, yet a checkpoint must be committed after the seal commit it attests. The release path therefore needs one amendment, adding `tools/g4/checkpoints/**` to the governance paths, through its own audited change before the v6.0.13 seal. Keys and the TSA policy are committed before the seal and need no exception.

## 6. Not covered here

Statewright (#603) and the v6.0.13 scope decision are separate. This record does not change the release objective.
