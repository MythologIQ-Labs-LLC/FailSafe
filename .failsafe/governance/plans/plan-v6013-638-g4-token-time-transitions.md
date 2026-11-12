# Plan: G4 token-time validation, timestamped revocation notices, key rotation and recovery (#638, v6.0.13)

**Status:** iteration 5, after the independent VETOs recorded as ledger Entries #959 (iteration 1, `59c4291e`), #960 (iteration 2, `ba8c1b21`), #961 (iteration 3, `95069d83`) and #962 (iteration 4, `7cfe447f`). This document records no PASS and no merge authority.
**Baseline:** `main` `29b819feaf07ca991c9b6a75f8e0f01549e3cd11`, stacked on PR #657 (`origin/feat/638-g4-freetsa-root`, which is itself stacked on PR #647). **Branch:** `feat/638-g4-token-time-transitions`. Merge order: #647, then #657, then this.
**Change class:** verifier semantics. Risk grade L3: this changes when a G4 checkpoint witness is accepted.
**Owner direction (2026-11-12, recorded in #647 section 2a):** items 6, 7 and 9 are no longer deferred.
- **Item 6:** define planned key rotation with verified continuity, and emergency recovery that never falsely claims uninterrupted continuity.
- **Item 7:** revocation notices carry independent timestamps.
- **Item 9:** token-time verification with archived revocation evidence, instead of indefinite current-time checks.

This is design and code only. It authorizes no rotation, recovery, revocation, key enrollment or checkpoint.

## Gap found in the merged implementation, and the correction

| Item | Before (main) | After |
|---|---|---|
| 9 | `openssl ts -verify` at the current time, with no revocation check. A checkpoint stops verifying when its TSA signer expires. | Every token (checkpoint, notice, transition) is verified with `-attime <its genTime> -crl_check`. The trust file is the pinned roots plus every committed CRL in `tools/g4/tsa-crls/` (PEM `.crl`, read from Git at HEAD). No CRL current at the token time: `BLOCKED TSA_REVOCATION_EVIDENCE_MISSING`. Signer revoked in such a CRL: `REFUSED TSA_SIGNER_REVOKED`. CRL not signed by the pinned root: `REFUSED TOKEN_INVALID`. Malformed CRL file: `REFUSED TSA_CRL_MALFORMED`. The FreeTSA root CRL (2026-09-18 to 2027-09-18) is committed. |
| (audit #956 N1) | `policyCaFile` hashed the first certificate of a root file but trusted all of them. | A root file must hold exactly one certificate and nothing else (`TSA_ROOT_MALFORMED`). |
| 7 | Notices are hash-bound and append-only, with no token. | Every committed registry version from 2 on needs `tools/g4/revocation-notices/v<N>.tsr` over `SHA-256("FailSafe-G4-revocations-v1\0" || u64be(len) || registry bytes)`, valid at token time (`REVOCATION_UNSTAMPED`). Version 1 holds no notice. Version tokens are in time order (`REVOCATION_TIME_ORDER`). A notice may not be effective more than 5 minutes after its version's token (`REVOCATION_POSTDATED`). |
| 6 | Every key change is `REFUSED KEY_RESET`. `--trust-fingerprint` must match every checkpoint's key. | `--trust-fingerprint` pins the genesis key. A key change needs `tools/g4/transitions/<old fp>.{json,sig,tsr}` (schema `failsafe-g4-key-transition/v1`, bound to repository, old and new fingerprint and the previous checkpoint, token over a tagged imprint, token time between the two checkpoints). A **rotation** is signed by the old key, which is not revoked at the record's time; continuity is verified. A **recovery** is signed by the new key; the old key must be revoked by the record's time (`KEY_RECOVERY_UNREVOKED`), and the operator must pass `--accept-recovery g4-NNNNNN:<sha256 of the record>` from the owner's offline record (`KEY_RECOVERY_UNACKNOWLEDGED`). Every PASS across a recovery, release included, carries the limitation "chain continuity across it is NOT verified". Anything else is `KEY_TRANSITION_INVALID`, or `KEY_RESET` if there is no record. |
| tooling | none | `g4-record.cjs notice` and `g4-record.cjs transition` (owner only; they write files and never commit), library `records.cjs`. `g4-create-checkpoint.cjs` maps a network failure to `BLOCKED TSA_OFFLINE`. |
| robustness | `git show <sha>:<path>` | `git cat-file blob <sha>:<path>`. Found by the live check: on Windows, `git show` also tries the argument as a path, and a long one fails with "Filename too long", which read as "not committed". It now also refuses non-blobs. |

**Files:**
- New: `scripts/lib/g4/{tsa-trust,notices,transition,records}.cjs` and `scripts/g4-record.cjs`.
- Changed: `verify.cjs`, `verify-witness.cjs`, `timestamp.cjs` (optional `atTime`), `bytes.cjs` (`taggedImprint`), `layout.cjs`, `git.cjs`, `g4-verify-checkpoint.cjs` (`--accept-recovery`) and `g4-create-checkpoint.cjs`.
- Tests: `g4TestPki.cjs` (the test CA issues the TSA certificate with `openssl ca` and makes CRLs and revocations) and `g4Scenario.cjs` (test repositories commit a CRL).
- Docs: `.gitattributes`, `tools/g4/tsa-crls/freetsa-root-ca-2026-09-18.crl`, `docs/releases/G4_WITNESS_OPERATIONS.md` (procedures and limitations) and `RELEASE_INTEGRATION_PATH.md` (the new directories are pre-seal inputs).

## Tests and falsification

- **New suites.** `g4TokenTime.test.cjs`, 14 tests:
  - CRL missing, expired at token time, or issued after token time;
  - a CRL from another key under the same CA name;
  - a malformed or stray CRL file;
  - an appended root certificate;
  - a token still valid after its TSA signer expired, with a precondition proving a current-time check of the same token fails;
  - a signer revoked before a later token, while earlier tokens stay valid;
  - notices: unstamped, stamped, postdated, a token reused across versions, and tokens out of time order.

  `g4KeyTransition.test.cjs`, 14 tests:
  - a valid rotation passes release with no limitation;
  - pinning the new key instead of the genesis key is refused;
  - wrong signer, wrong previous checkpoint, wrong next key, wrong repository, no token, an edited record, a revoked old key, and a third key with no record;
  - recovery: unacknowledged, a wrong digest, accepted with the limitation (library and CLI), unrevoked, and signed by the old key;
  - the builder's own refusals.
- **Existing suites.** Two revocation tests now stamp their registry version. One of them used a notice dated a day after its own commit; under item 7 that is postdated, so it now uses a notice effective after the checkpoints but before its token.
- **Totals.** G4 suites 149/149 (iteration 2; 138 in iteration 1). `npm run test:node` (iteration 2): 1131 pass, 2 fail. Both failures are the known `bundleDeps` junction artefact.
- **Planted defects in the new verifier, each caught (failing tests in brackets):**
  - token time disabled (6);
  - notices skipped (4);
  - multi-certificate roots allowed (1);
  - record signature unchecked (3);
  - recovery acknowledgement skipped (1);
  - record binding skipped (3);
  - postdating allowed (1);
  - genesis pin disabled (3).

  The long-path regression test fails when `git show` is restored.
- **Live check** with real FreeTSA tokens and the real CRL (`.failsafe/governance/evidence/g4-semantics/`): sem2 met 5 of 5, including release-mode `PASS OK` with no limitation for a stamped registry and for a rotation pinned to the genesis key. sem1 (4 of 5) found the long-path defect and is kept.

## Limits (disclosed in `G4_WITNESS_OPERATIONS.md`)

- **Trust in the TSA's clock.** Token-time validation trusts the TSA's `genTime`. An undisclosed TSA key compromise could backdate tokens; the externally retained trusted head is what detects a replaced chain.
- **CRL freshness.** The committed FreeTSA CRL covers tokens until 2027-09-18. A newer CRL must be committed, as a pre-seal input, before any later checkpoint, or verification blocks.
- **Recovery.** It verifies checkpoint links and ledger prefixes across the key change, but not the old key holder's consent. A release across a recovery needs its own owner decision.
- **Time resolution.** Token times have one-second resolution. A rotation is refused when the old key's revocation falls anywhere in the record token's second.

## Rollback

Revert this PR: the verifier returns to current-time validation with no notice or transition support. No committed checkpoint, notice or transition exists yet.

## Iteration 2 (VETO #959 remediation)

The independent audit of `59c4291e` reproduced four blocking defects. Each is fixed, and each has a test that fails when its fix is planted back out.

- **V1. A `.crl` file could add a trust anchor.**
  - Before: only the first PEM CRL in each file was checked, and the raw file was appended to the OpenSSL CAfile.
  - Fix: new `crl-archive.cjs`. Each `.crl` file must hold exactly one PEM CRL and nothing else (`TSA_CRL_MALFORMED`), and the CRL must verify against one pinned root on its own (`TSA_CRL_UNTRUSTED`). Only OpenSSL's canonical re-encoding reaches the trust file.
  - Tests: `g4TokenTime`, covering two CRLs, a CRL followed by a smuggled CA root and its CRL, and a CRL from another key under the same CA name.
- **V2. A rotation was accepted from an expired key.**
  - Fix: the record's token time must lie inside the signing key's certificate window (the old key for a rotation, the new key for a recovery).
  - Test: `g4KeyTransition`, a rotation signed after the old key expired.
- **V3. A later CRL revoking the signer before the token was ignored.**
  - Fix: after OpenSSL's `-crl_check` (which still needs a CRL current at the token time), `assertSignerNotRevoked` consults every archived CRL from the signer's issuing root. It refuses when the signer is listed as revoked at or before the token's time, or for key or CA compromise at any time (RFC 3161 section 4).
  - Tests: `g4CrlArchive`, covering a later CRL that lists an earlier revocation, a key-compromise revocation that also refuses earlier tokens, and a `superseded` revocation after a token that leaves it valid.
  - The operations doc no longer claims more than the code does.
- **V4. Archived CRLs could be deleted.**
  - Fix: `git log --full-history --no-renames --diff-filter=DMT -- tools/g4/tsa-crls/` must be empty (`TSA_CRL_HISTORY`).
  - Tests: deletion, change, deletion hidden by a later restore, and an allowed addition.
- **N1.** A recovery now also requires that the old key's notice was timestamped, by its registry version's token, no later than the recovery record. A backdated revocation stamped after the record is `KEY_RECOVERY_UNREVOKED` (test). `verifyNotices` returns when each revocation was witnessed.
- **N2.** A transition record now binds the previous checkpoint's manifest SHA-256 (`afterCheckpointManifestSha256`; test, plus a control record that passes).
- **N3 to N5.** Unchanged: the inherited Git-history limit, a bogus CRL causing only refusal, and the symlink reading noted as correct.

**Planted defects in the fixes, each caught:**
- extra content in a CRL file;
- CRL root unchecked;
- later CRLs ignored;
- compromise ignored;
- CRL history unchecked;
- key window unchecked;
- notice token time ignored;
- manifest binding unchecked.

The first key-window plant was itself wrong (`false && a || b` still evaluates `b`) and caught nothing. Replanted as `if (false)`, it is caught.

## Iteration 3 (VETO #960 remediation)

The second independent audit confirmed that iteration-1 V1, V2, N1 and N2 are closed. It re-ran the original attacks and variants, including a recovery signed by a not-yet-valid new key, and each now fails. It found two blocking defects in the V3 and V4 fixes.

- **V5. Revocation reasons were the wrong way round.**
  - The iteration-2 text above inverted RFC 3161 section 4: it refused all tokens only for key or CA compromise and judged every other revocation by date.
  - Section 4 keeps earlier tokens valid only for reasonCode unspecified, affiliationChanged, superseded or cessationOfOperation. Any other reason, or no reasonCode, invalidates every token.
  - The code, the ops doc and this plan now follow the RFC.
  - Tests: no reasonCode, certificateHold and cACompromise each invalidate earlier tokens; superseded still keeps them valid. The date-based tests use `superseded`.
- **V6. A CRL could be dropped through a merge.**
  - The history check now uses `git log HEAD -m --full-history --no-renames`, so every merge is diffed against every parent.
  - Independently, every CRL blob ever added in that history must still be present at HEAD with the same path and bytes.
  - Tests: a CRL dropped by a merge resolution, and a branch merged with `-s ours`; both are `TSA_CRL_HISTORY`.
  - The two layers overlap on purpose. Planting either one out leaves the merge tests passing, because the other layer still catches them. Planting both out fails both tests.
  - The history-rewrite limit is now disclosed: checkpoints do not bind the CRL set, so a force-push that removes a CRL is not detectable from the repository alone.
- **Planted defects in the iteration-3 fixes:**
  - every reason keeps earlier tokens: 6 failures;
  - the D/M/T check removed: 1 failure;
  - `-m` and the blob-presence check removed together: 2 failures.
- **Totals.** G4 suites 154/154; `npm run test:node` 1136 pass, 2 fail (the known `bundleDeps` junction artefact). The sem4 throwaway repositories with real FreeTSA tokens re-verify offline under the iteration-3 code: `PASS OK` for both base and rotated, with no new FreeTSA request.

## Iteration 4 (VETO #961 remediation)

The third independent audit confirmed that V5 is closed, that V6 is closed within a complete history (octopus, `-s ours`, criss-cross and resolution merges, renames, mode changes, side-branch add-then-remove), and that the iteration-1 fixes hold. It found one blocking defect.

- **V7. A shallow or grafted clone hid a removed CRL.**
  - Fix: new `assertCompleteHistory` in `git.cjs`, called at the start of every verification. It returns `BLOCKED REPO_INCOMPLETE_HISTORY` when `git rev-parse --is-shallow-repository` is not `false`, or when `.git/shallow` or `.git/info/grafts` exists. This also protects the existing revocation-registry history check, which had the same exposure on `main`.
  - The CRL `git log` calls pass `--diff-merges=separate --root` explicitly, so the verifying machine's `log.diffMerges` and `log.showRoot` cannot narrow the view (note N1).
  - The ops doc now states that a complete clone is required and enforced.
  - Tests (`g4CrlArchive`): a `--depth` clone, a planted `.git/shallow` and a planted `.git/info/grafts` are each `BLOCKED REPO_INCOMPLETE_HISTORY`; a full clone of the same commit passes.
- **Planted defect:** with the `assertCompleteHistory` call removed, both new BLOCKED tests fail. **Totals:** G4 suites 157/157; `npm run test:node` 1139 pass, 2 fail (the known `bundleDeps` junction artefact).
- **Notes N2 to N4** (one entry per serial judged; the iteration-2 notes; the TSA accuracy field) are not changed. N2 cannot arise from a genuine CA, and N4 is at most one second.

## Iteration 5 (VETO #962 remediation)

The fourth independent audit confirmed that V7 is closed: shallow clones, deepened clones, planted shallow or grafts files, alternates, partial clones and replace grafts are all handled. It also confirmed that iteration-3 N1 is closed and that V1, V5 and V6 hold. It found two blocking defects in how far the verifier trusts the local object database.

- **V8. A forged commit-graph hid history.**
  - Fix: every Git call the verifier makes runs with `-c core.commitGraph=false`, so history is walked from the commit objects themselves.
  - Test (`g4RepoIntegrity`, adapted from the auditor's forgery): HEAD's parent is rewired in a written commit-graph to hide the commits that add and delete a revoking CRL. The verifier still returns `REFUSED TSA_CRL_HISTORY`. The precondition confirms that `git rev-list` itself is fooled by the forged graph.
- **V9. The local object store was trusted.**
  - Fix: `git fsck --full --no-dangling` must pass before any history check, or the verifier returns `BLOCKED REPO_INTEGRITY`. On the real repository this takes about 4.5 s.
  - Test: a loose object, the revoking CRL's blob, is replaced by the bytes of another blob under the same id. The verifier returns `BLOCKED REPO_INTEGRITY`, where it returned `PASS` before the fix.
  - Planted defects: trusting the commit-graph again, or skipping fsck, each fails its test. **Totals:** G4 suites 159/159; `npm run test:node` 1141 pass, 2 fail (the known `bundleDeps` junction artefact). The CLI on the real repository returns `BLOCKED NO_CHECKPOINTS` in 4.5 s.
  - The ops doc now states exactly what is enforced (complete history, genuine objects, no commit-graph or replace shortcuts) and what is still trusted: the Git and OpenSSL binaries, SHA-1 ids, and a full clone from the canonical remote.

## Audit questions

1. Does each owner item get the behaviour stated, failing closed on every missing input?
2. Can any path accept a key change, a notice or a token that the rules above should refuse? Pay particular attention to genesis pinning, recovery, CRL selection when several CRLs are current, and blob reads.
3. Is anything weakened relative to main for repositories with no transitions or notices?
4. Do the tests and the live evidence support the claims? Do the new files keep the Section 4 razor?
