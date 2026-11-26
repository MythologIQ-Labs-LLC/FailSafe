# Issue #696 substantiation: independent judge report

**Verdict**: PASS (Reality = Promise, with disclosures). Sealed at Entry #977.
**Judge**: fresh-context independent Qor-logic Judge (subagent). It authored none of the #696 change, plan, audit, line integration or qualification summary.
**Date**: 2026-11-17 (UTC)
**Session**: `2026-11-16T2154-926a3e`, passed explicitly to every call (`.qor/session/current` holds `2026-11-17T1649-2ecbdc`)
**Verified at HEAD**: `0ba78d5cd46dd9522632cb0ca990943c8e0099a6` on `fix/696-g4-fixture-cli-line`; tracked tree clean at start; base `origin/main` `0c0e30e042f628455c2a7f4d1287b5efd9d3ecfc`
**Sealed scope**: the #696 change `0c0e30e0..bafc818b574f87ef30272bf5b759e2d98d7c388d` (the test file plus its records). On this line it is the test commit `83460701` and the records commit `07edb4e7`.
**Plan**: `.failsafe/governance/plans/plan-696-g4-cli-fixtures.md`, LF sha256 `6b909cdfd573271a6df7c247d59c9909342e9cc39c01db7c02e41a19ceeaca01`. This equals the git blob, the plan gate `plan_content_hash`, the audit gate `target_content_hash` and the intent lock `plan_hash`. The CRLF working copy hashes to `ccbaec48...`, which is not a recorded value.
**Audit**: `.failsafe/governance/evidence/issue-696/AUDIT-PLAN-iter1.md`, PASS L3.
- Raw CRLF working-copy sha256 `b6530a3387f57b75971d4edb645595ec902f9829b762e4cd58083bafd1309476` equals the audit gate `report_content_hash`.
- LF sha256 `6d1ad5c1a232fefe1f82ffdcc5f3dafeb2b51d75f2fef19d9874090c9b575615` equals the git blob, the intent lock `audit_hash`, the unlanded Entry #972 and the Content Hash of Entry #976.
**Toolchain**: frozen qor-logic 0.176.1 (installed site-packages), Python 3.11, Node 22.23.5, npm 10.9.9. `QOR_SKILL_ACTIVE=substantiate`, `QOR_MODEL_FAMILY=claude`. Skill: installed `%USERPROFILE%/.claude/skills/qor-substantiate/SKILL.md`, sha256 `beb990124314e0ad06c5278522c22ae49738b3e1b6f03d367dd6f834201d5c67`, the same file as the #975 seal.

Verified facts and inferences are kept apart. Anything marked **Inference** is a judgment, not a measurement.

## 1. Carried records (procedure step 1)

| Check | Command | Result |
| --- | --- | --- |
| Carried records identical | `git diff --stat bafc818b 0ba78d5c -- <plan, 3 evidence files, .qor/gates/2026-11-16T2154-926a3e, test file>` | empty, exit 0 |
| Test file identical | `git rev-parse` of the blob at `0ba78d5c`, `83460701` and `bafc818b` | all `59abc40df6628018bb015a579c52490e4d9f1fa8` |
| Extension trees equal | `git rev-parse 0ba78d5c:FailSafe/extension` and `bafc818b:FailSafe/extension` | both `34d5aa4c64a1ec91b3da151225d976d588c47fd0` |
| Only product change against main | `git diff --name-only 0c0e30e0 HEAD -- FailSafe/ tools/g4 .github` | only `FailSafe/extension/src/test/scripts/g4Witness.test.cjs` |
| Unlanded ledger diff | `git diff 0c0e30e0 bafc818b -- docs/META_LEDGER.md` compared with `unlanded-ledger/entries-970-973.diff` | byte-identical |
| Unlanded index diff | same for `docs/GOVERNANCE_INDEX.md` compared with `unlanded-ledger/governance-index.diff` | identical after LF normalization |
| Unlanded fragments | `git diff --name-status bafc818b 0ba78d5c` | four `R100` renames from `.qor/ledger/fragments/consumed/` |
| Unlanded chain | frozen `ledger_hash.chain_hash` over #970 to #973 from #969 chain `9aecdbf5...` | 4 of 4 recompute; content hashes equal the research gate JSON, the plan, the LF report and RESULTS.md |
| Gate hashes | plan, audit and implement gate JSON | plan and report hashes as above; `source_revision` / `source_base` `0c0e30e0`; implement `source_file_sha256` `acb02750...` equals the CRLF working copy of the test file (blob LF `0c5aa911...`) |
| Sidecar digests | `gate_provenance.payload_digest` over the 8 gate JSON files | 8 of 8 match. HMAC not checked: no session key in this worktree, and none was read from elsewhere |
| `verify_committed` | `gate_provenance.verify_committed(.)` | ok, 0 mismatches (0 sessions at phase >= 158, vacuous) |
| `verdict_reconcile` | `--report AUDIT-PLAN-iter1.md --artifact audit.json --plan-digest 6b909cdf...` | 0 findings, exit 0. Negative control with a zero digest: 1 finding, exit 1 |
| Ledger tail | frozen `_tail_chain_hash` and `chain_hash` over #968 to #975 | tail `60702ba5d428bc8b408f1ee14e9fe38fc5b88aea4e259bf27b656ab6c408789b`; 8 of 8 recompute |

