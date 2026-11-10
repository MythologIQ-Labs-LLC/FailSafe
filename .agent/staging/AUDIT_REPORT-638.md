# AUDIT REPORT: plan-v6013-638-g4-witness (iteration 2, retrospective)

**Verdict: PASS**
**Risk grade: L3** (governance integrity, cryptographic verification)
**Judge:** independent QoreLogic Judge (native `/qor-audit`), 2026-11-10
**Candidate:** `feat/638-g4-witness-v6013` HEAD `41d39e2e` (remediation in `94499d9d` and `f5f43a8e`; iteration-1 candidate `3d92d88f`)
**Plan:** `.failsafe/governance/plans/plan-v6013-638-g4-witness.md`, SHA-256 `6e3ffd98fe24f5d31b6cc3e2491e5623fe8b6aee22bd6bfc15e955caa0fff7d1`. This equals `plan_content_hash` in `.qor/gates/2026-11-10T1643-b038e8/plan-iter2.json` and in `plan.json`.
**Prior verdict:** iteration 1 VETO (B1: falsification-suite validity; mutants M06, M07, M18, M21 and M31 survived).

Scope note: read-only. The Judge did not write `docs/META_LEDGER.md` or `SHADOW_GENOME.md`; the governor records the ledger entries for the iteration-1 VETO and this PASS. This file is gitignored (`.gitignore:9 .agent/`).

## Hygiene

- `git ls-tree -r HEAD .qor/session` lists only `current`.
- `git log --all -- .qor/session/keys` is empty.

## B1 re-check: the Judge's own mutations, not the implementer's harness

I re-ran my iteration-1 runner (`g4mut-run.cjs` definitions, unchanged except one anchor). That anchor is M28's, re-pointed because the `catch` in `verify.cjs` was rewritten. The runner was pointed at a fresh LF clone of `41d39e2e`. Suite: every `g4*.test.cjs`, 65 tests.

**All 32 original mutants are caught (32/32):** M01, M02, M02b, M03 through M31.

The previously surviving mutants are now killed by these tests:

| Mutant | Disabled check | Killing test |
|---|---|---|
| M06 | checkpoint to HEAD registry monotonicity | "merge-hidden registry rollback at HEAD", labelled M07 in the suite |
| M07 | checkpoint to checkpoint registry monotonicity | "merge-hidden rollback plus a forged next checkpoint binding v1", labelled M06 in the suite |
| M08 | both, together | both tests |
| M18 | previous-checkpoint link | "genesis replaced by a validly signed and timestamped substitute" (`CHAIN_BROKEN`) |
| M21 | gap-statement digest | `GAP_STATEMENT_MISMATCH` |
| M31 | genesis epoch heading | `GENESIS_EPOCH_MISSING` |
| M19 | createdUtc skew | two `MANIFEST_TIME` tests |
| M20 | chain token time order | `CHAIN_TIME_ORDER` |
| M23 | token hash algorithm | SHA3-256 token, `TOKEN_INVALID` |
| M01, M02b | each prefix check alone | dedicated `PREFIX_BROKEN` tests with detail assertions |
| M10 | imprint compare | replay with its matching `.tsq` |

The suite's M06 and M07 labels are swapped relative to my definitions. Each anchor is still killed by its own test.

**Additional Judge mutants on the new code:**

| Mutant | Disabled behaviour | Result |
|---|---|---|
| M33 | `--release` override refusal | caught |
| M34 | repository mismatch | caught |
| M35 | key algorithm/encoding shape | caught |
| M36 | INTERNAL_ERROR (rethrow restored) | caught |
| M37 | `--tsa-ca` limitation note | caught |
| M32 | token `granted` check | **survived** |

## Test assertions reviewed

- **Merge-hidden rollback.** The test asserts the precondition that `git log -- revocations.json` does not list the v2 commit. It then asserts the code and the anchor detail (`g4-000003 -> HEAD registry` and `g4-000003 -> g4-000004`).
- **M18.** The substitute genesis is stamped before g4-000002 is remade, so time order holds and only the link check can fire. The detail is asserted.
- **M20.** Two unstamped checkpoints are stamped in reverse order, more than one second apart.
- **M23.** The token verifies under OpenSSL and is refused only by the algorithm check; the detail is asserted.
- **N4.** The test spawns the CLI and asserts exit 2, a one-line `BLOCKED INTERNAL_ERROR`, and no stack frames.

