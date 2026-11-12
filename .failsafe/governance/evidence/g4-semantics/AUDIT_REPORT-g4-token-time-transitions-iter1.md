# Audit report: G4 token-time validation, notices and key transitions (#638), iteration 1

- **Procedure:** native `/qor-audit` (Gate Tribunal), independent adversarial auditor. The auditor did not write the change.
- **Target:** branch `feat/638-g4-token-time-transitions`, commit `59c4291e4b9e8ac374179ce252ad578f06debf71` (draft PR #658), stacked on `origin/feat/638-g4-freetsa-root` (`2c7a58af`, PR #657) via merge `10af347d`.
- **Plan:** `.failsafe/governance/plans/plan-v6013-638-g4-token-time-transitions.md` (iteration 1). Risk grade L3.
- **Reviewed diff:** `git diff origin/feat/638-g4-freetsa-root 59c4291e` (75 files) and `git diff 29b819fe 59c4291e`.
- **Date:** 2026-11-12.

## VERDICT: VETO

Four blocking violations (V1 to V4). V1 is an L3 trust bypass: a file committed under `tools/g4/tsa-crls/` can add an unpinned TSA root, and a release-mode verification then PASSes with no limitation for a checkpoint stamped by an attacker-controlled TSA. This loosens the trust that #657 established.

Ledger and shadow-genome steps of the skill were not performed: the caller's constraints make the repository read-only except for this report.

## Checks

### C1. Each owner item behaves as stated and fails closed

| Area | Command / method | Result |
|---|---|---|
| Item 9, CRL file content | scratch `inj.cjs`: commit `tools/g4/tsa-crls/z.crl` = a PEM CRL followed by a self-signed root certificate of an unrelated CA (distinct subject name) and that CA's CRL; then checkpoint g4-000003 stamped by that CA's TSA | **PASS OK** in diagnostic mode, and **PASS OK, mode release, limitations []** with `--trust-fingerprint`, `--trusted-head`, `--repository`, `--commit`. Also PASS when the certificate is appended to the genuine CRL file. **V1.** |
| Item 9, several CRLs current at once | scratch `crl1.cjs`, `crl2.cjs` with the test PKI | Among CRLs current at the token time OpenSSL uses the newest: a newer revoking CRL with `lastUpdate` before the token refuses it (`TSA_SIGNER_REVOKED`, also the suite test). **But** a CRL issued after the token time is never consulted: signer revoked at 16:12:02, token at about 16:12:04, revoking CRL `lastUpdate` 16:12:08 committed next to the older CRL: **PASS OK**. **V3.** |
| Item 9, CRL removal | `crl2.cjs` case 3 | Revoking CRL present: `REFUSED TSA_SIGNER_REVOKED`. Same repository after `git rm` of that CRL at HEAD: **PASS OK**. Nothing enforces that archived CRLs stay committed. **V4.** |
| Item 9, CRL signature failure | `crl2.cjs` case 1 (one signature byte flipped) | `REFUSED TOKEN_INVALID` ("CRL signature failure"). Fails closed. |
| Item 9, bogus same-name CRL next to the genuine one | `crl2.cjs` case 2 | `REFUSED TOKEN_INVALID`. Fail closed (denial of service only). |
| Item 9, missing / expired / not-yet-valid CRL, malformed or stray file | suite `g4TokenTime.test.cjs` | BLOCKED `TSA_REVOCATION_EVIDENCE_MISSING`, REFUSED `TSA_CRL_MALFORMED` as stated. |
| Audit #956 N1, root file with two certificates | suite | `REFUSED TSA_ROOT_MALFORMED`. Correct for root files, but the same rule is not applied to CRL files (V1). |
| Item 7, notices | read `notices.cjs`; suite | Unstamped, postdated, reused token, out-of-order tokens are refused. Version 1 with a notice refused. Backdating is allowed by design (see N1). |
| Item 6, genesis pin | read `verify-witness.cjs` `checkKey`; suite | Pin applies only to the first checkpoint. A later key is reachable only through `acceptKeyChange`; no record means `KEY_RESET`. No escape found other than V2. |
| Item 6, rotation by an expired key | scratch `rot1.cjs`: key A valid for 20 s, two checkpoints by A, wait until A expired, rotation record A to B signed by A, checkpoint 3 by B | **PASS OK, limitations []** with A pinned and the trusted head given. A key that may no longer sign a checkpoint (`KEY_WINDOW`) can still hand authority to a new key, reported as verified continuity. **V2.** |
| Item 6, recovery | read `transition.cjs`; suite | Needs revocation with `effectiveUtc` at or before the record token time (`KEY_RECOVERY_UNREVOKED`), the exact `--accept-recovery g4-NNNNNN:<sha256 of record>` (`KEY_RECOVERY_UNACKNOWLEDGED`), and the limitation is added to every PASS including release mode. As stated. See N1, N2. |
| Item 6, binding | read `checkBinding`, `acceptKeyChange` | Repository, new fingerprint, previous checkpoint id, old fingerprint (file name plus field), and token time between the two checkpoints are enforced. Previous checkpoint is bound by id only (N2). |
| `git cat-file blob` | scratch `links.cjs`; suite long-path test | Missing path: null. Tree: null. Gitlink in `tsa-crls`: `REFUSED TSA_CRL_MALFORMED`. Symlink entry: read as its blob bytes (the link text), never followed; harmless. |

### C2. Weakening versus main for a repository with no transitions or notices

- `git diff 29b819fe 59c4291e -- FailSafe/extension/src/test/scripts/`: `g4FalsifyLedger` and `g4FalsifyTokens` unchanged. In `g4FalsifyKeys`, the two revocation tests now stamp their registry version, and the "after" case uses a notice effective at stamp time instead of one day later (needed by the postdating rule; stricter, not weaker). `g4Witness` adds tests.
- All existing falsification tests still pass (C4).
- A later-checkpoint pin mismatch now yields `KEY_RESET` instead of `KEY_UNTRUSTED`; still refused.
- Weakening found: the TSA trust set is now the pinned roots **plus anything inside a committed `.crl` file** (V1). Main and #657 trusted the pinned roots only.

### C3. FreeTSA CRL file

- `openssl crl -in tools/g4/tsa-crls/freetsa-root-ca-2026-09-18.crl -CAfile tools/g4/tsa-roots/freetsa-root-ca.pem -noout -text`: `verify OK`; issuer FreeTSA Root CA; Last Update 2026-09-18 10:30:55 GMT; Next Update 2027-09-18 10:30:55 GMT; CRL Number 4096 (0x1000); No Revoked Certificates.
- One GET of `http://www.freetsa.org/crl/root_ca.crl` into a scratch directory. Live and committed CRL, both converted to DER: SHA-256 `d4dce5c662d25ee933d185ccd9528a284797358abb440efb142e83d3692ea8b8` for both. Identical. The live CRL verifies against the pinned root.
- Live evidence: the three `sem2/rotated` checkpoint tokens verify with `openssl ts -verify -queryfile ... -CAfile <pinned root + committed CRL> -attime <genTime> -crl_check`: `Verification: OK` for all three (16:05:30, 16:05:34, 16:05:41 GMT). `qualify-semantics.cjs` was not re-run (no further network use).

### C4. Test runs (from `FailSafe/extension`)

- `node --test src/test/scripts/g4*.test.cjs`: 138 tests, 138 pass, 0 fail, 0 skipped.
- `node --test src/test/docs/*.test.cjs`: 145 tests, 145 pass, 0 fail.
- Full `npm run test:node` not run (optional).
- The suites pass while V1 to V4 exist: there is no test for a certificate inside a CRL file, for a rotation signed outside the old key's window, for a revoking CRL issued after the token, or for CRL removal.

### C5. Section 4 razor and overstatement

| Check | Limit | Found | Status |
|---|---|---|---|
| Max function lines | 40 | no function over 40 in new or changed files (scripted brace scan) | OK |
| Max file lines | 250 | largest changed file 182 (`g4KeyTransition.test.cjs`), largest library file 137 (`verify.cjs`) | OK |
| Max nesting depth | 3 | 3 | OK |
| Nested ternaries | 0 | 0 | OK |

Security pass: no placeholder auth, hardcoded secrets or mock returns found. Ghost UI: not applicable. Dependencies: none added. Macro architecture: modules are separated (trust, notices, transitions, records); no cycle found; no orphan (`records.cjs` is reached from `g4-record.cjs`, the others from `verify.cjs`).

Overstatement (part of V3 and V4):
- `G4_WITNESS_OPERATIONS.md`: "a token made after its signer was revoked is refused". False when the revoking CRL was issued after the token (V3).
- `G4_WITNESS_OPERATIONS.md` and plan "Limits": "If a TSA key were compromised and the compromise never published, its holder could backdate tokens". A **published** compromise does not stop backdated tokens either, for any genTime covered by an older CRL (V3). With the yearly FreeTSA CRL the exposure window can be months.
- `G4_WITNESS_OPERATIONS.md`: "Older CRLs are never removed." Procedure only; the verifier does not enforce it (V4).
- Plan, item 9 row: "The trust file is the pinned roots plus every committed CRL". In fact it is the pinned roots plus the raw bytes of every `.crl` file, certificates included (V1).

### C6. Ledger

- `git diff origin/feat/638-g4-freetsa-root 59c4291e -- docs/META_LEDGER.md`: empty. OK.

## Violations

### V1 (BLOCKING, L3): an unpinned TSA root can be added through a CRL file

`tsa-trust.cjs` `crlPems` checks only that a file name ends `.crl`, that the bytes begin with `-----BEGIN X509 CRL-----`, and that `openssl crl -in <file> -noout` succeeds (it reads the first CRL and ignores the rest). It then appends the **raw file bytes** to the single `-CAfile` that `openssl ts -verify` trusts. Any `-----BEGIN CERTIFICATE-----` block after the first CRL becomes a trust anchor. Reproduced: release-mode `PASS OK`, no limitation, for a checkpoint stamped by an unrelated CA's TSA. This defeats the root pin of #657 and the N1 fix.

Required remediation:
- A CRL file must hold exactly one PEM CRL and nothing else (the same rule as root files), checked on the bytes.
- Build the trust file from the pinned root certificates plus canonical CRL output only (for example `openssl crl -in <file> -outform PEM`), never from raw committed bytes.
- Verify each CRL against the pinned roots alone when it is loaded (`openssl crl -CAfile <roots only> -noout`), and refuse a CRL whose issuer is not a pinned root.
- Add falsification tests: a certificate after a CRL in the same file; a CRL from an unpinned CA with its root alongside; both in release mode.

### V2 (BLOCKING): a rotation is accepted from a key outside its certificate window

`transition.cjs` checks the rotation record's signature against the old key's certificate, but does not check that the record's token time lies within that certificate's validity. Reproduced: an expired key A signed a rotation to B after A's `validTo`, and the chain PASSed with no limitation, as verified continuity. A key that `KEY_WINDOW` would stop from signing a checkpoint can still hand over the chain.

Required remediation: refuse a rotation whose record token time lies outside the old key's certificate window (and a recovery outside the new key's window), with a falsification test for each.

