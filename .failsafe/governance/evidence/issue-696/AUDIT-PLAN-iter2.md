# AUDIT REPORT

**Tribunal Date**: 2026-11-26T00:08:27Z
**Target**: `.failsafe/governance/plans/plan-696-g4-witness-fixtures.md` (iteration 2, raw sha256 49019d3a53590799959d0ce005fd28edc66abc7decf880b4915a0a07ddbff50d, equal to the plan gate `plan_sha256`; supersedes iteration 1 (2c6de0de...), preserved at `evidence/issue-696/plan-iter1.md` with that hash)
**Scope audited**: baseline origin/main 0550c4135c1d6d29aa03b2107f7b16aa78d08422; candidate e32bb62f6f373a9eb4dab872d45b720f0ca5baf0, unchanged since iteration 1 (HEAD is e32bb62f; origin/main..HEAD is still one file, +32/-6)
**Session**: `2026-11-25T2335-247ff7`. The plan gate `plan.json` is byte-identical to `plan-iter2.json` (iteration 2, `supersedes_plan_sha256` 2c6de0de...).
**Audit scope**: a closure re-check of iteration-1 grounds V1-V3 and note N1 (Entry #992), plus a regression check, under the bounded-claim rule
**Risk Grade**: L3
**Auditor**: The Qor-logic Judge, the same subagent that issued Entry #992. It authored no plan, candidate, matrix or map. The H5 probe is the Judge's own iteration-1 script, adopted by the Governor and checked here as identical. Mode: solo. `audit_risk_score`: option_b_required false.
**Tooling**: qor-logic 0.176.1 as installed and unmodified; QOR_SKILL_ACTIVE=audit, QOR_MODEL_FAMILY=claude; Windows 11 Pro 10.0.26300; OpenSSL 3.5.7; Node v22.23.5 (verified binary below) and v24.19.0

---

## VERDICT: PASS

---

### Executive Summary

V1, V2, V3 and N1 are closed in fact. Nothing regressed.

- **V1 closed.** H3 is bound to Node v22.23.5, and I re-ran it on that binary myself: main is red (10 tests, 9 pass, 1 fail, the stale real-repository test) and the candidate is green (11/11). The binary's provenance re-verifies against nodejs.org's SHASUMS256.
- **V2 closed.** Row H5 claims teardown safety. I first confirmed that the committed probe is identical to my iteration-1 script. I then ran three of my own guard mutants through it:
  - G1 (dirname assertion dropped): killed.
  - G2 (prefix assertion dropped): killed.
  - G3 (realpath removed): equivalent for the claimed safety property, because outside contents are kept anyway.
  The buildBase-throws-after-mkdtemp leak is now listed under Not claimed.
- **V3 closed.** Row H6 claims clone-depth and OS independence. A depth-1 clone of the candidate under Node 22 gives 11/11. Main's own tree differs only by clone depth (verified tree identity), which shows the defect's clone-depth shape. The Linux leg is a D4 condition for substantiation. macOS is under Not claimed. Windows plus Linux meets "across OSes".
- **N1 closed.** REFUSED-verdict behaviour is under Not claimed, and the plan attributes it to the wider G4 suites. My iteration-1 run confirmed that those suites kill J7, J8 and J11.

No surviving non-equivalent mutant violates a listed row. No #696 acceptance criterion is omitted.

### Preflight and Step 0

- `governance-health --profile skill-entry`: 8/8 OK.
- Prior artifact: valid.
- `plan_iteration_status_lint`: rc 0.
- Step 0.4: should_skip false (new hash 49019d3a...).
- Step 0.5: `cce.check` and `cce.check_session_total` both None.
- Explicit plan path, as in iteration 1.
- Lints: plan_test_lint, plan_text_consistency_lint, plan_feature_tdd_lint and plan_enumeration_lint are clean. plan_grep_lint truth-checked 0 citations. The iteration-1 repo-wide WARN set is unchanged.
- Prompt Injection: rc 0.
- Version-Applicability: SKIP (no pyproject.toml; Qor-logic #534). Manual check: hotfix, test-only, no bump; 6.0.13 = v6.0.13.
- Ledger: Entry #992's chain hash 77b5a1bf... is the previous hash for this entry.
- Plan delta from iteration 1: the iteration number; an Iteration history section; LD2 (Node versions); H3 rewritten; H5 and H6 added; Not claimed and D4 extended. The gate adds `supersedes_plan_sha256` and one limitation. Every other line and gate field is unchanged.

### Empirical method

- Scratch checkouts under the Judge scratchpad, removed afterwards:
  - a worktree detached at 0550c413 (full history);
  - `git -c core.longpaths=true clone --no-local --depth 1 -b fix/696-g4-witness-fixtures`, which gave HEAD e32bb62f with 1 commit.
- The candidate's full-history run used the pr696 worktree itself.
- Guard mutants (`jguard696.py`) edited `g4Witness.test.cjs` one at a time, ran the committed `teardown696-probe.py`, and restored the file. sha256 of g4Witness.test.cjs, g4Scenario.cjs, g4-verify-checkpoint.cjs and lib/g4/verify.cjs all re-checked OK.
- Every leaked probe fixture and decoy was removed by literal path.
- `git status`: only `.qor/session/current` and the governance appends. wt696, wt703, wt721 and jsub-* were not touched.

| Check | Result | Plan statement |
| --- | --- | --- |
| Node 22 provenance | zip sha256 4a191082... equals the live `nodejs.org/dist/v22.23.5/SHASUMS256.txt` entry; the extracted node.exe 247e9693... equals `node.exe` read from the zip; `--version` v22.23.5 | H3 |
| Red, Node 22, 0550c413 full history | 10 tests / 9 pass / 1 fail ("the CLI never reports PASS for the real repository...") | H3, LD2 |
| Green, Node 22, e32bb62f full history | 11 / 11 | H3, H6 |
| Green, Node 22, e32bb62f depth-1 clone (1 commit) | 11 / 11 | H6 |
| Tree identity for the matrix's depth-1 main row | 8dce7f54^{tree} = 0550c413^{tree} = 981740d6 | NODE22-MATRIX |
| Node 24 red/green (iteration 1) | 10/9/1 and 11/11 | LD2 "alike" |
| `teardown696-probe.py` vs the Judge's `jteardown696.py` | identical after CR stripping | H5 |
| `teardown696.txt` | T1-T3 refused with sentinel kept; T4 deleted (matches the Judge's iteration-1 output) | H5 |
| Guard mutant G1 (dirname assertion dropped) | KILLED: T1's sentinel lost | H5 |
| Guard mutant G2 (prefix assertion dropped) | KILLED: T2's sentinel lost | H5 |
| Guard mutant G3 (`scenario.work` instead of `realpathSync.native`) | Equivalent for H5's safety content. T3's guard does not fire, but `rmSync` removes only the junction, and the outside target's sentinel and contents are kept. | H5 "contents kept" |
| T4 control | the whole `g4-falsify-jdecoyD` root is gone, including the `.git` object files of its `unwitnessed` and `case-1` repositories | H5 "read-only object files" |
| Candidate source | unchanged (HEAD e32bb62f); iteration-1 results stand: mutants696 M1-M7 KILLED, J1-J6, J9, J10 KILLED | H1, H2, H4 |

### Closure of the iteration-1 grounds and note

| Ground / note | Status | Evidence |
| --- | --- | --- |
| V1 (Node 22) | Closed | H3 (plan:62) and LD2 (plan:39) name Node v22.23.5. Red and green were reproduced on that verified binary. |
| V2 (teardown) | Closed | H5 (plan:63). The probe is identical; T1-T3 refused and T4 deleted. G1 and G2 killed; G3 equivalent. The buildBase leak is under Not claimed (plan:69) and in the gate limitations. |
| V3 (clone depth / OS) | Closed | H6 (plan:64): full and depth-1 under Node 22 reproduced 11/11. Linux depth-1 CI is a D4 condition (plan:73). macOS is under Not claimed. |
| N1 (REFUSED) | Closed | Not claimed (plan:69). J7, J8 and J11 are KILLED by the 15 G4 suites (iteration 1). |
| N2-N4 | Unchanged, non-blocking | - |

### Audit Results

| Pass | Result |
| --- | --- |
| Security (L3) | PASS. Unchanged candidate; test PKI only; no owner key or TPM key. |
| OWASP Top 10 | PASS. List-form `spawnSync`; teardown fails closed (g4Witness.test.cjs:34-37). |
| Ghost UI | PASS (no UI). |
| Section 4 Razor | PASS. File 163 lines; added bodies 3 / 7 / 9 / 7 lines; nesting <= 2; 0 nested ternaries. |
| Self-Application (FailSafe #696) | PASS. The claim table now carries every #696 acceptance qualifier: runtime, teardown, clone depth and OS. |
| Test Functionality | PASS. H1 and H2 invoke the real CLI and assert on exit code and output. H5's probe runs the real suite against decoys and asserts on sentinels. |
| Dependency | PASS. Node built-ins. The Node 22 runtime is a verified local binary used only for evidence; PATH is unchanged. |
| Orphan | PASS. The suite is discovered by test:node. |
| Macro-Level Architecture | PASS. Unchanged. |
| Feature Test Coverage | PASS. Unchanged row with a behavioural descriptor. |
| Infrastructure Alignment | PASS. LD1-LD3 re-walked. Every cited evidence file exists: NODE22-MATRIX.md, teardown696-probe.py, teardown696.txt, plan-iter1.md (sha256 2c6de0de... as stated). |
| Filter-Stage Ordering | n/a. |
| #696 acceptance-criteria coverage | PASS. Step 1: H1 + H5. Step 2: H2. Step 3: H4, plus the REFUSED behaviour disclosed as covered elsewhere. Step 4: H3 + H6. Step 5: H3 + D4. Step 6: the owner GO before push or merge remains (N4). |

### Non-blocking notes

- **N5**: Under G3, the realpath step adds no observable safety on this host, because Node's `rmSync` does not traverse a junction. H5 holds either way. The probe cannot show that realpath itself is necessary.
- **N6**: The probe runs `node` from PATH (v24.19.0). Teardown is not version-sensitive, and H5 does not claim a runtime.
- **N7**: H6's Linux leg and D4's full local gate are still future evidence, owed at substantiation. The Judge did not run test:node, npm test, lint or prepush-validate.

### Documentation Drift

<!-- qor:drift-section -->
(clean) `doc_integrity.render_drift_section` returned an empty string.

## Process Pattern Advisory

<!-- qor:veto-pattern-advisory -->

No repeated-VETO pattern detected in the last 2 sealed phases.

### Verdict Hash

SHA256(this report, LF-normalized) is recorded in META_LEDGER Entry #993. The gate artifact `.qor/gates/2026-11-25T2335-247ff7/audit-iter2.json` records the plan path and verdict.

Judge scripts and outputs are in the Judge scratchpad and are not committed evidence: `jguard696.py`, `jguard696.txt`.

---
_This verdict is binding. Gate OPEN. Next phase: `/qor-implement`, recording e32bb62f as the implementation without change. D4 (Node 22 red/green on the committed head, mutation map and teardown probe re-run, full local gate, exact-head CI including H6's Linux leg) and the owner GO remain conditions for substantiation and merge._