## `granted` survivor reasoning

The reasoning is accepted, with one precision.

OpenSSL's `TS_RESP_verify_response` fails any response whose status is not `granted` or `grantedWithMods`. A `rejection` or `waiting` response cannot reach the check, so the stated reason holds for those statuses.

The one status that does reach the check is `grantedWithMods`. OpenSSL prints it as "Granted with modifications.", which the regex `Status: Granted\.` does not match. The check therefore refuses a `grantedWithMods` token. That is fail-closed and stricter than RFC 3161, and the local `openssl ts -reply` TSA cannot produce such a token to test it.

This reading is from OpenSSL source behaviour; I did not exercise it with a live TSA. It is non-blocking (N-a).

## Non-blocking fixes verified

| Item | Evidence |
|---|---|
| N3 | `--release --tsa-ca` gives `BLOCKED TSA_OVERRIDE_NOT_RELEASE`, exit 2 (run on this repository). A PASS under `--tsa-ca` carries "NOT a release verification". |
| N4 | `INTERNAL_ERROR`, exit 2 |
| N6 | `granted`, `repository` (pinned with `--repository`, else to the genesis repository) and `key.algorithm`/`signatureEncoding` are enforced |
| N2, N5 | Disclosed in `G4_WITNESS_OPERATIONS.md`. Owner decisions 9 and 10 added. The doc also now discloses the Git-history simplification limit. |

The code delta is small: `verify.cjs` +16, `manifest.cjs` +2, `verify-witness.cjs` +1, CLI +6. I re-read it; there is still no fail-open path.

## Real repository

```
g4-verify-checkpoint.cjs                                          -> BLOCKED TSA_POLICY_UNSELECTED, exit 2
g4-verify-checkpoint.cjs --release --repository MythologIQ-Labs-LLC/FailSafe -> BLOCKED TSA_POLICY_UNSELECTED, exit 2
g4-verify-checkpoint.cjs --release --tsa-ca <file>                -> BLOCKED TSA_OVERRIDE_NOT_RELEASE, exit 2
```

## Razor, lint and tests

- **Razor:** max file 177 lines (`g4Scenario.cjs`, `g4FalsifyLedger.test.cjs`), all functions 40 lines or fewer, depth 3 or less. Pass.
- **eslint** on the G4 files: 0 problems.
- **G4 suites** (`node --test src/test/scripts/g4*.test.cjs`): 65/65 pass.
- **OpenSSL absent:** 59 skipped with the stated reason, 6 pass, 0 fail.
- **`npm run test:node`:** 1063 tests, 1045 pass, 0 fail, 18 skipped. No timing flakes.

## Owner-only boundaries

These are unchanged from iteration 1:
- no key is created;
- `enroll-tpm-key.ps1` is never executed;
- the tests use only the local TSA;
- the Judge contacted no TSA.

## Blocking

None.

## Non-blocking (deferred)

- **N-a.** The `granted` regex refuses RFC 3161 `grantedWithMods` tokens, which is fail-closed. Accept `Granted with modifications.` deliberately, or document the refusal.
- **N-b.** `--release` does not itself require `--trust-fingerprint`, `--trusted-head` or `--repository`, nor a clean tree. The docs require all of these for a release PASS. Consider enforcing them in code.
- **N-c.** N2 (`-attime` long-term validation) and N5 (working-tree reads) remain owner decisions 9 and 10.
- **N-d.** Rename the suite's swapped M06/M07 labels for traceability.

## Commands relied on

```
git ls-tree -r HEAD .qor/session; git log --all -- .qor/session/keys; sha256sum <plan>
node <scratch>/g4mut-run2.cjs <LF clone of 41d39e2e>   -> 32/32 caught
node <scratch>/g4mut-run3.cjs <clone> M32..M37         -> 5 caught, M32 survived
node --test src/test/scripts/g4*.test.cjs              -> 65/65
G4_OPENSSL=/nonexistent node --test …                  -> 59 skipped, 0 fail
node FailSafe/extension/scripts/g4-verify-checkpoint.cjs [--release …]  -> BLOCKED, exit 2
node razor.cjs …; npx eslint …; npm run test:node      -> 1063 / 1045 pass / 0 fail / 18 skip
```