### V3 (BLOCKING): archived revocation evidence issued after the token time is ignored

With `-attime <genTime> -crl_check`, OpenSSL takes only a CRL current at genTime. A committed CRL from the pinned root that lists the TSA signer with a revocation date before genTime, but issued after genTime, is never consulted. Reproduced: PASS. This is the main case where revocation of a TSA key matters (a compromise found later, with forged tokens dated before the new CRL). It contradicts the docs' "a token made after its signer was revoked is refused", and the stated limit (undisclosed compromise only) understates it.

Required remediation: refuse a token when any committed CRL that verifies against a pinned root lists the signer with a revocation date at or before the token's genTime, whatever that CRL's `lastUpdate`. Decide and document whether a `keyCompromise` revocation invalidates all of that signer's tokens (RFC 3161 section 4). Add a falsification test. Otherwise narrow every claim in the plan, operations doc and README to "revoked in a CRL current at the token time", and disclose the gap as an owner-accepted limit.

### V4 (BLOCKING): archived CRLs are not append-only

CRLs are read only at HEAD. Deleting a revoking CRL in a later commit brings back a PASS for tokens it refused (reproduced). Checkpoints do not bind the CRL set, and nothing checks the Git history of `tools/g4/tsa-crls/`. The registry has exactly this protection (`assertGitHistoryMonotonic`), and the docs say "Older CRLs are never removed".

