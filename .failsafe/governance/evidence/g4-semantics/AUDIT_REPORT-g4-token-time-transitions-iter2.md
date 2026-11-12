# Audit report: G4 token-time validation, notices and key transitions (#638), iteration 2

- **Procedure:** native `/qor-audit` (Gate Tribunal), independent adversarial auditor. The auditor did not write the change and saw no earlier review except what the repository records (Entry #959 and the iteration-1 report).
- **Target:** branch `feat/638-g4-token-time-transitions`, commit `ba8c1b21fdb23323966432f14c9f029beea8ef79` (draft PR #658), stacked on `origin/feat/638-g4-freetsa-root` (`2c7a58af`, PR #657).
- **Plan:** `.failsafe/governance/plans/plan-v6013-638-g4-token-time-transitions.md`, iteration 2 section. Risk grade L3.
- **Reviewed diffs:** `git diff origin/feat/638-g4-freetsa-root ba8c1b21` (130 files) and `git diff 59c4291e ba8c1b21` (69 files, since the iteration-1 audit).
- **Date:** 2026-11-12.

## VERDICT: VETO

Iteration-1 violations V1 and V2, and notes N1 and N2, are closed; the auditor re-ran the original attacks and variants and all now fail closed. V3 and V4 are only partly closed, and two new blocking violations follow from them:

- **V5 (L3):** the archived-CRL check claims RFC 3161 section 4 but inverts its default. A TSA signer revoked with **no reasonCode** (the `openssl ca -revoke` default), or with `certificateHold`, is treated as "tokens before the revocation date stay valid". RFC 3161 section 4 says that with no reasonCode all tokens signed by that key SHALL be considered invalid. A release-mode PASS with no limitation was reproduced for tokens of a signer so revoked.
- **V6 (L3):** archived CRLs are not append-only across merge commits. A revoking CRL removed by a merge commit's resolution makes the chain go from `REFUSED TSA_SIGNER_REVOKED` back to a release-mode `PASS OK` with no limitation. The `TSA_CRL_HISTORY` check never sees the deletion.

The skill's ledger and shadow-genome steps were not performed. The caller's constraints make the repository read-only except for this report.

## Checks

### C1. Iteration-1 violations and notes, re-attacked

Every scratch repository was built from the test PKI (`g4TestPki.cjs`, `g4Scenario.cjs`) in the OS temp directory. The scripts are in the session scratchpad under `aud2/` (`a1.cjs` to `a5.cjs`), outside the worktree.

| Item | Attack (script) | Result | Status |
|---|---|---|---|
| V1, CRL file adds trust | `a3.cjs`: in `tools/g4/tsa-crls/zz.crl`: trailing garbage; DER CRL; two CRL blocks; CRL plus a non-pinned root certificate; a certificate inside the CRL armour; PEM header lines; `TRUSTED CERTIFICATE` block after the CRL; leading BOM; trailing NUL; uppercase `.CRL` | all `REFUSED TSA_CRL_MALFORMED` | closed |
| V1, foreign issuer | `a3.cjs`: CRL from an unrelated, non-pinned test CA; suite: CRL from another key under the same CA name | `REFUSED TSA_CRL_UNTRUSTED` | closed |
| V1, benign encoding | `a3.cjs`: genuine CRL with CRLF line endings | `PASS` (canonical re-encoding only reaches the trust file) | correct |
| V1, code reading | `crl-archive.cjs` `loadOne`: one PEM block and nothing else, checked on the bytes; `openssl crl -outform PEM` output only goes into the CAfile; issuer root found by `openssl crl -CAfile <single pinned root>` | no path from committed CRL bytes to a trust anchor found | closed |
| V2, rotation outside the key window | suite `g4KeyTransition` (expired old key) | `KEY_TRANSITION_INVALID` | closed |
| V2 variant, recovery signed by a not-yet-valid new key | `a4.cjs`: key B with `notBefore` = now + 6 s; recovery record signed by B before that time; checkpoint 3 by B after it; `--accept-recovery` given | `REFUSED KEY_TRANSITION_INVALID` ("outside the signing key's certificate window") | closed (no suite test for the recovery side; see N4) |
| V3, later CRL listing an earlier revocation | `a2.cjs`, `a5.cjs` (also suite) | `REFUSED TSA_SIGNER_REVOKED`, release mode included | closed for that case |
| V3, compromise reasons | `a1.cjs` (`CACompromise`), suite (`keyCompromise`) | `REFUSED TSA_SIGNER_REVOKED` for every token, earlier ones included | closed |
| V3, other reasons, revocation **after** the tokens | `a1.cjs` and `a5.cjs`: no reasonCode; `certificateHold`; `unspecified`; `cessationOfOperation` | **PASS OK** for all four, release mode included for the no-reasonCode case | **V5** for no reasonCode and `certificateHold`; `unspecified` and `cessationOfOperation` are correct per RFC 3161 |
| V4, direct changes | suite, plus `a2.cjs`: delete, modify, delete-then-restore, rename out of the directory (`--no-renames`), `git rm --cached` | `REFUSED TSA_CRL_HISTORY` | closed |
| V4, deletion in a non-merge commit on a merged side branch | plain Git scratch repository: `side` deletes the CRL in its own commit, then is merged into `master` | the side commit is listed by the verifier's `git log --full-history --no-renames --diff-filter=DMT` | caught |
| V4, deletion by a merge commit | `a2.cjs` (a) and `a5.cjs`: revoking CRL committed (REFUSED), then a branch from before it is merged with `--no-commit` and the CRL removed in the merge resolution | **PASS OK, mode release, limitations []**. The verifier's `git log` prints nothing; the same command with `-m` prints the merge | **V6** |
| V4, older branch merged with `-s ours` | `a2.cjs` (b): check out the parent of the CRL commit, add a commit, `git merge -s ours master` (HEAD's tree lacks the CRL) | **PASS OK** | **V6** |
| V4, history rewrite | `a2.cjs` (d): `git reset --hard` past the CRL commit | **PASS OK**. Checkpoints do not bind the CRL set, so the trusted head does not catch it either when the CRL came after the newest checkpoint. Not disclosed | part of V6 |
| N1 | read `transition.cjs` `checkRecovery`, `notices.cjs` `verifyNotices`; suite test (backdated revocation stamped after the record) | both `effectiveUtc` and the notice version's token time must be at or before the record's token time | closed |
| N2 | read `checkBinding`; suite (wrong digest refused, control passes) | `afterCheckpointManifestSha256` is compared with SHA-256 of the previous manifest bytes | closed |

### C2. New weakening or bypass introduced by the fixes

- **Canonical re-encoding** (`openssl crl -outform PEM`): only the parsed CRL is written, so embedded or trailing material cannot reach the CAfile. No bypass found.
- **Issuer-root matching** (`X509Certificate.checkIssued` plus `verify(root.publicKey)`): for the real FreeTSA chain (`sem4` evidence), the TSA signer (serial `C2E986160DA8E9CD`, CA false) is issued directly by the pinned root, so the archive check runs in production. A signer issued by an intermediate would match no root and skip the archive check, but OpenSSL `-crl_check` then needs a CRL from that intermediate, which `TSA_CRL_UNTRUSTED` keeps out of the trust file, so such a token is BLOCKED (fail closed; N3).
- **Signer extraction**: every non-CA certificate in the token plus the committed chain is checked, so adding unrelated certificates cannot hide the signer. A token with no embedded signer certificate is `TOKEN_INVALID`.
- **Serial formatting**: `normSerial` strips non-hex characters and leading zeros and uppercases both sides. OpenSSL prints CRL entry serials on one line, so the line-based parse is sound for serials up to 20 octets. A negative serial would only over-refuse.
- **`-text` parsing**: entries are split on `Serial Number:` (case-sensitive; the AKI `serial:` and DN `serialNumber` do not match). The reason is read within each entry's own chunk. The last chunk holds only hex signature data after the entry. A date that does not parse refuses. No confusion found with several entries, entry extensions or hold instructions. The `Invalidity Date` entry extension is ignored (N2).
- **`--tsa-ca` override**: release mode still blocks it (`TSA_OVERRIDE_NOT_RELEASE`). In diagnostic mode, CRLs must verify against the override roots, and a PASS carries the `NOT a release verification` limitation. No weakening.
- **Weakening relative to main for a repository with no transitions or notices**: none found. Main validated at the current time with no revocation check at all, so V5 and V6 are gaps in the new protection, not regressions against main. They are blocking because the change claims these protections (C4).

### C3. Test runs (from `FailSafe/extension`)

- `node --test src/test/scripts/g4*.test.cjs`: 149 tests, 149 pass, 0 fail, 0 skipped.
- `node --test src/test/docs/*.test.cjs`: 145 tests, 145 pass, 0 fail.
- Full `npm run test:node` was not run (optional).
- The suites pass while V5 and V6 exist. No test covers a revocation without a reasonCode after a token, or a CRL deleted by a merge commit.
- FreeTSA CRL: `openssl crl -in tools/g4/tsa-crls/freetsa-root-ca-2026-09-18.crl -CAfile tools/g4/tsa-roots/freetsa-root-ca.pem -noout` gives `verify OK`. The file was not changed since iteration 1, where it was shown byte-identical to the live CRL. Live script not re-run, and no network request was made in this audit.

### C4. Section 4 razor and overstatement

| Check | Limit | Found | Status |
|---|---|---|---|
| Max function lines | 40 | none over 40 in any changed `.cjs` (scripted brace scan) | OK |
| Max file lines | 250 | largest 226 (`g4KeyTransition.test.cjs`); largest library 139 (`verify.cjs`), `crl-archive.cjs` 117 | OK |
| Max nesting depth | 3 | 3 (`assertSignerNotRevoked`: for, for, if) | OK |
| Nested ternaries | 0 | 0 | OK |

Security pass: no placeholder auth, hardcoded secrets or mock returns. Ghost UI: not applicable. Dependencies: none added. Macro architecture: `crl-archive.cjs` is reached from `tsa-trust.cjs`, so it is not an orphan; no cycle found.

Overstatement:
- `crl-archive.cjs` header, `G4_WITNESS_OPERATIONS.md` ("revoked for key or CA compromise at any time (RFC 3161 section 4 ...)") and the plan's V3 text present the rule as RFC 3161 section 4. The RFC also makes all tokens invalid when the reasonCode is absent, and lists only 0, 3, 4 and 5 as reasons that keep earlier tokens valid (V5).
- `G4_WITNESS_OPERATIONS.md`: "a committed CRL file that was ever deleted, changed or renamed is `REFUSED TSA_CRL_HISTORY`, even if it was later restored". The plan says the same of `git log --full-history --no-renames --diff-filter=DMT`. Both are false for a deletion made by a merge commit, or reached through a merge that keeps an older tree (V6).
- The operations doc discloses history-simplification limits for the registry, but none for the CRL archive. The archive has no checkpoint anchor, so a rewrite after the newest checkpoint is undetectable even with `--trusted-head` (V6).
- The evidence README and the live-check claims (sem3, sem4) match their committed results. No overstatement found there.

### C5. Ledger

- `git diff origin/feat/638-g4-freetsa-root ba8c1b21 -- docs/META_LEDGER.md`: 0 removed lines. The only added heading is `### Entry #959: GATE TRIBUNAL - plan-v6013-638-g4-token-time-transitions (iteration 1) VETO`.
- `python -I -m qor.cli verify-ledger --post-anchor`: `post-anchor clean (boundary=#382)`. The two pre-anchor breaks it reports (#340, #382) are listed as disclosed.

## Violations

### V5 (BLOCKING, L3): revocation reason semantics are permissive, contrary to the RFC they cite

`crl-archive.cjs` `assertSignerNotRevoked` refuses every token only when the entry text matches `/Key Compromise|CA Compromise/`. Every other entry is judged by its revocation date, including one **without a reasonCode extension**. RFC 3161 section 4: "When the reasonCode extension relative to the revoked certificate from the TSA is not present in the CRL entry extensions, then all the tokens that have been signed with the corresponding key SHALL be considered as invalid". Only unspecified (0), affiliationChanged (3), superseded (4) and cessationOfOperation (5) keep tokens from before the revocation valid.

Reproduced (`a1.cjs`, `a5.cjs`): the signer was revoked after both checkpoint tokens with no reason (and, separately, with `certificateHold`), and a CRL listing it was committed. The result was `PASS OK`, and `mode release, limitations []` for the no-reason case.

This is the case that matters: an operator who finds a key compromise and revokes with plain `openssl ca -revoke` gives no reason code. Forged tokens backdated before that revocation then still verify.

Required remediation:
- Keep earlier tokens valid only when the entry carries a reasonCode of exactly unspecified, affiliationChanged, superseded or cessationOfOperation, and the revocation date is after the token time.
- Refuse every token of that signer for any other entry: no reasonCode, keyCompromise, cACompromise, certificateHold, privilegeWithdrawn, aACompromise, an unparseable reason, or an unparseable date.
- Add falsification tests for no reasonCode and for `certificateHold` after the token.
- Correct the RFC 3161 wording in the code header, the operations doc and the plan.

### V6 (BLOCKING, L3): archived CRLs can still be withdrawn through merge commits (V4 not closed)

`assertAppendOnly` runs `git log --full-history --no-renames --format=%H --diff-filter=DMT -- tools/g4/tsa-crls/` without `-m`. Git computes no diff for merge commits there, so a deletion that exists only in a merge result is never listed.

Reproduced (`a2.cjs`, `a5.cjs`), with a revoking CRL committed and the chain `REFUSED TSA_SIGNER_REVOKED`:
- (a) A branch from before the CRL was merged with `--no-commit` and the CRL removed in the merge resolution. The verifier's `git log` printed nothing, and the result was `PASS OK, mode release, limitations []`. The same `git log` with `-m` lists the merge.
- (b) The parent of the CRL commit was checked out, and `master` was merged into it with `-s ours`, so HEAD's tree never had the CRL. The result was `PASS OK`.

In addition, checkpoints do not bind the CRL set. A history rewrite that drops a CRL committed after the newest checkpoint is undetectable even with `--trusted-head` (`a2.cjs` (d)), and this is not disclosed.

Required remediation:
- Refuse unless every CRL path and blob ever added in the history reachable from HEAD is present, byte-identical, at HEAD. For example, collect `git log --full-history -m --no-renames --diff-filter=A --name-only --format=` (or `rev-list` plus `ls-tree` of every commit) and compare the blobs with HEAD's tree. At minimum add `-m` (`--diff-merges=separate`) to the existing query, and check that this does not flag legitimate merges.
- Add falsification tests for cases (a) and (b).
- Either bind a digest of the CRL set into each checkpoint manifest, or disclose in `G4_WITNESS_OPERATIONS.md` and the plan "Limits" that a CRL committed after the newest checkpoint can be withdrawn by a history rewrite without detection. Then narrow the "ever deleted ... even if later restored" wording to what is enforced.

## Notes (non-blocking)

- **N1.** Iteration-1 notes N3 to N5 are unchanged and remain accurate: the registry history-simplification limit is disclosed; a bogus same-name CRL causes only refusal; a symlink blob is read as its link text.
- **N2.** The CRL entry `Invalidity Date` extension is ignored. Under V5's remediation, a compromise-type or reason-less entry refuses every token anyway, so the gap would only remain for the four permissive reasons.
- **N3.** `assertSignerNotRevoked` consults archived CRLs only for signers issued directly by a pinned root, and skips certificates marked CA. For FreeTSA today, the signer is root-issued and not a CA, so the check applies. An intermediate-issued signer is BLOCKED by `-crl_check`, so this fails closed, but the limit should be kept in mind if a root with intermediates is ever pinned.
- **N4.** The plan states the key-window rule for both rotation (old key) and recovery (new key), but the suite tests only the rotation side. The auditor verified the recovery side by hand (`a4.cjs`).
- **N5.** Revocation notices are not signed by the owner; anyone who can commit can append and stamp one. Rotation then refuses, which is fail closed. Recovery still requires the owner's offline `--accept-recovery` digest. This is consistent with the stated design.

## Scratch material and side effects

- Scripts: session scratchpad `aud2/a1.cjs` to `a5.cjs` and `razor.cjs`. Test repositories were created in the OS temp directory and deleted by the scripts.
- Network use: none in this audit. No FreeTSA request and no CRL download were made.
- The worktree was left as found. `git status --short` was empty and HEAD was `ba8c1b21fdb23323966432f14c9f029beea8ef79` before this report was written. This report is the only file added.
