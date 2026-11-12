# Plan: G4 token-time validation, timestamped revocation notices, key rotation and recovery (#638, v6.0.13)

**Status:** iteration 1, PROPOSED for independent audit. This document records no PASS and no merge authority.
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
- **Totals.** G4 suites 138/138. `npm run test:node` (after stacking on #657): 1120 pass, 2 fail. Both failures are the known `bundleDeps` junction artefact.
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

## Audit questions

1. Does each owner item get the behaviour stated, failing closed on every missing input?
2. Can any path accept a key change, a notice or a token that the rules above should refuse? Pay particular attention to genesis pinning, recovery, CRL selection when several CRLs are current, and blob reads.
3. Is anything weakened relative to main for repositories with no transitions or notices?
4. Do the tests and the live evidence support the claims? Do the new files keep the Section 4 razor?
