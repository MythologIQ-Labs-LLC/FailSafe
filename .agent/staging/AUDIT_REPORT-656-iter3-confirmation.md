# /qor-audit: PR #656 iteration 3, bounded confirmation check (#651 ArchitectureLinks bounded-I/O verdict)

## 1. Scope statement

**This is a bounded confirmation check, not an open-ended audit.** It checks only three things: the fixes for the blocking findings V1 and V2 of the previous independent audit (Entry #951), the non-blocking fixes the author claims (N2, N3, N4, N6, N7, N8), and a regression re-run. Any new, demonstrable defect is still blocking.

- Repository: MythologIQ-Labs-LLC/FailSafe, PR #656 (draft, open), branch `fix/651-architecturelinks-bounded-io`.
- **Audited head: `fcb16f682cd06aec601baca8758438ee623c3088`**, checked with `gh pr view 656 --json headRefOid`. The previous audited source was `060a09fa`. Between the two are `61510608` (records the VETO as Entry #951) and `fcb16f68` (the fix).
- Scope base: `origin/main` = `54724e0180c0dcf33bf3a34f46a6b4b9a3dc475c`, which is an ancestor of the head. Coverage base: `9f16548d`, whose `ArchitectureLinks.test.cjs` blob `0c329d82` is identical on `origin/main`.
- Environment: Windows 11, 16 logical CPUs, Node v22.23.4.
  - I used my own detached worktree, `%TEMP%\j656iter3wt`, with `node_modules` junctioned to FailSafe-g4.
  - I ran `npm run compile`. The tests ran against `out/governance/architecture/affectedArchitecture.js`.
  - The Linux evidence is CI run 43148402279 on the exact head.
- Auditor: an independent judge. I wrote neither the code nor any earlier audit. I reused the previous auditor's `plant2.cjs`, `mutants2.cjs`, `cov.cjs` and `razor2.cjs` after reading them. For `mutants3.cjs` I re-anchored M22 to the new loop and added M36 to M39. Every number below comes from my own runs or from the CI log of the exact head.

## 2. Verdict: VETO (records only, mechanical to fix)

**Every technical criterion holds.**
- V1 is fixed. In 250 random-phase trials the stall never ran under 200 ms. In 30 suite runs plus CI, every stall control held the loop for at least 204.5 ms.
- V2 is fixed.
- M05 and M17 are now killed.
- The N6 guard fails clearly.
- There is no regression in the planted set or the mutation set.
- The suites passed 20/20 idle and 10/10 under load.
- Linux CI on the exact head is green, with the run-queue mode active and every control behaving correctly.

The verdict is VETO only because criteria 3 and 7 require the records to be true, and three statements are demonstrably false or unsupported:

- **R1:** Ledger Entry #951's Decision says "26 planted blocking variants ... fail 5 of 5". The report it hashes (`AUDIT_REPORT-656-iter2.md`, section 6) has 29 variants: 25 fail 5/5 and 4 pass.
- **R2:** Plan iteration 3 repeats "26 planted blocking variants failed".
- **R3:** The plan's N8 fix says "On the same 32-process load the real function's worst turn was then 27 to 54 ms" and cites `.agent/staging/evidence-651/probe-windows-load32-priority.txt`. That file shows 27.1 to 48.3 ms. The plan then says "the under-load figure has committed raw output". The cited raw output does not show the stated figure.

Remediation is wording only:
- Correct the plan (25; 27.1 to 48.3 ms, or cite the file that shows the upper value).
- Record a clarification of #951's count in the next ledger entry (#951 is immutable).

No code change is needed.

## 3. Criteria table

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | V1 fixed | **PASS** | See the V1 details below this table. |
| 2 | V2 fixed | **PASS** | I extracted the committed blobs into scratch, outside `.agent`, and ran ESLint 8.57.1 `--no-eslintrc` with `max-depth:3`, `max-lines-per-function:40`, `max-lines:250` and `no-nested-ternary`. Exit 0 on all 8 files. Positive control: the `060a09fa` `falsify.cjs` reports `42:7` and `44:7` depth 4. AST walker results: `falsify.cjs` 58 lines, longest function 15, nesting 2; `probe.cjs` 38/20/1; `stall200.cjs` 9/1/2. |
| 3 | Non-blocking fixes real | **PARTIAL (fails on N8 wording, R3)** | See the details below this table. |
| 4 | No regression | **PASS** | Section 5. The planted set (29 variants × 5 runs) matches iteration 2 on 28 rows. `cpu150_random50` passed 1/5: in that run no stall was drawn (worst turn 32.5 ms, CPU 30; the chance of no draw over 5 calls is 1/32). 30 traced re-runs: the stall fired in all 30 and all 30 failed. Mutation set: every mutant killed at iteration 2 is still killed. M05 and M17 changed from survived to killed. |
| 5 | Repeatability | **PASS** | See the details below this table. |
| 6 | Scope, razor, coverage | **PASS** | `git diff --name-only origin/main...HEAD`: 0 files outside the test directory, `.agent/**`, `.qor/**`, the plan and `docs/META_LEDGER.md`. No production source and nothing under `.github/`. Razor (committed blobs): `boundedIo.test` 132 lines/17/1, `eventLoopOracle` 129/18/2, `ArchitectureLinks.test` 132/34/1, `registry.test` 153/32/2, `architectureFixtures` 87/6/2. Coverage: 11/11 base tests are IDENTICAL byte for byte; the bounded test was replaced; 4 tests are new; the total is 16. |
| 7 | Records true | **FAIL (R1, R2)** | See the details below this table. |
| 8 | Linux CI on exact head | **PASS** | Section 6. |

**Criterion 1 (V1 fixed), details:**
- I copied `burnMainThread` verbatim (lines 30 and 50 to 54) into `iter3/burn3.cjs` and used the shipped `threadCpuMs`.
- **Idle, 150 trials at a random clock phase:**
  - burn wall time: min 203.1, p05 204.8, median 212.1 ms; 0 below 200;
  - inside an oracle `measure()`, the burn's wall time: min 202.0 ms;
  - worst-turn held time: min 205.6 ms; 0 below 200.
- **Under 32 busy processes, 100 trials:** wall time inside `measure()` min 202.1 ms; held min 205.6 ms; 0 below 200.
- **Harness control:** the pre-fix loop reproduces V1 (min 186.5 ms; 74/100 below 200).
- **Suite:** over 30 runs (idle ×20, load ×10), the stall controls' worst held time was: every call 211.4 ms minimum, call 1 only 204.5 ms, call 3 only 206.2 ms.
- **Linux, by reasoning:** the loop exits only once the reported thread CPU has grown by at least 216 ms and the wall clock by at least 200 ms. On Linux the CPU clock is fine-grained. On-CPU time and run-queue wait are disjoint within a turn, so held time (wall minus run-queue wait) is at least the on-CPU time, which is at least 216 ms. The CI log agrees: 224.4, 216.5 and 226.9 ms.

**Criterion 3 (non-blocking fixes), details:**
- **M05** (`1.5 * LAG_LIMIT_MS`) is killed 3/3 by test 3, through the 120 ms control.
- **M17** (binding seam removed) is killed 3/3 by test 4, through the raw-binding control.
- **N6:** with `NODE_OPTIONS=--require` and a preload that deletes `process.threadCpuUsage`, the result is 5 tests, 0 pass, 5 fail, 0 skipped, exit 1. The messages are "#651 needs Node 22 or later" and "#651 needs process.threadCpuUsage (Node 22 or later)".
- **N2:** the oracle comment and plan item 4 are now true ("only when it holds the event loop for the limit or longer; a short call ... is not seen"). This matches the two sub-millisecond captured passes in section 5.
- **N8:** the test count is now true (12 on the base, 13 in iteration 1, 16 now). The under-load figure is not supported by its cited raw output (R3).

**Criterion 5 (repeatability), details:**
- Three suites, idle ×20: 20/20 green, 16 tests each. Main worst turn 33.0 to 38.7 ms.
- Under 32 busy `node` processes ×10: 10/10 green. Main worst turn 45.5 to 53.2 ms.
- Every control failed its verdict in all 30 runs.
- `npm run test:node` ×1: 1110 tests, 1090 pass, 2 fail, 18 skipped. Both failures are `bundleDeps.test.cjs` subtests ("holds no braces, picomatch...", "holds chokidar 4 ..."), under `not ok 308 - bundled dependencies (C2 T5)`. This is the known junction artefact. The bounded main test passed (held 56.4 ms).
- There were no other failures.

**Criterion 7 (records), details:**
- Checks that pass:
  - #951 follows #950 directly, and its Previous Hash `3dc8fb5b…` equals #950's chain hash.
  - Its Content Hash `5095f12c76c1bfbadd96017d73666dfdfdfd380f9151e556dfbc91ef41abb524` equals my LF-normalised SHA-256 of the report at the head. The report is byte-identical to the previous auditor's scratch copy.
  - The ledger at `origin/main` is a byte prefix of the ledger at `376dd0f3`, which is a byte prefix of the ledger at the head. So #938 to #949 are unchanged, and #950 is as committed.
  - The ledger is unchanged between `61510608` and `fcb16f68`.
  - `verify-ledger --post-anchor` reports "post-anchor clean (boundary=#382)".
  - The gate files agree with the ledger: `audit.json` equals `audit-iter2.json` (entry 951, chain `3c63f3d2…`, report hash `5095f12c…`, target `035d6e97…` = the plan at `060a09fa`). `plan.json` equals `plan-iter3.json`, with `plan_content_hash` `c8ace3cf…` = the head plan, LF. The provenance `payload_sha256` values equal the LF hashes of their JSON files.
  - #951's clarification of #950 is true against `AUDIT_REPORT-656.md`, lines 20 to 41 and 102.
- Checks that fail:
  - **#951's "26 planted blocking variants" is false: the report shows 25 (R1).**
  - **Plan iteration 3 repeats it (R2).**
  - R3 is described above.

**Committed evidence, sampled against my runs:**
- `stall200-windows-100trials.json` (min 201.6, 0 under 200) matches mine (min 203.1).
- `stress-windows-controls-diag.txt`: call-1 and call-3 controls at 203.5 ms or more. Mine: 204.5 ms or more.
- `stress-windows-idle-diag.txt` and `-load32-diag.txt` (load 44.2 to 55.1 ms) match mine (load 45.5 to 53.2 ms).
- `falsify-windows.jsonl`: every violation fails 5/5, and `none` and thread-pool pass. This matches my table.
- `test-node-windows-run1/2.txt` (1110/1090/2) match my run.

## 4. Blocking findings

### R1: Entry #951's Decision miscounts the planted variants (criterion 7)
- #951 says: "26 planted blocking variants in the compiled production module ... fail 5 of 5, while unmodified code and asynchronous thread-pool work pass".
- `AUDIT_REPORT-656-iter2.md` section 6 lists 29 variants. 25 FAIL 5/5. 4 pass: unmodified code, thread-pool work, captured `readFileSync(..., 'utf8')` and captured `statSync`. The previous auditor's `plant_summary.txt` agrees (25 at `fail=5`). The report contains no "26".
- The Decision also omits the two sub-millisecond captured passes from the "pass" list (26 + 2 = 28, not 29).
- Fix: #951 is immutable, so record a clarification in the next ledger entry, as #951 did for #950.

### R2: Plan iteration 3 repeats the miscount (criterion 7)
- `.failsafe/governance/plans/plan-v6013-651-architecturelinks-ci-reliability.md` line 68 says: "26 planted blocking variants failed".
- Fix: change it to 25 (of 29 planted).

### R3: The N8 under-load figure is not what its cited raw output shows (criteria 3 and 7)
- Plan line 35 says: "On the same 32-process load the real function's worst turn was then 27 to 54 ms with nothing excused (`.agent/staging/evidence-651/probe-windows-load32-priority.txt`)". Line 77 says: "the under-load figure has committed raw output."
- The cited file has 15 runs, with worst-turn wall times from 27.1 to 48.3 ms. Nothing in it reaches 54.
- The other load evidence, `stress-windows-load32-diag.txt`, shows 44.2 to 55.1 ms (the main test, not the probe). That does not give 54 as an upper bound either.
- Fix: state 27.1 to 48.3 ms for the probe, or cite both files with their real ranges.

None of R1 to R3 affects the test code, the oracle or any measured behaviour.

## 5. Regression tables

### Planted implementations (compiled production module, main test alone, 5 runs each; `iter2/plant2.cjs`, unchanged)

| Variant | Iteration 2 | Now |
|---|---|---|
| none | pass 5/5 | pass 5/5 |
| cpu150 always / cpu300 always | FAIL 5/5 | FAIL 5/5 |
| cpu150 first / every5th last / every5th first / alternate | FAIL 5/5 | FAIL 5/5 |
| **cpu150 random50** | FAIL 5/5 | **pass 1, FAIL 4**. In the passing run no stall was drawn (worst 32.5 ms, CPU 30). The stall fired in 30 traced re-runs and all 30 failed. |
| cpu300 random50 | FAIL 5/5 | FAIL 5/5 |
| cpu105 just over / wall105 / wall150 / pbkdf2Sync | FAIL 5/5 | FAIL 5/5 |
| threadpool async | pass 5/5 | pass 5/5 |
| captured spawnSync / destructured execSync | FAIL 5/5 | FAIL 5/5 |
| captured / bound / first-only captured Atomics.wait | FAIL 5/5 | FAIL 5/5 |
| spawn_sync binding live / captured | FAIL 5/5 | FAIL 5/5 |
| destructured readFileSync (buffer) | FAIL 5/5 | FAIL 5/5 |
| destructured readFileSync utf8 (sub-ms, N2) | pass 5/5 | pass 5/5 |
| captured statSync (sub-ms, N2) | pass 5/5 | pass 5/5 |
| node:fs statSync live / __importStar statSync live | FAIL 5/5 | FAIL 5/5 |
| spawnSync live / Atomics.wait live 5 ms / ctx.git() | FAIL 5/5 | FAIL 5/5 |

Every variant that blocked fails. Unmodified code and asynchronous thread-pool work pass 5/5.

### Mutation set (clean suite ×3 per mutant; harm check ×3 for survivors)

- **Killed: 22.** M01, M02, M04, M05, M06 to M10, M15 to M22, M30, M31, M33, M36.
- **Changed rows:**
  - M05 went from survived (harmful) to **killed 3/3** (test 3).
  - M17 went from survived (partly harmful) to **killed 3/3** (test 4).
  - M22 was re-anchored to the new loop and is still killed.
- **No mutant killed at iteration 2 survives now.**
- **Survivors, the same as iteration 2:**
  - Equivalent: M03, M11, M12, M35. Each still caught by its harm check, 0/3 pass.
  - Robustness-only: M13, M14 (0/3 pass).
  - Control neutralised or removed: M23, M24, M25, M32. The main test is still caught, 0/3 pass.
  - Main assertion removed or skipped, not catchable in-file by design: M26, M27, M28, M34 (3/3 pass, as before). M29 is Linux-only.
- **New mutants:**
  - M36 (pre-fix CPU-only burn): **killed 3/3** by the new `held >= STALL_MS` guard.
  - M37 (wall floor dropped, CPU + 16 kept): survives. The CPU + 16 condition alone already implies at least 200 ms on both platforms. Equivalent.
  - M38 (`JUST_OVER_MS` 120 to 200): survives. This is the control-neutralised class; the main test still catches cpu105 (0/3 pass).
  - M39 (N6 guard replaced by `return 0`): survives. Equivalent on Node 22, and the N6 behaviour was checked directly (criterion 3).

## 6. Linux CI evidence (run 43148402279, job "Full Test Suite (test:all)", head `fcb16f68`, Node v22.23.4, success in 14m13s)

- Mode: `wall-clock minus kernel run-queue wait`, so the schedstat path was active. Totals: tests 1110, pass 1077, fail 0. All 13 checks pass.
- `ok 99`: the pin test.
- `ok 100`: the main test. Held 60.0 ms (wall 71.9, CPU 55.5, run-queue wait 11.9) over 20 turns.
- `ok 101` (stall controls):
  - every call: held 224.4 ms (CPU 224.9, queue 3.2);
  - call 1 only: 216.5 ms (queue 0.1);
  - call 3 only: 226.9 ms (queue 0.1);
  - **120 ms control: 141.5 ms (queue 0.0)**.
  - Every stall control is held for at least 200 ms.
- `ok 102` (live controls): live `Atomics.wait` 202.6 ms (CPU 2.6, queue 0.0); live `spawnSync` 223.8 ms (CPU 2.4, queue 0.0). The raw-binding count assertion passed.
- `ok 103` (captured-reference controls, which bypass the seams, as asserted):
  - captured `Atomics.wait` 201.1 ms (CPU 0.9, queue 0.0);
  - captured `spawnSync` 224.4 ms (CPU 1.8, queue 0.0);
  - destructured `execSync` 228.9 ms (CPU 2.0, queue 0.0).
- Off-CPU blocking through captured references is held in full and not excused.

## 7. Observations (non-blocking)

- **O1 (records, evidence retention):** plan line 56 (iteration 2 evidence) still says `test:node` passed "three runs in a row" and "Raw output is retained". `fcb16f68` deleted `test-node-windows-run3.txt` and overwrote runs 1 and 2 with new 1110-test runs, so iteration 2's three-run raw output is no longer in the tree. It is still in git history at `060a09fa`.
- **O2 (class: probabilistic planted variant):** `cpu150_random50` is drawn independently on 5 calls, so 1 in 32 runs plants nothing and correctly passes. "5/5" for that variant is a property of chance, not of the oracle. A deterministic seed would make the row stable.
- **O3 (class: control-neutralising edit):** M37 and M38 survive, as do the existing M23 to M25 and M32. This is the same posture as before. No meta-test guards the controls' own parameters.
- **O4:** under load, a burn outside `measure()` (no priority raise) ran up to 2032 ms of wall time. That is expected preemption, and inside the oracle at raised priority it stayed between 202 and 258 ms.

## 8. Not verified

- No Linux runs of my own. The Linux claims rest on the CI log of one run and on the reasoning in criterion 1. macOS was not run.
- I did not try CFS-bandwidth throttling or cgroup limits.
- I did not try Node 20 itself; N6 was simulated with a preload, as the brief specified.

## 9. State left behind

- My worktree `%TEMP%\j656iter3wt` had a clean `git status` at `fcb16f68`. The planted module had been restored, with the `cmp` against `.orig` identical. Mutated tests were restored with `git checkout`.
- I unlinked the junction with `cmd //c rmdir`. The target `FailSafe-g4\FailSafe\extension\node_modules` is intact (505 entries).
- Then I ran `git worktree remove --force` and `prune`. The directory is gone and is no longer listed.
- `C:\dev\mythologiq\FailSafe-650`: only `git fetch origin` and `git worktree add/remove` were run, and its working tree is clean. FailSafe-656 and the other worktrees were not touched.
- No stray `node` processes remain.
- No commits, pushes, GitHub posts or workflow triggers. The only network use was read-only `gh`.
- Scratch is in `scratchpad\audit656\iter3\`:
  - scripts: `burn3.cjs`, `burn3_old.cjs`, `mutants3.cjs`, `plant3.cjs`, `runv3.sh`, `runmut3.sh`, `harm3.sh`, `rep3.sh`, `load3.sh`, `drive1.sh`, `drive2.sh`, `harmlist.sh`, `runtrace.sh`, `nothreadcpu.cjs`;
  - logs and results: `plant_summary.txt`, `plant_detail.log`, `mut_clean.txt`, `harm3.txt`, `trace.txt`, `rep_idle.log`, `rep_load32.log`, `rep_summary.txt`, `burn3_*.json`, `n6.txt`, `testnode.txt`, `ci_full.log`;
  - extracted blobs: `blobs/`, `cov/`, the `l*.md` ledger copies.
- The previous reports and scripts are unmodified.