## 2. Forward record and rulings

### Forward record (Entry #976)

**Ruling**: the forward record is legitimate, and it is limited to the GATE verdict.

Entry #976 re-records the existing PASS L3, append-only:
- its Content Hash is the report's frozen `content_hash` (`6d1ad5c1...`);
- it states that it creates no new verdict;
- it cites `unlanded-ledger/`.

The precedent is Entry #974 for #698.

The research, plan and implement records are cited, not forward-recorded. Reasons:
1. The seal's interdiction (Step 2) needs a recorded PASS verdict. Only the GATE record carries one.
2. The other three are non-verdict process records. Their native gate artifacts are on this line with verifying digests, and their unlanded entries are preserved byte-identical with recomputing chains. The seal entry cites their hashes.
3. The unlanded IMPLEMENT entry #973 states `Verdict: BLOCKED`. Its cause, the missing glossary home, was removed by the #698 seal at Entry #975. Re-recording it verbatim would put a stale BLOCKED status on the live chain. Re-recording it with edited text would rewrite a historical record, which plan D3 forbids.
4. The #974/#975 precedent forward-recorded only the audit.

### Post-hoc intent lock

**Ruling**: acceptable, with disclosure. It is not a pre-implementation lock and is not claimed as one.

`.qor/intent-lock/2026-11-16T2154-926a3e.json` was captured on 2026-11-17 at 18:58:40Z, at head `07edb4e7`. That is after the implementation (implement gate 2026-11-17T00:37:31Z). `intent_lock verify` returns VERIFIED, exit 0.

The lock's purpose is to catch plan or audit drift between the PASS and the seal. That drift is ruled out independently of the lock:
- the audit gate artifact, whose digest verifies, binds `target_content_hash` to the current plan and `report_content_hash` to the current report's CRLF rendering;
- the plan and report blobs at `bafc818b` (the commit that holds both the PASS and the implementation) are identical to HEAD.

The lock therefore adds a seal-time binding and asserts nothing about the past. The #698 precedent is the same shape: lock captured 16:09:12Z after implement 16:06:50Z, disclosed in iter2 and accepted at #975.

**Disclosure**: the three #696 lock files are git-ignored (`.gitignore:12 .qor/`) and untracked. The #698 and #699 lock files on this line were committed. If the owner wants the lock on record, it must be force-added at commit time.

### Evidence reuse

**Ruling**: accepted, on tree identity. Line-level reruns added where cheap.

These hashes were verified read-only in the original worktree's `.failsafe/governance/evidence/issue-696/` (worktree HEAD `bafc818b`, tracked tree clean):
- `node-owner-qualification-current.log` `8dfecb26...`
- `ui-browser-qualification-current.log` `68ef7af7...`
- `package-host-current.log` `dd98ea60...`

All three equal `QUALIFICATION-LINE.md`.

Recorded results:

| Evidence | Result | Head record |
| --- | --- | --- |
| Node log | 1170 tests, 1161 pass, 0 fail, 9 skipped | none in the log |
| UI log | 264 passed, 4 skipped | none in the log |
| Package log | packaged `qualification-win32-x64.vsix` (191 files, 7.46 MB; sha256 `0deed757...`); four validate-vsix PASS lines | none in the log |
| Host run `default-82e045cc...` | 6164 passing, 23 pending, census 581/581, extension host exit 0, CLI exit 0 | `adopted-result.json` head `bafc818b` |
| Host run `default-7ee57700...` | 1 passing, exit 0 | `result.json` head `bafc818b` |
| Host run `architecture-index-f91f5227...` | see the null exitCode ruling below | `result.json` head `bafc818b` |

