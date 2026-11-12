# FailSafe v6.0.13: G4 owner decision record

> **STATUS: PROPOSED, NOT APPROVED.** Nothing in this file is an owner decision. Every "Proposed" entry is a recommendation. No TPM key exists, no TSA is selected, no trust anchor is published and no checkpoint has been created. The owner approves by replacing each "Owner response" line with a dated decision, in a commit of the owner's own or one made on the owner's explicit instruction, and by retitling the file. Until then the verifier reports `BLOCKED TSA_POLICY_UNSELECTED` and v6.0.13 is NO-GO on G4.

**Prepared:** 2026-11-10. **Implementation baseline:** `main` `6a7eced4de4c2bf540430b440379ee3ef29af8a3` (PR #644 merged as `42f61921`, PR #646 as `6a7eced4`). **Audits:** VETO #930, PASS #931, delta ACCEPT #932; release mode VETO #933, PASS #934, delta ACCEPT #935. This record supersedes the list in `V6_0_13_G4_OWNER_DECISIONS.md` only once approved.

## Current integration checkpoint (2026-11-11)

**Read-only status reconciliation, NOT an owner decision.** All ten proposed owner responses below remain pending.

- Verified integration baseline: `main` `54724e0180c0dcf33bf3a34f46a6b4b9a3dc475c`. Statewright website-handoff PR #653 is merged (independent PASS #946). G4 evidence-layout hardening PR #654 is merged (VETO #947, PASS #948, delta ACCEPT #949; 13/13 CI and an exact-tree normal merge).
- Post-seal five-file checkpoint exception PR #650 is merged into `docs/releases/RELEASE_INTEGRATION_PATH.md`. Operator checks are not the same as CI-enforced checks. Any governance allow-list required on the actual release branch must be confirmed before the seal; do not assume it is resolved by documentation alone.
- `tools/g4/tsa-policy.json` still says `"status": "pending-owner-decision"` and `"trustedRoots": []`. No owner-authorized TPM key enrollment, published/offline trust fingerprint, independent retained checkpoint head, selected production TSA root, genesis or operational `--release` PASS has been established by these merges.
- **Mandatory before a G4-qualified v6.0.13 seal:** owner decisions 1–5 and 8. Decisions 6, 7 and 9 can be explicitly deferred with their consequences; item 10 confirms the already-enforced fail-closed release verification environment. The owner has selected **neither** FreeTSA nor a contractual/publicly trusted TSA.
- Separate PR #656 remains independently VETOED on false-acceptance gaps in its timing-test oracle; historical green CI is not authorization. Its native ledger record belongs *after* #949 (subject to rechecking live tail) before a later revised PASS can be recorded.
- Prepared commands in section 4 remain **UNEXECUTED** and must be verified against the eventual exact release candidate. No action below may be performed merely because this document exists.

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

This is an owner risk decision (item 3). Tolerated use without a written grant is **not** a proposed production choice; see the comparison below and the table.

### TSA candidates compared (probes and documents, 2026-11-10T23:51Z to 2026-11-11T00:15Z)

Each candidate was probed with a random digest and its published terms were read. No repository content was sent. This is evidence for item 3, not a selection.

| | FreeTSA `https://freetsa.org/tsr` | DigiCert `http://timestamp.digicert.com` | Sectigo | GlobalSign | Microsoft Artifact Signing TSA |
|---|---|---|---|---|---|
| Published terms for this use | **Expressly permitted** | Silent | Restricted to its code-signing customers | Free endpoint silent; paid service by contract | Scoped to countersigning code signatures |
| One dedicated root can be pinned | Yes | Yes | No (needs the general USERTrust root) | Yes (Timestamping Root R45) | Yes |
| Root DER SHA-256 | `a6379e7cecc05faa3cbf076013d745e327bbbaa38c0b9af22469d4701d18aabc` | `552f7bdcf1a7af9e6ce672017f4f12abf77240c78e761ac203d1d9d20ac89988` | n/a | `2bcbbfd66282c680491c8cd7735fdbbab7a8079b127bec60c535976834399af7` | `5367f20c7ade0e2bca790915056d086b720c33c1fa2a2661acf787e3292e1270` |
| Root audited and in public trust stores | **No** (self-signed, one operator) | Yes | Yes | R45 not in the stores checked | Windows store |
| Signer certificate expires | 2040-02-02 | 2037-11-04 | 2037-06-24 | 2037-01-10 | **2027-09-14** |
| Revocation data published | CRL (yearly) and OCSP | CRL and OCSP | CRL and OCSP | CRL and OCSP | CRL |
| Availability commitment | Expressly none | None found | None found | "aims to provide 99%" | None found |

**FreeTSA terms** (`https://freetsa.org/freetsa.html`, unversioned, `Last-Modified` 2026-11-08, copy retained with SHA-256 `7890c11764bfd43b10ffca2d1fc0ecc06389cb64b49476c15fc8e4791838e942`):
- "Timestamps issued by FreeTSA may be used for commercial purposes. Projects and applications may incorporate FreeTSA timestamps without requiring a separate commercial licence from the service operator."
- "a maximum of one timestamping request per second per IP address is permitted."
- "FreeTSA is provided on a best-effort basis, without any guarantee of availability, uptime, response times, or restoration times. No Service Level Agreement (SLA) is offered".
- It is "an independent project operated on a non-profit basis. It is not a company, partnership, or foundation". No operator name, governing law, liability term, audit or key-storage statement is published. Certificate notices are "published exclusively on the FreeTSA website".

**FreeTSA limits found:**
- The root is a private, self-signed RSA 4096 certificate (2016 to 2041) held by one unnamed individual. Nobody independent audits it or can revoke it.
- The signer was replaced in March 2026. Tokens from the previous signer no longer pass a current-time check, so item 9 applies here too (next expiry 2040-02-02).
- The token's signing-certificate attribute uses SHA-1 (ESSCertID v1) and its policy OID is the OpenSSL sample value `1.2.3.4.1`. The message imprint and signature are SHA-256 and ECDSA P-384 with SHA-512.
- The site prints the hash of the PEM file. The pin is the DER hash above.

**Other candidates:**
- **Sectigo:** CPS 1.0.9 section 6.8: "The Sectigo TSAs are intended only for use in signing software when used in conjunction with a Sectigo Code-signing Certificate."
- **Microsoft:** CPS 1.0.6 section 6.8 makes the TSA "available for use by customers of its Codes Signing Certificates", and Microsoft documents it for countersigning signatures made with the service. MythologIQ Labs is such a customer, but timestamping a standalone digest is not addressed, and the signer certificate lasts about one year, which the current-time verifier cannot carry.
- **GlobalSign:** the Timestamping Practice Statement v1.1 defines a subscriber as an entity "contracted with GlobalSign". The paid Timestamping-as-a-Service has no public price.

**Verifier compatibility (unmodified code on `main`, throwaway repositories, ephemeral test keys):** with a real FreeTSA token and only the FreeTSA root pinned, release mode returned `PASS OK`, `mode: release`, no limitation; the same evidence under a different pinned root was `REFUSED TOKEN_INVALID`. With a real DigiCert token and only DigiCert Trusted Root G4 pinned, release mode returned `PASS OK`. Neither candidate needs a verifier change or a change to trust semantics.

## 2. Proposed decisions

**Mandatory before a v6.0.13 seal:** items 1 to 5 (G4 cannot operate without each) and item 8 (the release disposition). Items 1 to 3 must be merged to `main` before the seal; items 4 and 5 are carried out at the seal. **Optional deferrals:** items 6, 7 and 9, each with the stated consequence. Item 10 is a confirmation of behaviour already enforced in code. This is a solo-owner record: each response is the owner's decision, written by the owner.

| # | Decision | Proposed | Security consequence | Owner response |
|---|---|---|---|---|
| 1 | TPM key enrollment | Approve `tools/g4/enroll-tpm-key.ps1` as written: key `FailSafe-G4-Ledger-Witness`, ECDSA P-256, Microsoft Platform Crypto Provider, non-exportable, signing only, current user, subject `CN=FailSafe G4 Ledger Witness, O=MythologIQ Labs LLC`, 730 days. The owner runs it personally. | The key is bound to this workstation's TPM. A TPM clear, motherboard replacement or Windows profile loss destroys it, and every later checkpoint is `REFUSED KEY_RESET` until item 6 exists. | _pending_ |
| 2 | Fingerprint publication | Record the certificate SHA-256 first in the owner-held offline record, at enrollment. Publish it later in the body of the GitHub Release for v6.0.13 (section 3). | Without a pinned fingerprint, anyone who can commit a certificate can start a chain. A fingerprint kept only in the repository is not a pin. | _pending_ |
| 3 | TSA selection | **Mandatory; pick one.** **(a) DigiCert** `http://timestamp.digicert.com`, once DigiCert confirms in writing that low-volume RFC 3161 timestamping of non-code digests by a non-subscriber is permitted, with the confirmation retained by the owner. Preferred when the confirmation exists: audited, publicly trusted root. **(b) FreeTSA** `https://freetsa.org/tsr`: its published terms already permit commercial use, so it needs no further permission and can be used now. **Not proposed:** (c) DigiCert on tolerance alone; Sectigo; the Microsoft TSA. One root only in `tsa-policy.json`. | The TSA is the independent witness. **(a)** depends on a reply that may not arrive before the seal. **(b)** rests on one unaudited, self-signed root run by one unnamed individual, with no SLA, no liability terms and website-only notices: if that key or operator fails, every checkpoint must be re-witnessed under another TSA through a new reviewed decision, and an outage at seal time blocks the release (`BLOCKED TSA_OFFLINE`). Choosing (b) is an explicit owner acceptance of those risks. Under (c) the witness would rest on unlicensed use. Changing TSA later is a policy change through a reviewed PR; existing checkpoints stay verifiable only while their root stays pinned, so a switch needs its own design. | _pending_ |
| 4 | Checkpoint-head retention | Write every head `g4-NNNNNN:<manifest sha256>` in the owner-held offline record at the moment the checkpoint is created, before it is committed or published anywhere. The GitHub Release body repeats it later (section 3). | Without an external head, deleting the newest checkpoints together with the ledger tail, or replacing the whole chain, is undetectable. A head first written into a GitHub Release is too late: release verification on H and M needs it before any release exists. | _pending_ |
| 5 | Cadence and genesis | One checkpoint at every `/qor-substantiate` release seal and every RC promotion. The genesis checkpoint is created at the v6.0.13 seal, over a ledger that contains `Entry #914: EPOCH`. | A release without a checkpoint has no witness for its seal. | _pending_ |
| 6 | Key transition and recovery | Defer the transition-record format to v6.0.14. | **Durability cost of deferring:** the key lives in one TPM. A TPM clear, firmware reset, motherboard or CPU replacement, or loss of the Windows profile destroys it with no backup, because it is non-exportable. From then on no checkpoint can be created, every release is blocked on G4, and the verifier refuses any new key (`KEY_RESET`). Recovery needs a new genesis under a new key, which breaks chain continuity and needs a new recorded and independently reviewed owner decision. Deferring is acceptable only while the owner accepts that a hardware failure stops releases until that decision is made. | _pending_ |
| 7 | Revocation-notice timestamps | Defer. | The registry stays hash-bound, versioned and append-only, but the time of a revocation rests on Git history, not on a token. | _pending_ |
| 8 | v6.0.13 release disposition | Ship v6.0.13 only with G4 qualified: items 1 to 5 approved, key enrolled, genesis created, `--release` verification PASS. | The v6.0.12 deferral (#920) ends at v6.0.13 publication. Shipping without G4 needs a new decision, recorded and independently reviewed. | _pending_ |
| 9 | Token-time validation (`-attime`) | Defer. | **Durability cost of deferring:** the verifier validates each TSA chain at the current time. DigiCert replaces its TSA signer certificates at least every 15 months, so each checkpoint stops verifying (`REFUSED TOKEN_INVALID`) once its token's signer certificate expires. That fails closed, but it means the witness for a release has a shelf life of roughly one to several years, after which the release-mode chain check refuses from that checkpoint on, including for new releases, until token-time validation with archived revocation data is designed, audited and merged. Deferring is acceptable for v6.0.13; the work must land before the first signer certificate in the chain expires. | _pending_ |
| 10 | Release verification environment | Confirm. A release PASS is valid only from `g4-verify-checkpoint.cjs --release` printing `mode: release`. | Enforced in code since #646: all four trust inputs, HEAD equal to `--commit`, a clean checkout, evidence files byte-equal to their committed blobs, no overrides. A diagnostic PASS also exits 0, so the mode line must be checked. | _pending_ |

## 3. External retention of the fingerprint and the checkpoint head

**Values retained:** the owner fingerprint (64 hex, once) and each checkpoint head `g4-NNNNNN:<64 hex>` (at every checkpoint).

**Order (it matters):**
1. **Owner offline record, first.** A paper or offline-device note the owner writes by hand, with the date, at the moment the value comes into existence: the fingerprint at enrollment, each head when its checkpoint is created and before it is committed. This is the pin used for release verification on H and on M.
2. **GitHub Release body, later.** When the release is published, its body repeats the fingerprint and the head in a section "G4 witness". This is a publication of the already retained pin. It cannot be the pin for its own release, because it does not exist until after the tag.

**How the owner retrieves and verifies each value independently:**
- Read the values from the offline record, not from the repository and not from this tool's output.
- Recompute from the checkout: `certutil -hashfile tools\g4\keys\<fp>.cer SHA256` must equal the fingerprint, and `certutil -hashfile tools\g4\checkpoints\g4-NNNNNN\manifest.json SHA256` must equal the head digest.
- Pass the offline values to `--trust-fingerprint` and `--trusted-head`. The verifier refuses (`KEY_UNTRUSTED`, `HEAD_MISMATCH`) if the repository disagrees.
- For an earlier release, also compare the offline record with that release's GitHub Release body in a browser. A mismatch stops the release.

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
- **Then:** write the fingerprint in the offline record first; then commit only the `.cer` through a PR. Keys are pre-seal inputs: the certificate must be on `main` before the v6.0.13 seal.
- **Failure conditions:** the script refuses without both flags; refuses if the key name already exists; fails if the TPM or provider denies creation (elevation or TPM authorization).
- **Recovery:** a failed creation leaves no key (confirm with `CngKey.Exists`). A key created with wrong parameters is deleted by the owner (`certutil -csp "Microsoft Platform Crypto Provider" -delkey FailSafe-G4-Ledger-Witness`) before anything is committed. After a certificate is committed, the key is never recreated silently: that is a key change under item 6.

### Step B: TSA policy (needs item 3)

Commit the selected root PEM as `tools/g4/tsa-roots/<name>.pem` and set `tools/g4/tsa-policy.json` to `"status": "selected"` with that root's DER SHA-256, through a PR, before the seal (TSA roots and policy are pre-seal inputs). For DigiCert the root is **DigiCert Trusted Root G4**, DER SHA-256 `552f7bdcf1a7af9e6ce672017f4f12abf77240c78e761ac203d1d9d20ac89988`. For FreeTSA it is `https://freetsa.org/files/cacert.pem`, DER SHA-256 `a6379e7cecc05faa3cbf076013d745e327bbbaa38c0b9af22469d4701d18aabc`. Either value is re-derived by the owner from an independently obtained copy before committing (`openssl x509 -in <root.pem> -outform DER | openssl dgst -sha256`).

- **Failure conditions:** a root whose hash differs from the policy is `REFUSED TSA_ROOT_MISMATCH`.

### Step C: genesis checkpoint (needs items 1 to 5, and the v6.0.13 seal-record commit `<R>`)

```bash
node FailSafe/extension/scripts/g4-create-checkpoint.cjs \
  --cert tools/g4/keys/<fingerprint>.cer --tsa-url <selected TSA URL> --commit <R>
```

`<R>` is the seal-record commit of `RELEASE_INTEGRATION_PATH.md`: the first commit after the sealed commit S whose `docs/META_LEDGER.md` contains the v6.0.13 `SESSION SEAL` entry. The checkpoint must attest R, not S: release verification requires the `ok g4-000001 commit <R>` line.

- **Expected artifacts:** `tools/g4/checkpoints/g4-000001/` with `manifest.json`, `manifest.sig`, the timestamp query and token, and the TSA chain. Nothing is committed by the tool.
- **Then:** write `g4-000001:<sha256 of manifest.json>` in the offline record before committing; commit exactly the five files in one commit K after R on the release PR, under the post-seal exception (section 5).
- **Failure conditions:** `BLOCKED TSA_OFFLINE` or `TSA_REJECTED` (no directory is written); a signing failure from `sign-checkpoint.ps1` (no signature is written unless it self-verifies); `GENESIS_EPOCH_MISSING` if the ledger lacks entry #914.
- **Recovery:** delete an uncommitted, incomplete `g4-000001/` and rerun. Never edit a manifest. Once committed, a checkpoint is never replaced; a mistake is corrected by the next checkpoint or by a recorded decision.

### Step D: release verification on H, then on M

Before merging, on a fresh clone at the final PR head `<H>`:

```bash
node FailSafe/extension/scripts/g4-verify-checkpoint.cjs --release \
  --repository MythologIQ-Labs-LLC/FailSafe --commit <H> \
  --trust-fingerprint <from the offline record> --trusted-head g4-000001:<from the offline record>
```

After the normal merge, repeat on a fresh clone at the merge commit `<M>` with `--commit <M>`, before any tag.

- **Expected, both times:** `[g4-verify] mode: release`, an `ok g4-000001 commit <first 12 hex of R>` line, and `PASS OK` with no limitation line, exit 0. Anything else is NO-GO. The exit code alone is not evidence, and a diagnostic PASS never counts.
- **Before Step D:** run checks 1 to 6 of the post-seal exception (ancestry, per-commit paths, the five `A` lines, tree modes, the attested commit, product bytes) in Git Bash or PowerShell, not `cmd.exe`.

## 5. Dependency: the post-seal checkpoint exception (merged)

PR #650 is merged (`main` `9f16548d83116e2d8ee7f9010545963c06e5c93a`; independent audit VETO #936, then PASS #937). `docs/releases/RELEASE_INTEGRATION_PATH.md` now permits exactly one new `tools/g4/checkpoints/g4-NNNNNN/` directory with five added files after the seal, in one commit, attesting the seal-record commit R, with checks 1 to 7 before merging and `--release` verification on H and again on M. Keys, TSA roots, policy and the revocation registry stay pre-seal inputs.

Steps C and D above follow that text. If they ever differ, `RELEASE_INTEGRATION_PATH.md` governs.

## 6. Not covered here

Statewright (#603) and the v6.0.13 scope decision are separate. This record does not change the release objective.
