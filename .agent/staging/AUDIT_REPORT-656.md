# /qor-audit: PR #656 (#651 ArchitectureLinks bounded-I/O measurement)

- Repository: MythologIQ-Labs-LLC/FailSafe, PR #656 (draft), branch `fix/651-architecturelinks-bounded-io`
- Audited head: `dd7841a2771232a9ef765949d86386d497b207c8`. Base: `9f16548d83116e2d8ee7f9010545963c06e5c93a`. Test source commit: `3ba649ac`.
- Environment: Windows 11, 16 logical CPUs, Node v22.23.4, disposable detached worktree (now removed), `npm run compile` output used by the test (`out/governance/architecture/affectedArchitecture.js`).
- Auditor: independent judge. Nothing from the PR body, the plan, or the external method probe was taken as evidence. Every result below comes from my own runs.

## Verdict: VETO

## Risk grade: L2
This is a test-only change, but it alters the acceptance oracle for a security-adjacent "no blocking I/O" contract. If the oracle is weakened, blocking regressions can ship without any signal. No production code, workflow or release gate changed, so L3 is not warranted. I agree with the plan's proposed L2.

## Blocking findings

### B1: The responsiveness check keeps the best of five attempts and discards failures (owner constraint violated)
- Code: `boundedDescribe` repeats `measureBoundedDescribe` while `busyLag >= LAG_LIMIT_MS`, up to `LAG_ATTEMPTS = 5`, then reports `busyLag: Math.min(...runs.map((r) => r.busyLag))`. The plan (contract item 2) says so itself: "the normal test passes if at least one attempt measures less than 100 ms busy time".
- Owner constraint: the 100 ms bar must not be "weakened by ... retries that discard failures". This design does exactly that.
- Evidence: I planted code in the compiled production module that blocks the event loop with 150 ms of synchronous CPU on some calls only.

| planted (in describe, large index only) | PR head main test | base main test |
|---|---|---|
| 150 ms CPU block on the first call only (lazy-init / cold-cache pattern) | PASS 5/5 | FAIL 3/3 |
| 150 ms CPU block on every 5th call | PASS 5/5 | n/a |
| 150 ms CPU block on alternate calls | PASS 5/5 | FAIL 3/3 |
| 150 ms CPU block with probability 0.5 | PASS 10/10 | n/a |
| 300 ms CPU block with probability 0.5 | PASS 10/10 | n/a |
| 150 ms CPU block on every call | FAIL 5/5 | n/a |

An implementation that really holds the loop for 150 to 300 ms in production passes. The code comment "Work that really holds the event loop for the limit does so on every attempt" is false for intermittent and first-call blocking, which is the common real-world shape.
- Remediation: assert on every attempt (the maximum busyLag, not the minimum), or take a single measurement. To absorb descheduling, fix the metric (see B2), not the acceptance policy. If the owner wants retries anyway, that needs an explicit owner waiver of this constraint. The plan alone cannot grant it.

### B2: The CPU-time metric no longer detects off-CPU blocking that bypasses the wrappers. The base test caught all of these.
- Code: `busyLag = max over turns of min(wallGap, process.cpuUsage delta)`. A turn blocked off the CPU uses about 0 ms of CPU, so it never counts. The test relies on monkey-patched `fs.*Sync`, `child_process.*` and `Atomics.wait` counters as the only backstop. Its comment says "each of those calls is counted instead". That is true only for calls made through the live, patched properties.
- Evidence: planted off-CPU blocks of 250 ms using references captured at module load time (the normal `const { execSync } = require('child_process')` style) or internal bindings:

| planted off-CPU block (250 ms) | PR head main test | base main test (wall clock) |
|---|---|---|
| `const __ss = require("child_process").spawnSync` captured at load, then a child that sleeps | PASS 5/5 | FAIL 3/3 |
| `const { execSync } = require("node:child_process")` destructured at load | PASS 5/5 | FAIL 3/3 |
| `const __aw = Atomics.wait` captured at load | PASS 5/5 | FAIL 3/3 |
| `Atomics.wait.bind(Atomics)` captured at load | PASS 5/5 | n/a |
| `process.binding("spawn_sync").spawn(...)` | PASS 5/5 | FAIL 3/3 |

The base test caught every one of these. The PR loses detection of genuinely blocking implementations, which the owner constraint forbids ("must still detect a genuinely blocking implementation").
- Remediation: keep a wall-clock limit as the oracle. Discount descheduling by checking that the gap was also CPU-busy on the main thread (`process.threadCpuUsage()` exists on Node 22, which CI uses), not by excusing off-CPU gaps. Alternatively, fail any wall gap of 100 ms or more unless it can be shown the main thread was runnable but not scheduled. If off-CPU gaps are excused at all, they need a backstop that does not depend on catching a function reference after load.

### B3: The 150 ms stall control is defined in process-wide CPU and fails spuriously on unmodified code. The plan's description of it is false.
- Code: the stall control loops `while (used() < LAG_LIMIT_MS * 1.5)`, where `used()` is a `process.cpuUsage` delta. That figure includes V8 GC/compiler threads and the libuv threadpool. When other threads burn CPU at the same time, the loop stops after much less than 150 ms of main-thread wall time.
- Evidence, on unmodified production code with a diagnostic copy of the test that only adds `console.log` of `stall.detail`:
  - run 3 of 3: `5 attempts: 148.6, 157.0, 129.8, 84.2 busy / 84.2 wall`. Attempt 4 came in at 84.2 ms. **Test 8 FAILED** (`stall.attempts` expected 5, actual 4).
  - 20 more runs: 1 failure (`147.9; 148.2; 145.1; 99.9 busy / 99.9 wall`, so `not ok 8`). The lowest other readings were 118.5, 126.9, 127.1 and 128.3 ms, a thin margin.
  - With `LAG_ATTEMPTS = 50` (mutant M08), the clean suite failed 1/3. More attempts mean more chances for the control to dip under the limit.
  - With other planted code present, the same assertion failed with "expected 5, actual 1 or 3" in several variants.
- Result: about 2 spurious test-8 failures in 23 diagnostic runs on clean code. (The plain idle×20 and load×10 batches happened to be 0 failures.) The PR swaps one flaky CI failure for a new one in a test whose purpose is CI reliability. The plan's item 4 claim, "A 150 ms synchronous CPU-burning readIndex callback", is not what the code does: it burns 150 ms of process CPU, observed as 84 to 157 ms of event-loop time.
- Remediation: burn for wall time (`performance.now()`) or main-thread CPU (`process.threadCpuUsage()`), with a clear margin over the limit (for example 2× the limit), and assert on every attempt.

### B4: Razor breach introduced (function length)
- Measured from the committed blob `dd7841a2:FailSafe/extension/src/test/governance/architecture/ArchitectureLinks.test.cjs`: `measureBoundedDescribe` runs 48 lines (lines 212 to 259), over the 40-line limit. On the base, the same body (the test callback at line 199) was exactly 40 lines, so the PR introduces this breach.
- The file is 463 lines against a limit of 250. It was already 375 lines on the base, and the PR adds 88 lines, so it makes an existing breach worse.
- Nesting depth stays at or under 3 everywhere.
- Remediation: split the instrumentation (the `wrap` installation, the lag sampler) into helpers of 40 lines or fewer. Move the #651 measurement and its controls into their own test file instead of growing a file that is already over the limit.