**Inference**: the node, UI and package logs record no head. Their binding to `bafc818b` rests on two facts:
- the logs date from 2026-11-17, 11:03 to 11:10 local, which is after the `bafc818b` commit (2026-11-16 19:48 -0500);
- the original reflog shows no HEAD move since.

Basis for reuse: the extension tree is byte-identical. Of the reused suites, only one test reads repository-root state that the line changed. That is the extension-host test `real-ledger timing row`, a performance bound under 10 s over the real ledger history, which is a few commits longer on the line. It was not rerun and is disclosed.

The judge reran on this HEAD: test:node, test:ui, lint, runner coverage, citation parity, compile, package and validate-vsix (section 4).

### Null exitCode in the architecture-index host run

**Ruling**: resolved, as a passing run with a launcher defect. Not a failure.

`result.json` has `"exitCode": null` and `outcome COMPLETED`. Its `stdout.log` ends with these lines:
- `19 passing (18s)`
- `census[architecture-index]: executed 5/5 (missing 0)`
- `Extension host with pid 50532 exited with code: 0`
- the test CLI's own `Exit code:   0`

The only `failing` match is inside a test title. The directory has no `invoke-cli.ps1` and no `cli-exit.txt`. Both later runs added that receipt wrapper, which captures `$LASTEXITCODE`. The null is a capture gap in the first launcher, not a test outcome.

### Pre-push gate

**Ruling**: the full `prepush-validate.ps1` is not a precondition of this governance seal. It remains a precondition of delivery (push), per the plan's own rule and the owner's local-validation policy.

Reasons:
1. The native substantiate skill does not list it.
2. The plan ties failures of mandatory validation to stopping delivery.
3. Every step of the gate now has evidence:
   - The judge ran `prepush-validate.ps1 -SkipTests` on this HEAD: exit 0. Branch policy passed; compile; release metadata v6.0.13; E2E gate skipped for governance; package; validate-vsix 4 PASS lines.
   - The judge ran the `test:all` components lint, runner coverage, citation parity, test:node and test:ui on this HEAD.
   - The extension-host component `npm test` is reused from `bafc818b`.
4. The full gate as one command has never completed. The only attempt stalled in the extension host. That is disclosed, and the owner must run it before any push.

### Hand registration in the governance index

**Ruling**: acceptable.

`07edb4e7` adds a `Last Reviewed` line and a Tier 4 row naming the plan and `.failsafe/governance/evidence/issue-696/`. That directory covers this report and the entry specs. The original `bafc818b` index edit is preserved verbatim in `unlanded-ledger/governance-index.diff`. The index is living metadata, not a historical record. The plan forbids hand-written gate JSON and record rewrites, not index edits. `CLAUDE.md` requires registration.

Native `governance-index --advance-last-reviewed 2026-11-17 --enforce` on a scratch clone at HEAD: exit 0, no diff. `--cross-check-ledger`: exit 0.

**Disclosure**: the line's text ends with "No seal at this entry". That was accurate when written. The native step can only advance dates, and the judge may not edit the index, so whether to add a seal note is the owner's choice.

## 3. Native `/qor-substantiate` steps