Required remediation: refuse when any CRL committed in the history of `tools/g4/tsa-crls/` is missing or changed at HEAD (the same approach as the registry, with the same disclosed limits of history simplification), or bind a digest of the CRL set into each checkpoint manifest. Add a falsification test.

## Notes (non-blocking)

- **N1.** The recovery precondition compares the notice's `effectiveUtc` with the record time. It does not compare the notice's own token time. A revocation stamped after the recovery record but backdated satisfies it. The owner acknowledgement digest still gates recovery, but the "revoked before" property is weaker than the wording suggests.
- **N2.** A transition record binds the previous checkpoint by id (`afterCheckpoint`), not by manifest digest or witness imprint. The token-time window limits the risk; binding the digest would be stronger.
- **N3.** Notice versions come from `git log -- tools/g4/revocations.json` and inherit the history-simplification limit already disclosed for the registry.
- **N4.** A bogus CRL with the pinned root's issuer name makes every token `REFUSED TOKEN_INVALID`. This fails closed, but anyone who can commit can cause it.
- **N5.** `git cat-file blob` reads a symlink entry as its link text and never follows it, which is correct. The phrase "refuses non-blobs" is accurate because Git stores a symlink as a blob.

## Scratch material

All scratch repositories and scripts were outside both worktrees, under the session scratchpad (`aud/` and `dl/`). Network use: one GET of the FreeTSA root CRL. The worktree was left as found: `git status --short` was empty and HEAD was `59c4291e` after the audit, before this report was written.