## Non-blocking findings
- N1: The controls are expressed relative to `LAG_LIMIT_MS` (burn `LAG_LIMIT_MS * 1.5`, assert `>= LAG_LIMIT_MS`). Raising the threshold to 1000 (M02) passes every test. Nothing pins the 100 ms value. This was true on the base too.
- N2: There is no child-process negative control. Removing the `child_process` wrapper (M14) passes the suite. The plan names only three controls (stall, statSync, Atomics.wait), and those are present.
- N3: Aggregating blocking counts from only the last attempt (M11) passes the clean suite. The syncFs control normally takes 1 attempt, so it cannot tell "sum" from "last". A sync call paired with a CPU stall on the first attempt then escapes (verified with planted `fs_first_only`: missed under M11).
- N4: Windows `process.cpuUsage` is quantised to about 15.6 ms (readings of 140.0, 156.0, 16.0 and 78.0 seen). A 105 ms wall busy-wait was still caught 5/5, so this does not bite in practice. The quantisation means very short gaps read 0 or 15.6 ms.
- N5: The comment "CPU time itself stretches when cores are shared" is inaccurate as stated. CPU time is accrued only while the thread runs. The comment's claim that "the smallest busy lag seen is the closest estimate" also hides the intermittent-block case (B1).
- N6: The seams are correct for live references. `fs` and `node:fs` are the same object, and TypeScript `__importStar` uses live getters, so `fs.statSync` and `require("node:fs").statSync` from production were counted (FAIL 5/5). `fs.readFileSync` captured at load is still caught, because it calls the exported `fs.openSync`, `fs.readSync` and `fs.closeSync` internally (FAIL 5/5). All patches are restored in a `finally`, in reverse order. Bypasses exist only through captured references and internal bindings (B2).
- N7: CPU-heavy work in the libuv threadpool (8 parallel `crypto.pbkdf2` calls during describe) correctly passes on both head and base. `min(wall, cpu)` bounds threadpool CPU by the wall gap, so there is no false positive. The synchronous `pbkdf2Sync` CPU block is caught (5/5).
- N8: The plan is otherwise candid. It flags the retry trade-off for the judge, and it calls the wrapper counts a bounded assertion. The trade-off it asks the judge to accept is the one the owner constraint forbids, so I do not accept it.
- N9: The PR does fix the reported flake. Under 32 busy CPU processes, the base main test failed 10/10 and the head passed 10/10. The approach has merit. It fails on how it excuses gaps and on its acceptance policy.

## Planted-implementation table (compiled production module, PR head test file; "main" = test 7, "controls" = test 8)

| variant | main pass/fail | controls pass/fail | expected | verdict |
|---|---|---|---|---|
| none (baseline) | 2/0 | 2/0 | pass | ok |
| cpu150_always | 0/5 | 5/0 | fail | caught |
| cpu150_first | 5/0 | 5/0 | fail | **missed (B1)** |
| cpu150_firstPerTest (every 5th call) | 5/0 | 5/0 | fail | **missed (B1)** |
| cpu150_alternate | 5/0 | 5/0 | fail | **missed (B1)** |
| cpu150_random50 | 10/0 | 10/0 | fail | **missed (B1)** |
| cpu300_random50 | 10/0 | 9/1 | fail | **missed (B1)** |
| wall105_always (busy-wait) | 0/5 | 5/0 | fail | caught |
| wall115_always | 0/5 | 5/0 | fail | caught |
| pbkdf2Sync 150 ms | 0/5 | 5/0 | fail | caught |
| threadpool_async (8× pbkdf2 async) | 5/0 | 5/0 | pass (not blocking) | correct |
| spawnSync captured at load, 250 ms child | 5/0 | 4/1 | fail | **missed (B2)** |
| execSync destructured from node:child_process | 5/0 | 4/1 | fail | **missed (B2)** |
| Atomics.wait captured, 250 ms | 5/0 | 4/1 | fail | **missed (B2)** |
| Atomics.wait.bind captured, 250 ms | 5/0 | 4/1 | fail | **missed (B2)** |
| process.binding('spawn_sync') 250 ms | 5/0 | 5/0 | fail | **missed (B2)** |
| readFileSync destructured ×50 | 0/5 | 0/5 | fail | caught (internal openSync/readSync counted) |
| require('node:fs').statSync live | 0/5 | 0/5 | fail | caught |
| fs.statSync via TS import live | 0/5 | 0/5 | fail | caught |
| Atomics.wait live (5 ms) | 0/5 | 0/5 | fail | caught |
| child_process.spawnSync live | 0/5 | 0/5 | fail | caught |
| ctx.git() called | 0/5 | 4/1 | fail | caught |
| fs.statSync + 150 ms on first call | 0/5 | 3/2 | fail | caught |

