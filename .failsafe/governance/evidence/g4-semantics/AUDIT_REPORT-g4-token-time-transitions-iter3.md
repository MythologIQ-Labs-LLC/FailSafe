# Audit report: G4 token-time validation, notices and key transitions (#638), iteration 3

- **Procedure:** native `/qor-audit` (Gate Tribunal), run by an independent adversarial auditor. The auditor did not write the change and saw no earlier review except what the repository records: Entries #959 and #960, and the iteration-1 and iteration-2 reports.
- **Target:** branch `feat/638-g4-token-time-transitions`, commit `95069d83436acefb3506ee1987723f6e6afed144` (draft PR #658), stacked on `origin/feat/638-g4-freetsa-root` (`2c7a58af`, PR #657, PASS Entry #958).
- **Plan:** `.failsafe/governance/plans/plan-v6013-638-g4-token-time-transitions.md`, Iteration 2 and Iteration 3 sections. Risk grade L3.
- **Reviewed diffs:**
  - `git diff origin/feat/638-g4-freetsa-root 95069d83` (135 files);
  - `git diff ba8c1b21 95069d83` (16 files since the iteration-2 audit). The only code changes are in `crl-archive.cjs`; tests and the ops doc also changed.
- **Date:** 2026-11-12.

## VERDICT: VETO

Iteration-2 violations V5 and V6 are closed as specified. Every reason-code and merge-topology attack the auditor tried now fails closed. The iteration-1 fixes (V1 to V4, N1, N2) still hold.

One new blocking violation was found. **V7 (L3):** the append-only rule for archived CRLs depends on the verifier seeing the whole history, but the verifier never checks that it does. A shallow clone (`git clone --depth N`) of the exact qualified commit gives a release-mode `PASS OK` with no limitation. A full clone of the same commit gives `REFUSED TSA_CRL_HISTORY`. So does a `.git/shallow` or `.git/info/grafts` entry in a full clone, with the HEAD SHA unchanged. This is not the disclosed history-rewrite limit, because nothing was rewritten and `--commit` matches.

The skill's ledger and shadow-genome steps were not performed. The caller's constraints make the repository read-only except for this report.

## Checks

The attack scripts are in the session scratchpad under `aud3/` (`common.cjs`, `r1.cjs` to `r5.cjs`, `razor.cjs`), outside the worktree. Each one builds throwaway repositories from the test PKI (`g4TestPki.cjs`, `g4Scenario.cjs`) in the OS temp directory and deletes them afterwards. "Release" below means `verifyCheckpoints` with `release: true` and every trust input: the genesis fingerprint, the trusted head computed from the newest manifest, the repository and `expectedCommit` = HEAD.

### C1. Iteration-2 V5: RFC 3161 section 4 reason codes

Command: `node r1.cjs none unspecified keyCompromise CACompromise affiliationChanged superseded cessationOfOperation certificateHold removeFromCRL`. In each case the TSA signer was revoked after both checkpoint tokens, and a CRL listing it was committed. The `openssl crl -text` entry was printed and checked against the parse.

| Revocation (after the tokens) | Release result | Expected by RFC 3161 section 4 |
|---|---|---|
| no reasonCode (`openssl ca -revoke` default) | REFUSED TSA_SIGNER_REVOKED | invalidate all |
| keyCompromise | REFUSED TSA_SIGNER_REVOKED | invalidate all |
| cACompromise | REFUSED TSA_SIGNER_REVOKED | invalidate all |
| certificateHold | REFUSED TSA_SIGNER_REVOKED | invalidate all (not in the keep list) |
| removeFromCRL | REFUSED TSA_SIGNER_REVOKED | invalidate all (fails closed) |
| unspecified | PASS OK | earlier tokens stay valid |
| affiliationChanged | PASS OK | earlier tokens stay valid |
| superseded | PASS OK | earlier tokens stay valid |
| cessationOfOperation | PASS OK | earlier tokens stay valid |

Command: `node r2.cjs otherFirst compromiseTime caCompromiseTime holdInstr noBleed`. These test parse edge cases on real `openssl ca` CRLs:
- entries for other serials before and after the signer's entry: REFUSED, as expected;
- keyCompromise with an `Invalidity Date` extension, followed by another serial's superseded entry: REFUSED;
- cACompromise with an invalidity date: REFUSED;
- certificateHold with a `Hold Instruction Code` extension: REFUSED;
- another serial revoked for keyCompromise while the signer is superseded after the tokens: PASS. This is correct; nothing bleeds between entries.

Code reading of `revokedEntries`:
- Entries are split on the case-sensitive `Serial Number:`, and the reason is read only within each entry's own chunk.
- A `critical` flag on the reason extension, an unknown or numeric reason, a missing reason or an unparseable date all fail to match, so the entry is treated as invalidating every token. That is fail closed.
- `-crl_check` together with the archive scan is unchanged from iteration 2.

**V5 closed.**

### C2. Iteration-2 V6: CRL removal through merges

Command: `node r3.cjs octopusOurs octopusResolve renameOut renameIn modeChange addRemoveSide crissCross oldBranchOurs replaceSameBytesOtherPath`. In each case a keyCompromise CRL was first committed (REFUSED TSA_SIGNER_REVOKED) and then dropped or changed by the named topology.

| Attack | Release result |
|---|---|
| octopus merge `-s ours` of the CRL branch and another branch | REFUSED TSA_CRL_HISTORY |
| octopus merge, CRL removed in the resolution | REFUSED TSA_CRL_HISTORY |
| CRL renamed out of the directory | REFUSED TSA_CRL_HISTORY |
| CRL renamed to another path inside the directory | REFUSED TSA_CRL_HISTORY |
| mode change (`update-index --chmod=+x`) | REFUSED TSA_CRL_HISTORY |
| CRL added and removed on a side branch, then merged | REFUSED TSA_CRL_HISTORY |
| criss-cross merges, CRL dropped in both resolutions | REFUSED TSA_CRL_HISTORY |
| old branch merging main with `-s ours` (HEAD tree never had the CRL) | REFUSED TSA_CRL_HISTORY |
| same bytes moved to another file name | REFUSED TSA_CRL_HISTORY |

Verifier Git configuration (`node r4.cjs cfg`, `node r4.cjs orphan`, using `GIT_CONFIG_COUNT`, which `gitEnv` passes through):
- A merge-resolution drop stays REFUSED under `log.diffMerges` = first-parent, combined and dense-combined, and under `log.showRoot=false`. Under first-parent, the blob-presence layer catches it.
- One combination fails open. An unrelated (orphan) root commit carrying the CRL is merged with `-s ours`. With **both** `log.showRoot=false` and `log.diffMerges=first-parent` in the verifier's own Git config, the result is `PASS OK, mode release`. Every other configuration refuses. See N1: this needs a non-default config on the verifying machine, so it is not counted as a separate violation, but V7's remediation covers it.

**V6 closed for every topology inside a complete history.**

### C3. Iteration-1 fixes still hold

- **V1** (`node r5.cjs`): each attempt was refused:
  - a genuine CRL plus a foreign root certificate, in either order: TSA_CRL_MALFORMED;
  - a CRL from a foreign CA: TSA_CRL_UNTRUSTED;
  - the same smuggling in a subdirectory: TSA_CRL_MALFORMED;
  - a non-`.crl` file in the directory: TSA_CRL_MALFORMED.

  Only the canonical `openssl crl -outform PEM` output reaches the CAfile (code reading).
- **V2, V3, V4, N1, N2:** covered by passing suite tests:
  - V2: rotation after the old key expired; not-yet-valid and expired key windows;
  - V3: a later CRL listing an earlier revocation;
  - V4: delete, change and restore;
  - N1: a backdated revocation stamped after the recovery record;
  - N2: a rotation bound to another manifest.

  Code reading of `transition.cjs`, `notices.cjs`, `verify-witness.cjs` and `tsa-trust.cjs` found them unchanged since iteration 2, and as the iteration-2 report described.

### C4. New weakening or bypass

- **V7 (blocking), shallow or grafted history.** Command: `node r4.cjs shallow`.

  Setup:
  - A side branch from the newest checkpoint commits a revoking CRL, deletes it in the next commit, then adds 8 empty commits.
  - The side branch is merged into main.
  - The full repository is `REFUSED TSA_CRL_HISTORY`.

  Results:

  | Repository | `is-shallow` | HEAD same SHA | Release result |
  |---|---|---|---|
  | `git clone --depth 4` | true | yes | REFUSED COMMIT_MISSING (genesis commit absent) |
  | `git clone --depth 5` | true | yes | **PASS OK, mode release, limitations []** |
  | `git clone --depth 6` | true | yes | **PASS OK, mode release, limitations []** |
  | `git clone --depth 8` | true | yes | **PASS OK, mode release, limitations []** |
  | `git clone --depth 12` | false | yes | REFUSED TSA_CRL_HISTORY |
  | full copy plus `.git/shallow` naming a later side commit | n/a | yes | **PASS OK, mode release** |
  | full copy plus `.git/info/grafts` naming a later side commit as a root | n/a | yes | **PASS OK, mode release** |

  `git.cjs` strips `GIT_SHALLOW_FILE` and `GIT_GRAFT_FILE` from the environment, and passes `--no-replace-objects`. It never checks `git rev-parse --is-shallow-repository`, or for a grafts file, and nothing else in `scripts/` does either (`grep -rn shallow`).
- **Weakening relative to main:** none found for a repository with no transitions or notices.
  - Main validated tokens at the current time with no revocation check, and pinned every checkpoint to `--trust-fingerprint`.
  - The change pins the genesis key only, and accepts later keys only through a signed, timestamped and bound transition record. Recovery also needs the offline `--accept-recovery` digest and always carries a limitation. That is the owner's item 6, not a weakening.
  - The registry history layer (`commitsTouching`, `assertGitHistoryMonotonic`) has the same shallow-clone exposure on main. V7 is therefore a gap in the new CRL guarantee, not a regression.
- **Disclosed limits:**
  - "Trusting TSA genTime" is accurately stated.
  - "A history rewrite (force-push) that removes a CRL is not detectable from the repository alone" is accurate for rewrites. It hides a larger gap: the same loss happens without any rewrite when the verifying clone is shallow or grafted. Release mode then reports PASS with no limitation, and the ops doc's "Run it from a fresh `git clone`" does not require a full one (V7).
  - A second, inherent limit is stated accurately: the archive protects only once the owner commits the revoking CRL ("refused once any archived CRL records that revocation").

### C5. Test runs (from `FailSafe/extension`)

- `node --test src/test/scripts/g4*.test.cjs`: 154 tests, 154 pass, 0 fail, 0 skipped, exit 0.
- `node --test src/test/docs/*.test.cjs`: 145 tests, 145 pass, 0 fail, exit 0.
- Full `npm run test:node`: not run (optional).
- No suite test covers a shallow or grafted clone.
- FreeTSA CRL: `openssl crl -in tools/g4/tsa-crls/freetsa-root-ca-2026-09-18.crl -CAfile tools/g4/tsa-roots/freetsa-root-ca.pem -noout` gives `verify OK`. The file has been unchanged since `5daacc23`. No network request was made in this audit.

### C6. Section 4 razor and overstatement

| Check | Limit | Found | Status |
|---|---|---|---|
| Max function lines | 40 | largest 34 (`createLocalTsa`, test helper); largest library function 26 (`buildContext`) | OK |
| Max file lines | 250 | largest 225 (`g4KeyTransition.test.cjs`); `crl-archive.cjs` 136, `verify.cjs` 138 | OK |
| Max nesting depth | 3 | 3 (`assertSignerNotRevoked`: for, for, if); `assertAppendOnly` 2 | OK |
| Nested ternaries | 0 | 0 | OK |

The other skill passes:
- Security: no placeholder auth, hardcoded secrets, mock returns or disabled checks.
- Ghost UI: not applicable.
- Dependencies: none added.
- Macro architecture and orphans: `crl-archive.cjs` is reached through `tsa-trust.cjs` and then `verify.cjs`; `records.cjs` through `g4-record.cjs`. No cycle and no orphan.

Overstatement:
- `G4_WITNESS_OPERATIONS.md` says "every CRL blob ever added in that history must still be present at HEAD", and the table says "removed or changed anywhere in the history reachable from HEAD". The `crl-archive.cjs` header says the same. These statements are true only when the clone is complete, and that is neither enforced nor disclosed (V7).
- The plan's iteration-2 V3 and V4 text keeps the old wording, but the Iteration 3 section explicitly supersedes it. Accepted.
- The plan's "Limits" list does not repeat the CRL history-rewrite limit; it is in the Iteration 3 section and the ops doc. This is not blocking.
- The evidence README matches its committed results.

### C7. Ledger

- `git diff origin/feat/638-g4-freetsa-root 95069d83 -- docs/META_LEDGER.md` removes 0 lines. The only added headings are `### Entry #959: ... (iteration 1) VETO` and `### Entry #960: ... (iteration 2) VETO`.
- `python -I -m qor.cli verify-ledger --post-anchor` gives `post-anchor clean (boundary=#382)`. It also prints the disclosed pre-anchor residuals (#235, #236, #340, #382).

## Violations

### V7 (BLOCKING, L3): CRL append-only check silently passes on shallow or grafted history

`assertAppendOnly` (`crl-archive.cjs`) trusts that `git log HEAD -m --full-history` sees the whole history. In a shallow clone, or a repository with `.git/shallow` or `.git/info/grafts`, a commit that deleted a revoking CRL lies beyond the cut. The verifier then gives `PASS OK, mode release, limitations []` at the same qualified commit for which a full clone gives `REFUSED TSA_CRL_HISTORY`. That is the outcome V6 was meant to prevent: a signer revoked for key compromise stops refusing.

Shallow clones are a common CI default (`fetch-depth`). The ops doc only says "a fresh `git clone`", and the disclosed limit covers only history rewrites. The code already treats history redirection as a threat: it strips `GIT_SHALLOW_FILE` and `GIT_GRAFT_FILE` and passes `--no-replace-objects`. It still does not fail closed on the in-repository equivalents.

Required remediation:
- In `buildContext`, or before any history check, return `BLOCKED` (for example `REPO_HISTORY_INCOMPLETE`) when either of these holds:
  - `git rev-parse --is-shallow-repository` prints `true`;
  - a grafts file exists (`git rev-parse --git-path info/grafts`).

  Apply this in every mode, or at least in release mode.
- Pin the history queries against the verifier's own Git config. Pass `--diff-merges=separate` (or `--diff-merges=m`, not a bare `-m`) and `--root` explicitly on the CRL `git log` calls. That closes the N1 combination.
- Add tests:
  - a shallow clone of a repository whose full history is `TSA_CRL_HISTORY` is BLOCKED, not PASS;
  - a planted `.git/shallow` is BLOCKED.
- In `G4_WITNESS_OPERATIONS.md` (release procedure and Limits) and in the plan, state that the verifier requires, and enforces, a complete non-shallow clone.

## Notes (non-blocking)

- **N1.** With both `log.showRoot=false` and `log.diffMerges=first-parent` set in the verifying machine's Git config, an orphan-root CRL dropped by an `-s ours` merge passes. The repository cannot set this, and it is covered by V7's remediation (explicit `--diff-merges=separate --root`).
- **N2.** `crl.revoked.find` takes the first entry for a serial within one CRL. A CRL with two entries for the same serial, the first with a keep-earlier reason and the second compromise-type, would be judged by the first only. A genuine `openssl ca` CRL never produces this, and the CRL must be signed by the pinned root, so this is hardening only. Using `filter` and refusing on any matching entry would remove it.
- **N3.** Iteration-2 notes N2 to N5 still hold:
  - the `Invalidity Date` is ignored, which is now relevant only for the four keep-earlier reasons;
  - only signers issued directly by a pinned root are scanned, and an intermediate-issued signer is BLOCKED by `-crl_check`;
  - no suite test covers the recovery-side key window (the iteration-2 auditor verified it by hand);
  - revocation notices are unsigned, which is fail closed for rotation.
- **N4.** The TSA `accuracy` field is not applied to `genTime` in the revocation-date comparison. With FreeTSA's accuracy and one-second resolution, the effect is at most one second.

## Scratch material and side effects

- Scripts: session scratchpad `aud3/` (`common.cjs`, `r1.cjs` to `r5.cjs`, `razor.cjs`). Test output: scratchpad `g4tests.txt`, `doctests.txt`. Throwaway repositories were created in the OS temp directory and deleted.
- Network use: none.
- The worktree was left as found: `git status --short` was empty and HEAD was `95069d83436acefb3506ee1987723f6e6afed144` before this report was written. This report is the only file added. No commit, push, PR edit, ledger or gate change was made.
