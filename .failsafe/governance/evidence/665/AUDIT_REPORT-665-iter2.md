# AUDIT REPORT: plan-v6013-665-g4-tpm-scripts (iteration 2)

- **Target commit**: `a6c0c7524986bf277234316ddc541333f5e8eb6c` (branch `fix/665-g4-tpm-scripts`, draft PR #666, issue #665)
- **Baseline**: `main` `5b7994a6b0a9f1c7d7348965b5f0569af2abc5b3`; iteration-1 audited commit `9b2a304d`
- **Plan**: `.failsafe/governance/plans/plan-v6013-665-g4-tpm-scripts.md` (iteration 2)
- **Prior verdict**: VETO, ledger Entry #964, `.failsafe/governance/evidence/665/AUDIT_REPORT-665-iter1.md`
- **Risk grade**: L2
- **Auditor**: fresh-context independent Judge, 2026-11-12
- **Verdict**: **PASS**

No blocking violation found. This PASS covers the scripts fix and its tests only. It is not an operational G4 PASS, it does not authorize a merge, and it is not a release decision.

## Scope reviewed

- `git diff 5b7994a6 a6c0c752`: 20 files. The code and doc changes are in `tools/g4/enroll-tpm-key.ps1`, `tools/g4/sign-checkpoint.ps1`, `FailSafe/extension/src/test/scripts/g4PowerShellScripts.test.cjs` (new), `g4Witness.test.cjs` (one test title), `docs/releases/G4_WITNESS_OPERATIONS.md` (one row) and `docs/META_LEDGER.md` (append only). The rest is governance records.
- `git diff 9b2a304d a6c0c752`: the iteration-2 delta. It rewrites the enrollment header, adds the ordering test and the Open-WitnessKey test, adds the uppercase-curve case, switches to `-ceq`, and updates the ops-doc row, the g4Witness title and the plan.

## Checks

### C1. Iteration-1 V1 closed (statements and ordering invariant)

Command: `grep -rn "enroll-tpm-key"` over the repository, excluding `.git` and the ledger. I also grepped `docs tools FailSafe/extension/src/test FailSafe/extension/scripts scripts .github` for "never run", "not executed by", "not run by" and "never invoked".

Result: every live statement is now accurate.
- The script header says automation never passes `-ConfirmPersistentTpmKey` and that the suite runs the script only without it.
- The ops-doc row says the same and adds "to check that it refuses before any key-provider call".
- The g4Witness test title reads "never run with -ConfirmPersistentTpmKey".
- The only remaining "never executed" wording is in historical records of #638: `.agent/staging/AUDIT_REPORT-638.md:101` and `.failsafe/governance/plans/plan-v6013-638-g4-witness.md:23`. Those are point-in-time records, not live statements (see N2).

The invariant is stated in the script header, and the order holds in the body. The body runs:
1. StrictMode;
2. the KeysDir resolution (`Join-Path` only);
3. the `-ConfirmPersistentTpmKey` refusal;
4. the `-OwnerApprovalRef` refusal;
5. the first `CngProvider` reference.

Mutation test. I made scratch copies under the session scratchpad, with the test's `REPO` pointed at a scratch tree. The worktree was never modified.
- m1: the `CngProvider` line moved above the confirm refusal.
- m2: the approval refusal moved below the `CngKey::Exists` block.

For m1 and m2 only the static ordering test was run (`--test-name-pattern`), so no mutated script was executed against the Platform Crypto Provider. Result: the ordering test FAILS on both ("both refusals precede the first key-provider reference") and passes on the unmodified copy.

### C2. Test-P256Key and signer refusals

Read `tools/g4/sign-checkpoint.ps1`. `Test-P256Key` returns true in two cases only:
- the algorithm equals `CngAlgorithm::ECDsaP256`; or
- the group is `ECDsa`, `KeySize` is 256 and `ECCCurveName`, decoded as UTF-16 with trailing NULs trimmed, is `-ceq 'nistP256'` (case-sensitive).

Every other key, and any property-read exception, is refused.

The signer diff against main is the new function plus the swapped check in `Open-WitnessKey` (20 changed lines). Unchanged:
- the key-existence refusal;
- the export-policy refusal (`ExportPolicy -ne None`);
- SHA-256 over the exact manifest bytes;
- the 64-byte P1363 length check;
- self-verification against the certificate before `WriteAllBytes`.

Probe results (base scratch copy): real P-256 accepted; real P-384 refused; generic ECDSA nistP256 accepted; generic ECDSA nistP384, brainpoolP256r1, no curve, `NISTP256` and RSA all refused.

Mutations:
- m5 (`-ceq` reverted to `-eq`): the probe test FAILS.
- m6 (`Open-WitnessKey` reverted to the strict `Algorithm -ne ECDsaP256` check, with `Test-P256Key` still defined): the Open-WitnessKey test FAILS.

So the new static test does detect `Open-WitnessKey` not using `Test-P256Key`. It is a source-text check, not an execution of `Open-WitnessKey` (see N3).

### C3. Test runs (from `FailSafe/extension`)

| Command | Result |
|---|---|
| `node --test src/test/scripts/g4PowerShellScripts.test.cjs src/test/scripts/g4Witness.test.cjs` | 14 tests, 14 pass, 0 fail, 0 skipped |
| `node --test src/test/scripts/g4*.test.cjs` | 163 tests, 163 pass, 0 fail (matches the plan's 163/163) |
| `node --test src/test/docs/*.test.cjs` | 145 tests, 145 pass, 0 fail |

Each new test against its original script. The scripts came from `git show 5b7994a6:tools/g4/<script>` into scratch copies; the worktree was not touched.
- m3 (original enroll): the binding/refusal test FAILS (the `Join-Path` binding error). The other tests pass.
- m4 (original signer): the Open-WitnessKey test and the P-256 probe test both FAIL.

As the plan states, the ordering test passes on the original enroll script, because the original already had the correct order. It guards against regression; it is not a defect test.

### C4. Owner key

I did not open, use, create or delete `FailSafe-G4-Ledger-Witness`, and `-ConfirmPersistentTpmKey` was never passed.

The suite's enroll run passes only `-OwnerApprovalRef` and refuses at the switch check. That is confirmed by its output ("Refusing: pass -ConfirmPersistentTpmKey"). The existing signer fail-closed test uses a nonexistent key name. Only ephemeral software CNG keys (P-256, P-384) were created, by the probe.

### C5. Plan overstatement, razor, ledger

- **Plan statements.** Checked against the code and the runs: the KeysDir change only, the Test-P256Key rule, the unchanged list, the 163/163 count, each new test failing on the original, and the V1/N1/N3 remediation. All match.
- **Not verifiable here:** "Real-key signing re-verified with the case-sensitive check". It needs the owner key, which this audit must not touch (N5).
- **Razor** (OK on every check):
  - Files: enroll 90 lines, signer 94, new test 94, all under 250.
  - Functions: `Test-P256Key` 10 lines, all others under 40.
  - Nesting: at most 2.
  - Nested ternaries: 0.
  - New dependencies: none.
  - Non-ASCII in the changed scripts, test and plan: none.
- **Ledger.** `git diff 5b7994a6 a6c0c752 -- docs/META_LEDGER.md` has 0 removed lines and only appends Entry #964. `python -I -m qor.cli verify-ledger --post-anchor` (from the worktree) reports "post-anchor clean (boundary=#382)", along with the two disclosed pre-anchor breaks at #340 and #382.

### Standard passes

| Pass | Result |
|---|---|
| Security | No placeholder auth, credentials or bypassed checks. Refusals are intact and fail closed. |
| Ghost UI | Not applicable: there is no UI. |
| Dependencies | None added. |
| Macro architecture | Changes are confined to `tools/g4` and its test. There are no new cross-module edges. |
| Orphans | The new test file sits under `src/test/scripts` and is picked up by the g4 glob and the node test runner. |

## Violations

None.

## Notes (non-blocking)

- **N1.** `docs/releases/V6_0_13_G4_OWNER_DECISION_RECORD_PROPOSED.md:105` still says the enrollment script was "not run". According to this plan, the owner has since run it once. The line is an owner-side status record outside this diff, and the plan defers the certificate and fingerprint record to a separate PR. It should be reconciled there.
- **N2.** `.agent/staging/AUDIT_REPORT-638.md:101` and `plan-v6013-638-g4-witness.md:23` still say "never executed". These are historical #638 records and were correctly left unedited.
- **N3.** Both static tests are source-text checks.
  - The ordering test enforces the order of the first `CngProvider`/`CngKey` substring, which also covers `CngKeyCreationParameters`. It would not catch a key-provider path through another API, such as `ECDsaCng` or `New-SelfSignedCertificate -Provider`. The header limits the invariant to `(CngProvider, CngKey)`, so the claim is not overstated.
  - The Open-WitnessKey test is a regex match, not an execution.
- **N4.** `node --test` runs the executable enroll test even when the static ordering test fails. If a future edit moved both refusals after key creation, running the suite on a TPM-equipped Windows host could create a key before the failure is read. The static test catches the regression, and the CI workflows reviewed do not run `test:node` on Windows. The residual risk is local only.
- **N5.** The plan's real-key verification claim was not reproduced, by design (C4).

## Worktree

The worktree was left as found: `git status --short` is empty. This report is untracked and matched by `.gitignore:11` (`.failsafe/`), so committing it needs `git add -f`, as was presumably done for the iteration-1 report. All mutations ran in scratch copies under the session scratchpad.