The same variants against the BASE test (wall clock, single attempt): cpu150_first, cpu150_alternate, spawnSync_captured, execSync_destructured, atomics_captured and spawn_sync_binding were all FAIL 3/3 (caught). threadpool_async was PASS 3/3.

## Seam-bypass table

| seam | bypass attempt | counted? | blocking detected by main test? |
|---|---|---|---|
| fs *Sync wrap | `require('node:fs').statSync` (live) | yes | yes |
| fs *Sync wrap | TS `import * as fs` (`__importStar` getters) `fs.statSync` | yes | yes |
| fs *Sync wrap | `const { readFileSync } = require('fs')` captured at load | yes (via internal exported openSync/readSync/closeSync) | yes |
| child_process wrap | `spawnSync` captured at load | **no** | **no** |
| child_process wrap | `execSync` destructured from `node:child_process` at load | **no** | **no** |
| child_process wrap | `process.binding('spawn_sync')` | **no** | **no** |
| Atomics.wait wrap | `const w = Atomics.wait` captured at load | **no** | **no** |
| Atomics.wait wrap | `Atomics.wait.bind(Atomics)` captured at load | **no** | **no** |
| restore | patches restored in `finally`, in reverse order | n/a (correct) | n/a |

## Mutation table (27 mutants of the new test logic)
"Clean" = the suite run 3× against unmodified production code; a failure there means the test's own assertions or controls kill the mutant. "Harm" = test 7 run against a planted violation suited to the mutant.

| id | mutant | clean suite fails | harm check | status |
|---|---|---|---|---|
| M01 | limit 100→101 | 0/3 | cpu150 detected | survived, near-equivalent |
| M02 | limit 100→1000 | 0/3 | cpu150 MISSED | **survived, harmful (N1)** |
| M03 | `<` → `<=` | 0/3 | detected | survived, near-equivalent |
| M04 | main lag assertion removed | 0/3 | MISSED | **survived, harmful** (no meta-check of the main assertion) |
| M05 | comparison loosened to `!(lag > 10×limit)` | 0/3 | MISSED | **survived, harmful** |
| M06 | units µs→s | 3/3 | (n/a) | killed |
| M07 | CPU term zeroed | 3/3 | — | killed |
| M08 | attempts 5→50 | 1/3 | detected | flaky kill (shows B3) |
| M09 | attempts 5→1 | 0/3 | detected | survived, stricter (not harmful) |
| M10 | min → mean across attempts | 0/3 | detected | survived, stricter |
| M11 | blocking counts from last attempt only | 0/3 | fs_first_only MISSED | **survived, harmful (N3)** |
| M12 | Atomics.wait wrap removed | 3/3 | — | killed |
| M13 | fs *Sync wrap removed | 3/3 | — | killed |
| M14 | child_process wrap removed | 0/3 | cp_live MISSED | **survived, harmful (N2)** |
| M15 | wrapper counter no-op | 3/3 | — | killed |
| M16 | stall control loop no-op | 3/3 | — | killed |
| M17 | stall control 150→90 ms | 3/3 | — | killed |
| M18 | stall control assertions removed | 0/3 | detected | survived (control removed; no meta-test) |
| M19 | control test `test.skip` | 0/3 | detected | survived (control removed) |
| M20 | main test skipped on win32 | 0/3 | SKIPPED, missed | **survived, harmful** |
| M21 | control failures caught and swallowed | 0/3 | detected | survived (control neutralised) |
| M22 | sampling interval 10→1000 ms | 3/3 | — | killed |
| M23 | Atomics control removed | 0/3 | atomics_live detected | survived (control removed) |
| M24 | syncFs control removed | 0/3 | fs live detected | survived (control removed) |
| M25 | main blocking-count assertion removed | 0/3 | fs live MISSED | **survived, harmful** |
| M26 | git stub assertion removed | 0/3 | git_call MISSED | **survived, harmful** |
| M27 | retry condition inverted | 3/3 | — | killed |