| Step | Command | Exit | Result |
| --- | --- | --- | --- |
| Preflight | `python -c "import qor.reliability"`; `qor-logic governance-health --profile skill-entry` | 0; 0 | importable; 8 surfaces OK |
| Merkle | `qor-logic verify-ledger --post-anchor` | 0 | post-anchor clean (boundary #382) |
| 0 | `gate_chain.check_prior_artifact("substantiate", session_id=SID)` | - | found `implement-iter1.json`, valid, errors [] |
| 2 | PASS verdict and implementation present | - | audit gate PASS L3; implement gate; Entry #976 |
| 2.5 | `version_applicability`, `parse_change_class` on the plan-gate path | - | governance, `is_release_class` False, version-not-applicable. `current_phase_plan_path()` raises `InterdictionError: Not on a phase branch` (host fact), so the plan path is taken from the plan gate |
| 3 | reality audit; `qor-logic scripts ledger_commitment --session SID` | 0 | D1 to D4 below; ledger_commitment OK, 3 artifacts |
| 3.5 | `docs/BACKLOG.md` Security Blockers | - | none open |
| 4 | test audit; presence-only gate | - | both new tests run the real CLI. 5 of 5 valid judge-written CLI mutants are killed (section 4). Visual Silence: not applicable (no UI change). `console.log`: 0 in the test file |
| 4.5 | skill files modified | - | none |
| 4.6 | `qor-logic scripts substantiate_gates` | 1 | default path `qor/skills/governance/qor-substantiate/SKILL.md` absent (host fact) |
| 4.6 | same with `--skill <installed SKILL.md>` | 0 | 10 gates parsed, order verified |
| 4.6 | `qor-logic reliability intent_lock verify --session SID` | 0 | VERIFIED (post-hoc lock; see ruling) |
| 4.6 | `qor-logic reliability skill_admission qor-substantiate` | 0 | ADMITTED |
| 4.6 | `qor-logic reliability gate_skill_matrix` | 0 | 32 skills, 156 handoffs, 0 broken |
| 4.6 | `qor-logic scripts session_id_lint` | 0 | clean |
| 4.6.5 | `secret_scanner --staged` | 0 | 0 findings over 0 staged files (vacuous) |
| 4.6.5 | `secret_scanner --files` over the 30 cycle files, 3 lock files and the index | 0 | 0 findings. Canary (2 synthetic secrets): BLOCK, 2 findings, exit 1 |
| 4.6.6 | `procedural_fidelity --session SID` | 0 | 0 findings |
| 4.6.7 | `dod_check --plan <plan>` | 0 | clean |
| 4.6.8 | `merge_velocity_check --window-days 7` | 0 | strained (31 PRs in window), narrow_scope |
| 4.6.9 | `skill_size_budget_lint` | 0 | 1 WARN (qor-substantiate 37.0 KB) |
| 4.6.10 | `data_api_acl_lint` | 0 | SKIP, no SQL migrations |
| 4.6.12 | `continuity_gate` | - | not applicable (no `execution_continuity` declared) |
| 4.6.13 | `install_drift_check --host claude --scope auto` | 0 | OK; scopes repo and global; drift 0 |
| 4.6.14 | `publication_boundary_lint --repo-root .` | 1 | 532 structural findings. See the boundary rule below; no #696 file is affected |
| 4.7 | `doc_integrity.run_all_checks_from_plan(plan gate, strict=True)` | - | None on the worktree and on `git archive HEAD`. Negative control on `git archive 0c0e30e0` raises the original `Orphan home: 'Vacuous pass'` ValueError, which was the #696 Step 4.7 blocker in RESULTS.md and is now cleared |
| 4.7.5 | `governance-index --advance-last-reviewed 2026-11-17 --enforce` (scratch clone at HEAD) | 0 | no change; cross-check exit 0 |
| 5 | Section 4 Razor | - | test file 163 lines (147 non-blank). New callbacks 3, 7, 8 and 7 lines; nesting <= 2; no nested ternary; no new helper, dependency or export |
| 6 | `docs/SYSTEM_STATE.md` | - | not edited: the cycle adds no src, test or doc file. `system-state-currency` passes inside test:node. `docs/releases/G4_WITNESS_OPERATIONS.md:183` is still accurate |
| 6 | `feature_index_verify --snapshot 2026-11-17T1600-7883c9` | 0 | 805 / 765 / 0 / 40. No snapshot directory exists, so the regression diff is vacuous |
| 6 | `feature_index_verify --surface-lint --session SID` | 0 | WARN FX922. Appended one event to `docs/PROCESS_SHADOW_GENOME.md` (uncommitted) |
| 6 | `ac_close_guard` | - | NOT EXECUTED: no planned PR body exists; this cycle closes no issue |
| 6.5 | `check_documentation_currency(implement, plan)` | - | 0 warnings |
| 6.8 | `hash_guard.require_toolkit_modules` + `validate_sha256` x4 | - | all 4 seal hashes valid before the append (merkle_seal = chain `b45a8f6d...`, content `6b909cdf...`, previous `d18b06aa...`). `hash_file` of the plan gives the raw CRLF `ccbaec48...`; the entry uses `ledger_hash.content_hash` (LF), as Step 6.8 specifies |
| 7.4 | SSDF | - | section 5 |
| 7.5, 7.6 | version bump, CHANGELOG stamp | - | skipped: governance, version-not-applicable; none made |
| 7 | append Entry #977 | 0 | section 6 |
| 7.7 | `seal_entry_check --ledger docs/META_LEDGER.md --plan <plan>` | 1 | `FAIL: no parseable latest entry`, after a WARN that the plan filename is not phase-tagged. The same result on the rehearsal copy (host fact, as at #968, #973 and #975). Content, previous and chain hashes were verified directly and by `verify-ledger` |
| 7.7 | previous-hash uniqueness | - | only the pre-existing #397/#401 pair |
| 7.7.5 | `seal_artifacts --write --dry-run` and `--check` (scratch clone) | 1, 1 | `agents root not found: .claude/agents` (host fact). The release-class check does not apply |
| Z | `gate_chain.write_gate_artifact("substantiate", ...)` with `ai_provenance.build_manifest(human_oversight=PASS)` | - | wrote `substantiate.json` and `substantiate-iter1.json` with sidecars; both payload digests verify; read-back verdict PASS, entry 977. The native write created a session key under `.qor/session/keys/` in this worktree (must not be committed) |
| 7.8 | `QOR_SKILL_ACTIVE=substantiate gate_chain_completeness --phase-min 52` | 0 | WARN: inspected 0 sessions (host fact). Gate artifacts validated directly |
| 7.9 | spec fold | - | no spec deltas declared |
| 8, 8.5, 9.5, 9.5.4, 9.5.5, 9.6, 9.7, 9.8 | cleanup, dist recompile, staging, commit, trailer check, tag, push/merge, tag push, session rotation | - | NOT EXECUTED (outside the judge's limits). The tag steps do not apply to this class |
| - | `qor-logic substantiate-capability` | 2 | `qor-substantiate SKILL.md not found` under the repository (host fact) |

### Boundary rule (Step 4.6.14)

The rule applied at #975: a finding in a file the cycle created or changed aborts; standing debt is disclosed. Checks:

- **Set comparison.** The full set comes from the module API, because the CLI prints only 200 findings. By (file, finding text), HEAD has 532 and `origin/main` has 528. HEAD minus main is 4 findings, all absolute local paths in `.failsafe/governance/evidence/issue-699/AUDIT-PLAN-iter1.md` and `-iter2.md`, which belong to the separately sealed #699 cycle. Main minus HEAD is 0.
- **#696 files at HEAD.** 0 findings.
- **Scratch copy** of exactly the 33 #696 files (30 tracked cycle files and 3 lock files), with `--no-git`: 0 findings.
- **Positive controls** in that copy, a synthetic absolute path in each of four files:
  - `.md` detected;
  - `.json` detected;
  - `.cjs` not detected;
  - `.snapshot` not detected.

  The native suffix list excludes `.cjs`, `.diff`, `.snapshot` and `.provenance`.
- **Direct scan** of those 13 files with the module's own `scan_text`: 0 absolute paths. One `foreign repository URL: MythologIQ-Labs-LLC/FailSafe` at `unlanded-ledger/entries-970-973.diff:6`. That line is diff context, a verbatim copy of the Entry #969 decision line, which is standing debt at `origin/main` `docs/META_LEDGER.md:36731`. The URL is this repository's own public release URL; the native lint treats it as foreign relative to the Qor-logic pack.
- **#698 precedent.** The #698 unlanded diff carries the identical line, and #975 sealed with it.

**Ruling**: not an abort. The native gate reports 0 findings in #696 files, and the one supplemental finding is a byte-for-byte copy of already-published standing debt, not a new exposure. It is disclosed for the owner.

This report and the two entry specs are scanned after writing (section 8).

## 4. Reality versus promise: the judge's own results

All runs used Node 22.23.5 / npm 10.9.9, with the HEAD above checked out.

| Command | Exit | Result |
| --- | --- | --- |
| `node --test FailSafe/extension/src/test/scripts/g4Witness.test.cjs` | 0 | 11 tests, 11 pass, 0 fail, 0 skip |
| `node --test <all 15 g4*.test.cjs, explicit list>` | 0 | 164 tests, 164 pass, 0 fail, 0 skip (146 s) |
| red-before: the `0c0e30e0` test file on a scratch clone of HEAD | 1 | 10 tests, 9 pass, 1 fail (`the CLI never reports PASS for the real repository, which has no witness yet`); reproduces the research baseline |
| `npm run test:node` (extension directory) | 0 | 1170 tests, 109 suites, 1161 pass, 0 fail, 9 skipped (172 s) |
| `npm run test:ui` (run 1) | 1 | 263 passed, 1 failed, 4 skipped. The failure is `FX589 Bicameral Advanced-tools: expand Advanced tools -> invoke dashboard -> result area populates`: `details.cc-bicameral-advanced` not visible within 5000 ms |
| `npx playwright test src/test/ui/bicameral-advanced-tools.spec.ts --repeat-each=5` | 0 | 5 passed |
| `npm run test:ui` (run 2, the single rerun) | 0 | 264 passed, 4 skipped. This equals the `bafc818b` result. **Inference**: FX589 is a load-dependent timing flake. Its spec uses a served temp workspace, and the extension tree is identical |
| `npm run lint` | 0 | 0 errors, 136 warnings |
| `npm run test:runner-coverage` | 0 | 762 files, all claimed |
| `npm run test:citation-parity` | 0 | 46 plans, structure clean |
| `tools/reliability/prepush-validate.ps1 -SkipTests` | 0 | see the pre-push ruling |
| `scripts/validate.ps1` | 0 | VALIDATION PASSED: isolation, security, branch policy, release version coherence 6.0.13, docs coherence |

### Mutants

The judge wrote these mutants of the CLI on a scratch clone at HEAD. The worktree was never modified. Every mutant was restored after its run.

| Mutant | Result |
| --- | --- |
| M1: BLOCKED maps to exit 0 | test 8 fails |
| M2: diagnostic label without `NOT release evidence` | test 9 fails |
| M3: PASS maps to exit 2 | test 9 fails |
| M4: the `NO_CHECKPOINTS` block removed in `verify.cjs` | test 8 fails |
| M5: an extra `PASS OK` line is printed | test 8 fails (the `doesNotMatch` guard) |

Two further runs are excluded from the count:
- a `sed` that did not apply (0 substitutions, a no-op);
- a shell-escaped edit that produced a SyntaxError.

Neither is reported as a survivor.

### G4 checkpoint

`node FailSafe/extension/scripts/g4-verify-checkpoint.cjs --repo-root .` exits 0:

```text
[g4-verify] ok g4-000001 commit 9defb9510ffd ledger 2546740 B token 2026-11-13T00:01:49.000Z (not revoked)
[g4-verify] mode: diagnostic (NOT release evidence)
[g4-verify] limitation: checkpoint head is not externally anchored; truncation of the newest checkpoints and ledger tail is undetectable
[g4-verify] PASS OK: 1 checkpoint(s) verified to g4-000001
```

This is the reason the old ambient assertion went stale: the real repository is now witnessed. The diagnostic PASS is not release evidence and is not claimed as such.

### Mandatory denial cases

All of these pass in the unchanged suites (no extension file other than the test changed):
- tampered checkpoint or ledger prefix (`PREFIX_BROKEN`; edited Verdict via history rewrite `COMMIT_MISSING`; replace ref; `--release` working-tree swaps);
- wrong TSA root (`TSA policy root fingerprint does not match`; policy not selected BLOCKED);
- detached or modified seal (the record is edited after signing; the rotation is bound to another manifest);
- unanchored chain (the baseline names its unanchored head; a deleted head is refused with a trusted head; `--release` without trustedHead BLOCKED);
- missing files (missing token BLOCKED; rotation record without token; no checkpoints BLOCKED);
- invalid signer or rotation (wrong key; a different pinned key; revoked key; rotations signed by the wrong key, for another repository, after expiry, or to an unreached key).

### Definition of Done

- **D1 met.** Exit 2 with `BLOCKED NO_CHECKPOINTS` and no PASS for a disposable unwitnessed repository. Exit 0 with `PASS OK` and the diagnostic label for a disposable witness.
- **D2 met.** Only `g4Witness.test.cjs` changes in product or test source. `g4Scenario.cjs` is reused unchanged.
- **D3 met, with disclosures.** Native research, plan, audit and implement artifacts exist, with 8 of 8 digests verified; there is no hand-written gate JSON; no historical record is rewritten (the unlanded records are preserved); this seal is native. The intent lock is post-hoc and untracked.
- **D4 met, with disclosures.** The CLI assertions are exact, the tamper refusals are unchanged, and targeted and full local validation is recorded on the extension tree being submitted. The extension host is reused at `bafc818b` with the identical tree. The single-command pre-push gate never completed and remains a delivery precondition.

**Unplanned files**: governance records only:
- the issue-696 evidence files (`QUALIFICATION-LINE.md`, `unlanded-ledger/`, `local-only/` (git-ignored), this report, two entry specs);
- the gate and intent-lock files;
- Entries #976 and #977;
- one native process event in `docs/PROCESS_SHADOW_GENOME.md`.

## 5. Step 7.4 SSDF

- **Negative control.** `qor-logic scripts ssdf_tagger --change-class governance --base-ref origin/main --repo-root .` exits 2 (`invalid choice: 'governance'`) with empty stdout.
- **Scope.** `git diff --name-only 0c0e30e0 bafc818b`: 29 files (the test file, plan, 3 evidence files, 17 gate files, 4 ledger fragments, `.qor/session/current`, `docs/GOVERNANCE_INDEX.md`, `docs/META_LEDGER.md`).
- **Line.** The pinned frozen tagger (`qor/scripts/ssdf_tagger.py` sha256 `055cfec8cd3ee582bc20ed65cc0b5bdf1e7ff227de1ef745bd0abba53e7c166a`, verified before use), called as `format_tag_line(compute_tags("governance", files))`, gives `**SSDF Practices**: PS.2.1`. The equivalent scope `78a82997..07edb4e7` (test plus records on this line, 29 files) and the test file alone give the same line.
- **Reproduction.** `python -I tools/governance/ssdf_governance_emit.py --change-class governance --base-ref 0c0e30e0 --repo-root <scratch clone checked out at bafc818b>` exits 0 with the identical line.
- **Independent recomputation.** The frozen `_CLASS_RULES` has no entry for `governance`. None of the 29 paths matches any of the 12 frozen `_PATTERN_RULES` (qor/skills, qor/scripts, qor/reliability, qor/policies, qor/references/doctrine-, PROCESS_SHADOW_GENOME, ^tests/test_). `include_seal` adds `PS.2.1`. Without it the set is empty.
- **No release class** was used.
- **Disclosure.** The `PROCESS_SHADOW_GENOME.md` event this substantiation appended is outside the sealed scope. If counted, it would add RV.1.1 and RV.1.2, the same disclosure as at #973.

## 6. Ledger appends

The tool is the tracked `.failsafe/governance/evidence/issue-699/append_entry.py`, read first. It uses the frozen `render`, `_tail_chain_hash`, `content_hash`, `chain_hash` and `assert_sealable_text`, checks the expected previous hash and the tail number, and confirms the old file is a byte prefix of the new one.

### Rehearsal

On a copy of the ledger: #976 appended, and `verify-ledger --ledger <copy> --post-anchor --boundary 382` reports post-anchor clean, exit 0. The real append is byte-identical to the rehearsed copy.

Corrupted copies all failed:

| Corruption | Result |
| --- | --- |
| C1: #976 content hash flipped | exit 1 |
| C2: #976 chain hash flipped | exit 1 |
| C3: #976 previous hash pointed at #974 | exit 1 |
| C4: #975 content hash altered | exit 1 |
| C5: wrong `--expect-previous` | refused, copy untouched |
| C6: re-append of the same number | refused |

#977 was rehearsed on a fresh copy after #976 landed: post-anchor clean, exit 0. Then:
- C7 (#977 chain hash flipped): exit 1.
- C8 (#977 content hash flipped): exit 1.

The real #977 append is byte-identical to the rehearsed copy.

### Entries

| Entry | Content Hash | Previous Hash | Chain Hash |
| --- | --- | --- | --- |
| #976 GATE TRIBUNAL forward record | `6d1ad5c1a232fefe1f82ffdcc5f3dafeb2b51d75f2fef19d9874090c9b575615` (report, LF) | `60702ba5d428bc8b408f1ee14e9fe38fc5b88aea4e259bf27b656ab6c408789b` | `d18b06aa461f76d337615dc737baab27ce12aaa4dfae4a49cf09452ca0e89c99` |
| #977 SESSION SEAL | `6b909cdfd573271a6df7c247d59c9909342e9cc39c01db7c02e41a19ceeaca01` (plan, LF) | `d18b06aa461f76d337615dc737baab27ce12aaa4dfae4a49cf09452ca0e89c99` | `b45a8f6da2cd786621929ab76794759ccba6473fec2d481fdbf2a6c364591a20` |

**#977 fields**:
- Timestamp `2026-11-17T19:27:59Z`.
- Entry ID `9f5981bc03cd`, from `entry_id.derive_entry_id(ts, "SUBSTANTIATE", content_hash)`. The method reproduces #975's `73999cbbec7d`.
- SSDF `PS.2.1`.
- Feature Inventory 805 / 765 / 0 / 40.

**Ledger bytes**:

| | sha256 | length |
| --- | --- | --- |
| Before | `99150119f009103a8bfc78cfa4ebb710421e2238336e9e92aa42b1e0a26805dd` | 2614381 |
| After #976 | `947d8435f4862524e04e1acccbeb294d600a103a5f7acbb6470443a7f716832f` | 2617638 |
| After #977 | `905ec438f2a1df9269f969077dfd273d5d4510a264c926be0f98a242c6f405bd` | 2625554 |

`git diff --numstat docs/META_LEDGER.md` gives 43 added and 0 removed lines. The added text is ASCII, and `scan_text` finds 0 boundary findings in it.

**Specs**:
- `.failsafe/governance/evidence/issue-696/entry-976-spec.json`
- `.failsafe/governance/evidence/issue-696/entry-977-spec.json`

## 7. Closing checks

| Command | Exit | Result |
| --- | --- | --- |
| `qor-logic verify-ledger --post-anchor` | 0 | post-anchor clean (boundary=#382) |
| `qor-logic governance-health --profile skill-entry` | 0 | 8 surfaces OK |
| `node FailSafe/extension/scripts/check-architecture-index.cjs --repo-root .` | 0 | PASS (49 registry rows, 13 normative globs, 42 normative documents, 7 legacy prefixes, 2994 tracked files) |
| `powershell -NoProfile -ExecutionPolicy Bypass -File tools/reliability/validate-docs-coherence.ps1 -RepoRoot .` | 0 | Docs coherence validation passed |

## 8. Files left uncommitted

Tracked and modified:
- `docs/META_LEDGER.md` (Entries #976 and #977, append-only)
- `docs/PROCESS_SHADOW_GENOME.md` (1 native surface-lint event)

New and git-ignored (`.gitignore` lines 11 and 12 cover `.failsafe/` and `.qor/`). These must be force-added at commit if they are to be recorded, as #698 and #699 did:
- `.failsafe/governance/evidence/issue-696/SUBSTANTIATE.md`
- `.failsafe/governance/evidence/issue-696/entry-976-spec.json`
- `.failsafe/governance/evidence/issue-696/entry-977-spec.json`
- `.qor/gates/2026-11-16T2154-926a3e/substantiate.json`, `substantiate.provenance`, `substantiate-iter1.json`, `substantiate-iter1.provenance`
- the three pre-existing ignored `.qor/intent-lock/2026-11-16T2154-926a3e.*` files

Must **not** be committed:
- `.qor/session/keys/` (session HMAC key created by the native gate write)
- `.failsafe/governance/evidence/issue-696/local-only/` (pre-existing; holds absolute paths)
- `FailSafe/extension/prepush-host.vsix`
- `FailSafe/extension/test-results/`

The test file, plan, reports, qualification summary, existing ledger entries, `docs/GOVERNANCE_INDEX.md`, site-packages and other worktrees were not modified.

## 9. Not executed

- Extension-host `npm test` on this HEAD: reused from `bafc818b`, with the identical extension tree. It stalled once earlier, and a rerun risks the operator's editor host.
- The full single-command `prepush-validate.ps1` (without `-SkipTests`) and `test:all` as one command.
- `ac_close_guard`: no PR body exists.
- HMAC verification of the sidecars: no session key in this worktree.
- Staging cleanup, dist recompile, staging, commit, trailer check, tag (not applicable), push, merge, tag push (not applicable) and session rotation.

## 10. Owner decisions

1. Whether to force-add the three git-ignored #696 intent-lock files at commit, as #698 and #699 did.
2. Whether to append a seal note to the #696 `Last Reviewed` line, which still says "No seal at this entry".
3. Running the full `prepush-validate.ps1` before any push. This seal is not a delivery approval.
4. The standing boundary debt:
   - the 4 absolute paths in the #699 audit reports;
   - the self-repository URL flagged as foreign, which now also appears in both unlanded diffs;
   - the native suffix gap that leaves `.cjs`, `.diff`, `.snapshot` and `.provenance` unscanned.
5. Whether the uncommitted `PROCESS_SHADOW_GENOME.md` event is committed with the seal (it would add RV.1.1 and RV.1.2 to an SSDF count).
6. Carried from #975: the landing order of the line, and standing use of the emitter for governance-class SSDF lines.
7. Whether to track the FX589 UI flake (one 5 s visibility timeout under full-suite load, then 5 of 5 alone and 264/264 on the rerun).
8. Excluding `.qor/session/keys/` from any force-add of `.qor/`.