Killed: 9 (M06, M07, M12, M13, M15, M16, M17, M22, M27), plus M08 flaky. 17 survived; of those, 8 are harmful and non-equivalent (M02, M04, M05, M11, M14, M20, M25, M26). Survivors that remove or skip a control (M18, M19, M21, M23, M24) need a meta-test or a review rule to catch them. Survivors that only touch the main assertion (M04, M05, M25, M26) cannot be caught by in-file controls by design; this matches the base test's posture.

## Repeatability (unmodified production, PR head test file)
- Idle ×20: test 7 pass 20/20, test 8 pass 20/20.
- Under heavy load (32 busy `node` processes on 16 logical CPUs) ×10: test 7 10/10, test 8 10/10.
- Diagnostic copy (adds `console.log` only) idle: 23 runs, **test 8 failed 2/23** (84.2 ms and 99.9 ms readings for the "150 ms" stall; see B3).
- BASE test under the same load ×10: test 7 **failed 10/10**. This reproduces #651, and the head fixes that symptom.

## Razor (committed blobs)
| file | lines (base → head) | longest function | max nesting | result |
|---|---|---|---|---|
| ArchitectureLinks.test.cjs | 375 → 463 (limit 250) | `measureBoundedDescribe` 48 (base equivalent 40) | ≤ 3 | **file breach worsened (+88); new function breach (B4)** |
| plan-v6013-651-...md | 0 → 46 | n/a | n/a | ok |

## Guards and CI
- `npm run lint`: 0 errors, 136 warnings.
- `npm run test:runner-coverage`: PASS (749 files, all claimed).
- `npm run test:node`: 1087 tests, 1067 pass, 2 fail, 18 skipped. Both failures are in `src/test/scripts/bundleDeps.test.cjs`, the known artefact of a worktree linked through a junction. No other failures.
- Scope check: `git diff 9f16548d dd7841a2` touches only the two files named. There are no changes under `.github` or `FailSafe/extension/src/governance`, and no production change.
- CI (`gh pr checks 656`, read-only): 13/13 pass on `dd7841a2`, including Full Test Suite (13m45s) and both standards jobs. CI green does not offset B1 to B4.

## Not verified
- Linux runs. All my measurements are on Windows. On Linux, `process.cpuUsage` granularity is finer, and B3's dependence on GC-thread CPU may differ in frequency. B1 and B2 are logic-level and platform-independent.
- The external method probe was not read or used.
- The governance ledger and native `/qor-plan` records were not inspected beyond the plan file.

## State left behind
- My worktree (`%TEMP%\audit656-wt-2008`) was removed with `git worktree remove` and pruned. The node_modules junction was unlinked first with `rmdir`. The junction target `C:\dev\mythologiq\FailSafe-g4\FailSafe\extension\node_modules` is intact (505 entries).
- `C:\dev\mythologiq\FailSafe-650`: only `git fetch origin` was run, and the working tree is clean. No other FailSafe worktree was touched.
- No commits, pushes, GitHub posts or workflow triggers.
- Scratch files (harness `plant.cjs`, `runv.sh`, `runmut.sh`, `mutants.cjs`, `razor.cjs`, `load.sh`, and result logs) remain in the scratchpad `audit656` directory alongside this report.
