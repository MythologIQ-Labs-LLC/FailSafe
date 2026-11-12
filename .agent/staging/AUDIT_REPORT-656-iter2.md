# /qor-audit: PR #656 iteration 2 (#651 ArchitectureLinks bounded-I/O verdict)

- Repository: MythologIQ-Labs-LLC/FailSafe, PR #656 (draft, open), branch `fix/651-architecturelinks-bounded-io`.
- Audited head: `060a09faf32965af4bdf017b11fbb683e924b4cf`. I checked it with `gh pr view 656 --json headRefOid`. The previous audit covered `dd7841a2771232a9ef765949d86386d497b207c8`. Since then: `72bf0449` (merge of main `54724e01`), `376dd0f3` (ledger Entry #950) and `060a09fa` (the remediation).
- Base for the scope check: `origin/main` = `54724e0180c0dcf33bf3a34f46a6b4b9a3dc475c`. Base for the coverage check: `9f16548d83116e2d8ee7f9010545963c06e5c93a`, whose `ArchitectureLinks.test.cjs` blob (`0c329d82`) is identical on `origin/main`.
- Environment: Windows 11, 16 logical CPUs, Node v22.23.4. I used my own disposable detached worktree (`%TEMP%\audit656-iter2-wt`, now removed) with `node_modules` junctioned to FailSafe-g4. I ran `npm run compile`, and the tests used `out/governance/architecture/affectedArchitecture.js`. Linux evidence comes from CI run 43144395889 on the exact head.
- Auditor: an independent judge. I took nothing from the plan, the commit messages, the test names or the committed evidence as proof, and I did not read the external method probe. Every number in this report comes from my own runs or from the CI log of the exact head.

## 1. Verdict: VETO

The redesign is sound and fixes B1, B2 and the flake. I found no blocking implementation that passes and no ambiguous measurement made to pass. The verdict is VETO on two narrow points, both reproducible and both mechanical to fix:

- V1: the owner's explicit "at least a 2x margin" requirement for the planted stall is not met on Windows. The plan's claim of "a literal 200 ms of main-thread CPU" is false there.
- V2: a Section 4 nesting breach in an added file.

## 2. Risk grade: L2

The change is test-only, but it replaces the oracle of a security-adjacent "no blocking I/O on the event loop" contract. A weak oracle would let blocking regressions ship silently. No production code, CI workflow or release gate changes, so L3 is not warranted. I agree with the plan's L2.

## 3. Status of B1 to B4 and of each owner requirement

| Item | Status | Evidence |
|---|---|---|
| B1: best of five accepted | **Remediated** | `measure` runs 5 calls under one sampler, and the worst turn over all turns of all calls decides. There is no retry and no minimum. Planted first-call-only, every-fifth (first or last), alternate and random-50% stalls at 150 and 300 ms all FAIL 5/5. Mutants M09 (1 call), M10 (best call) and M30 (2 calls) are killed. |
| B2: off-CPU blocking excused via CPU clamp | **Remediated** | `held = wall - run-queue wait`. Run-queue wait is the kernel's figure on Linux and 0 elsewhere. CPU time is never subtracted. Captured `spawnSync`, destructured `execSync`, captured and bound `Atomics.wait`, and live or captured `process.binding('spawn_sync')` all FAIL 5/5 on Windows. In CI on Linux, the captured-reference controls were held at 200.9 to 227.2 ms with run-queue wait 0.0. M07 (the iteration-1 metric) and M08 (excuse CPU) are killed. |
| B3: unreliable 150 ms control | **Remediated in substance, not to the letter (V1)** | The stall now burns main-thread CPU (`process.threadCpuUsage`). On clean code the controls failed the verdict in every one of 30 suite runs plus CI, with no spurious failure. On Windows, though, the stall is 186 to 209 ms, not at least 200 ms (V1). |
| B4: razor | **Remediated for the test files; new breach in `falsify.cjs` (V2)** | The five test files: longest function 34 lines, largest file 153 lines, nesting 2 or less. |
| Req: remove best-of; intermittent and first-call stalls fail | **Met** | See B1. |
| Req: keep wall-clock detection of off-CPU blocking; never excuse captured references | **Met** | See B2, plus the Linux CI log (section 9). |
| Req: pin the literal 100 ms | **Met for the constant** | `assert.equal(LAG_LIMIT_MS, 100)`. M01 (101) and M02 (1000) are killed. The comparison itself is not anchored near the limit (N3). |
| Req: reliable main-thread stall with at least a 2x margin | **Not met on Windows (V1)** | 100 trials: min 186.1 ms, 71/100 below 200 ms. In the suite, stall turns held as little as 188.1 ms. Linux CI: 200.6 to 207.6 ms (met). |
| Req: explicit child-process control | **Met** | `spawnSync` of `node -e "setTimeout(()=>{},200)"`: counted by the seam (`child_process.spawnSync`, 1) and held 252 to 587 ms on Windows and 227.6 ms on Linux. Captured `spawnSync` and destructured `execSync` controls are also present. M31 (child exits at once) is killed. |
| Req: 40-line functions and 250-line files without losing coverage | **Met for the test files; V2 for the evidence script** | Section 11. All 11 pre-existing non-bounded tests were moved verbatim. The old bounded test's assertions are all kept (section 10). |
| Req: do not make an ambiguous measurement pass; report the limitation | **Met** | Windows and macOS use strict wall-clock time, with nothing excused. Linux excuses only time the kernel reports as runnable but not running. The plan states the Windows and macOS limitation honestly. |
| No production change, no CI workflow change, threshold not weakened | **Met** | Section 12. |

## 4. Blocking findings

### V1: The planted "200 ms" stall is not a 2x margin on Windows. The owner requirement is not met and the plan statement is false there.

- Code: `burnMainThread(ms)` loops `while (threadCpuMs() - from < ms)`. On Windows, `process.threadCpuUsage()` advances in steps of about 15.6 ms (observed step sequence `15 16 15 16 16 15 ...`). `from` is read at an arbitrary phase within a step, so the loop can end up to one step early in real time.
- Evidence (my runs, Windows, Node 22.23.4):
  - `burn.cjs` uses the shipped `threadCpuMs` and the same loop, with a random 0 to 16 ms phase before each burn. Over 100 trials: min 186.1, p05 188.4, median 195.2, max 209.1 ms wall. 71/100 were below 200 ms and 16/100 below 190 ms. Back-to-back without a phase offset: min 201.6 ms. The phase decides the result.
  - In the suite, over 30 runs (idle ×20 and load ×10), the worst turn held by the CPU-stall controls had these minimums: "every call" 189.4 ms, "call 1 of 5 only" 188.1 ms, "call 3 of 5 only" 191.2 ms. Those turns also contain describe's own parse work, so the stall alone was shorter still.
  - Linux CI: 207.6, 200.6 and 200.7 ms. The 2x margin holds on Linux.
- Owner requirement: "make a reliable main-thread stall with at least a 2x margin". The shipped stall gives 1.86x at worst on Windows. Plan, iteration 2, item 5: "The planted stall is a literal 200 ms of main-thread CPU ... twice the limit". That is not true on Windows, where the plan's own evidence was taken. The guard assertion `every.worst.cpu >= STALL_MS * 0.75` accepts a 150 ms stall, so the test would not notice if the stall shrank further.
- Practical effect: small. 186 ms is still far over 100 ms, and I saw no spurious control failure. But this is an explicit, numeric owner requirement, and the plan states it as met.
- Remediation: end the burn only when both main-thread CPU and wall-clock time have reached `STALL_MS`, for example `while (threadCpuMs() - from < ms || performance.now() - t0 < ms)`. Alternatively, burn `STALL_MS` plus one clock step. Tighten the guard to `worst.held >= STALL_MS` (or `worst.cpu >= STALL_MS - 16`). Correct the plan sentence.

### V2: Section 4 nesting breach in an added file: `.agent/staging/evidence-651/falsify.cjs`

- Measured from the committed blob with ESLint 8.57.1 `max-depth: 3` (`--no-eslintrc`): `42:7 Blocks are nested too deeply (4)` and `44:7 Blocks are nested too deeply (4)`. My AST walker agrees (depth 4 at L42). The structure is `try { for (names) { for (runs) { if ... else { ... } ; if (diag && k === 0) ... } } }`.
- The file is added relative to `origin/main`, so it is inside the stated razor scope ("every file added or modified"). The other limits pass: 48 lines, and no function over 40 lines.
- Remediation: extract the per-variant body into a function such as `runVariant(name)`, or move the `try/finally` into that function. Re-measure.

## 5. Non-blocking findings

- **N1. On Linux, runnable-but-not-running time is excused, by design. That includes the preempted part of a wall-clock-bounded busy-wait.** CPU work done by the main thread is never excused, because held time is at least the CPU used. Off-CPU blocking is never excused either: sleeping in `spawnSync`, in `Atomics.wait` or in uninterruptible I/O is not `run_delay`. A defect that spins until a wall-clock deadline (`while (Date.now() < t) {}`) on a contended runner would have its preempted share excused. Kernel accounting cannot tell that case apart from honest work stretched by preemption. This is the arrangement the previous VETO proposed. I could not exercise it, because I have no Linux machine. Not blocking.
- **N2. The seams see live references only, and short captured synchronous fs calls pass.** Captured `statSync`, and captured `readFileSync(p, 'utf8')`, passed 5/5. The `utf8` call goes through Node 22's `binding.readFileUtf8` fast path, not the exported `openSync`. The base test also passes both (3/3 each), so this is not a regression. The buffer form of `readFileSync` is still caught, through the exported `openSync`/`readSync`. The wording in the oracle comment and in plan item 4 ("a reference captured earlier is caught by the held-time verdict instead") is true only for blocking of 100 ms or more. It should say so.
- **N3. The comparison is not anchored near the limit.** M05 (`held < 1.5 * LAG_LIMIT_MS`) survives the suite. Under it, a 105 ms CPU stall (held about 137 ms) passes 3/3. The pin test pins the constant, not its use. Controls at 2x cannot see a loosened comparison. A pure-function test of the verdict on synthetic turns (for example held 100.0 and 99.9) would close this.
- **N4. There is no control for the `process.binding` and `process._linkedBinding` seams.** M17 (binding seam removed) survives. Blocking raw-binding calls are still held by the time verdict (M17 with a live `spawn_sync` binding: FAIL 3/3). Short raw-binding calls would go uncounted.
- **N5. Restore ordering.** `raisePriority()`, `installSeams()` and `startSampler()` run before the `try`. If `installSeams` or `startSampler` threw, the priority would not be restored and some wraps could stay in place. A call that throws inside the `try` is handled correctly: sampler, seams and priority are all restored in `finally`, in that order. `os.setPriority` throwing (Linux without CAP_SYS_NICE, macOS non-root) is caught and reported as `raised: false`. A failed restore is swallowed, which only leaves the test subprocess raised. Practically unreachable.
- **N6. On Node 20 the new suite crashes. Node 20 is already unsupported for `test:node`.** `.nvmrc` (both the repository root and `FailSafe/extension`) still pins `20.18.1`, and the `run-node-tests.cjs` comment says CI pins Node 20. In fact CI uses Node 22.23.4, and the README requires the Node 22 runtime. On 20.18.1, `process.threadCpuUsage` is undefined, so 4 of the 5 bounded tests fail with `process.threadCpuUsage is not a function`. Main's `ArchitectureLinks.test.cjs` passes 12/12 on 20.18.1. But `test:node` at the head on 20.18.1 fails 38 tests, and 34 of them are unrelated suites (G4 verifier, ACP and others), so Node 20 is not a working configuration today. Recommended: guard with a clear skip or failure message ("requires process.threadCpuUsage, Node 22"), and fix the stale `.nvmrc` under its own issue.
- **N7. Ledger Entry #950's Decision text slightly overstates the VETO report.** It says the intermittent variants "passed the new test and failed the base test" (first call, every fifth, alternate, random). It also says each of the B2 bypasses was one "the base test caught". The report tested the base only on first-call and alternate (B1), and lists bound `Atomics.wait` as n/a on the base (B2). Every other statement in the Decision matches the report. Entries are immutable, so record a clarification in the next entry.
- **N8. Plan arithmetic and an uncommitted figure.** "16 tests in total, against 13 before: the old bounded test is replaced by five." The base has 12 tests. 12 - 1 + 5 = 16, and 13 was iteration 1's count. The "27 to 54 ms" under-load figure for the probe has no committed raw output. The committed load diagnostics show 44.0 to 54.0 ms, and my load runs 44.9 to 55.2 ms.
- **N9. Windows limitation: stated honestly, and not reproduced.** The main test passed under 32 busy processes in 10/10 suite runs, and under 64 busy processes 5/5. With the priority raise removed (M14), it still passed 5/5 under 32. I could not make the stated limitation occur. This is not a claim that it cannot occur.
- **N10. Unrelated flake seen once.** In `test:node` run 2, `pythonResolution.tempHygiene.test.cjs` (LD20) failed. The cause was `pythonResolution.adversarial.test.cjs:307` "admitted by the alias rule, rejected by the probe". That suite is not touched by this PR. It passed in run 1 and in CI.

## 6. Planted-implementation table

Violations were planted in the compiled production `affectedArchitecture.js`, right after `parseRegistryText` in `describe`, guarded by `rows > 4000`. Captured references are taken at module load. The main test ran alone (`--test-name-pattern="bounded I/O - no git"`), 5 times per variant. My definitions are in `iter2/plant2.cjs`. They reuse the previous auditor's set, which I verified and extended. CPU stalls use `process.threadCpuUsage`, and "wall" stalls use a `performance.now()` busy-wait.

| Variant | Main test | Expected | First-run worst turn (held / wall / CPU) |
|---|---|---|---|
| none (unmodified) | pass 5/5 | pass | 33.3 / 33.3 / 16.0 |
| CPU 150 ms, always | FAIL 5/5 | fail | 197.5 / 197.5 / 188.0 |
| CPU 300 ms, always | FAIL 5/5 | fail | 348.0 |
| CPU 150 ms, first call only | FAIL 5/5 | fail | 178.0 |
| CPU 150 ms, every 5th call (the 5th) | FAIL 5/5 | fail | 158.2 |
| CPU 150 ms, every 5th call (the 1st) | FAIL 5/5 | fail | 174.3 |
| CPU 150 ms, alternate calls | FAIL 5/5 | fail | 173.0 |
| CPU 150 ms, random 50% | FAIL 5/5 | fail | 225.1 |
| CPU 300 ms, random 50% | FAIL 5/5 | fail | 337.7 |
| CPU 105 ms (just over the limit) | FAIL 5/5 | fail | 137.1 |
| wall busy-wait 105 ms | FAIL 5/5 | fail | 137.9 |
| wall busy-wait 150 ms | FAIL 5/5 | fail | 181.9 |
| `pbkdf2Sync` loop 150 ms | FAIL 5/5 | fail | 181.6 |
| async thread-pool (8× `pbkdf2`, awaited) | pass 5/5 | pass | 30.2 |
| captured `spawnSync`, child sleeps 250 ms | FAIL 5/5 | fail | 344.4 / CPU 30.0 |
| destructured `execSync` from `node:child_process` | FAIL 5/5 | fail | 365.7 / CPU 16.0 |
| captured `Atomics.wait` 250 ms | FAIL 5/5 | fail | 284.8 |
| bound `Atomics.wait` 250 ms | FAIL 5/5 | fail | 285.6 |
| captured `Atomics.wait` 150 ms, first call only | FAIL 5/5 | fail | 180.8 |
| `process.binding('spawn_sync')` live, 250 ms | FAIL 5/5 | fail | 341.3 (also counted: `process.binding`) |
| `process.binding('spawn_sync')` captured at load, 250 ms | FAIL 5/5 | fail | 337.3 (time verdict) |
| destructured `readFileSync` (buffer) | FAIL 5/5 | fail | counted via exported `openSync`/`readSync` |
| destructured `readFileSync(..., 'utf8')` | pass 5/5 | (sub-ms; seam bypass) | 33.0. The base test also passes 3/3 (N2). |
| captured `statSync` | pass 5/5 | (sub-ms; seam bypass) | 31.0. The base test also passes 3/3 (N2). |
| `require('node:fs').statSync` live | FAIL 5/5 | fail | counted |
| `fs.statSync` via TS `__importStar` live | FAIL 5/5 | fail | counted |
| `child_process.spawnSync` live (`node -v`) | FAIL 5/5 | fail | counted |
| `Atomics.wait` live, 5 ms | FAIL 5/5 | fail | counted |
| `ctx.git()` called | FAIL 5/5 | fail | stub count |

Every genuinely blocking variant (event loop held for 100 ms or more, or a live forbidden call) fails 5/5. The only passes are unmodified code, async thread-pool work, and two sub-millisecond captured fs calls that the base test also misses.

## 7. Mutation table

There are 35 mutants of `eventLoopOracle.cjs` and `ArchitectureLinks.boundedIo.test.cjs`, defined in `iter2/mutants2.cjs`. "Clean" means the bounded suite (5 tests) run twice against unmodified production; a failure there kills the mutant. "Harm" means the main test run 3 times against a planted violation chosen for the mutant.

| ID | Mutant | Clean suite fails | Harm check | Status |
|---|---|---|---|---|
| M01 | `LAG_LIMIT_MS` 100→101 | 2/2 (pin) | n/a | killed |
| M02 | `LAG_LIMIT_MS` 100→1000 | 2/2 | n/a | killed |
| M03 | `<` → `<=` | 0/2 | CPU 105: caught 3/3 | survived, equivalent |
| M04 | comparison inverted | 2/2 | n/a | killed |
| M05 | `held < 1.5 * LAG_LIMIT_MS` | 0/2 | CPU 105 **passes 3/3**; CPU 150 caught | **survived, harmful (N3)** |
| M06 | units: wall in seconds | 2/2 | n/a | killed |
| M07 | iteration-1 metric `min(wall, cpu)` | 2/2 (captured controls) | n/a | killed |
| M08 | excuse CPU: `wall - cpu` | 2/2 (stall control) | n/a | killed |
| M09 | calls forced to 1 | 2/2 | n/a | killed |
| M10 | per-call samplers, keep the best call | 2/2 | n/a | killed |
| M11 | final `mark()` on stop dropped | 0/2 | CPU 150 on the 5th call: caught 3/3 | survived, equivalent |
| M12 | 30 ms tail wait dropped | 0/2 | CPU 150 on the 5th call: caught 3/3 | survived, equivalent |
| M35 | final mark and tail wait both dropped | 0/2 | CPU 150 on the 5th call, captured `Atomics.wait`: caught 3/3 each | survived, equivalent (describe yields many turns after the planted point) |
| M13 | priority restored immediately (before the calls) | 0/2 | CPU 150 first: caught 3/3 | survived, robustness-only |
| M14 | priority never raised | 0/2 | CPU 150 first: caught; clean under 32 load: pass 5/5 | survived, robustness-only |
| M15 | `child_process` seam removed | 2/2 | n/a | killed |
| M16 | `Atomics.wait` seam removed | 2/2 | n/a | killed |
| M17 | `process.binding` seam removed | 0/2 | live `spawn_sync` binding: caught by time 3/3 | survived, partly harmful (N4) |
| M18 | seam counter no-op | 2/2 | n/a | killed |
| M19 | `SAMPLE_MS` 10→1000 | 2/2 | n/a | killed |
| M20 | worst kept only from the first 3 turns | 2/2 | n/a | killed |
| M21 | `STALL_MS` 200→90 | 2/2 | n/a | killed |
| M22 | stall loop no-op | 2/2 | n/a | killed |
| M23 | `expectHeld` no-op | 0/2 | main unaffected (CPU 150 first caught) | survived, control neutralised |
| M24 | captured-`spawnSync` control removed | 0/2 | main still catches captured `spawnSync` 3/3 | survived, control removed |
| M25 | one-call-only stall controls removed | 0/2 | main still catches CPU 150 first 3/3 | survived, control removed |
| M26 | main `responsive` assertion removed | 0/2 | CPU 150 always **passes 3/3** | survived, harmful (no in-file meta-check, by design) |
| M27 | main `blocking` assertion removed | 0/2 | live `statSync` **passes 3/3** | survived, harmful (same) |
| M28 | main test registered only off Windows | 0/2 | CPU 150 **passes 3/3** on Windows | survived, harmful (same) |
| M29 | main test registered only off Linux | 0/2 | caught on Windows | survived here; its effect is Linux-only and could not be exercised |
| M30 | calls capped at 2 | 2/2 | n/a | killed |
| M31 | child sleep removed (`-e 0`) | 2/2 | n/a | killed |
| M32 | captured-control failures swallowed | 0/2 | main still catches captured `Atomics.wait` 3/3 | survived, control neutralised |
| M33 | no-accounting path excuses the whole wall gap | 2/2 | n/a | killed |
| M34 | git-stub assertion removed | 0/2 | `ctx.git()` **passes 3/3** | survived, harmful (same) |

Summary:
- Killed: 18 (M01, M02, M04, M06 to M10, M15, M16, M18 to M22, M30, M31, M33).
- Survived: 17.
  - Equivalent: M03, M11, M12, M35.
  - Robustness-only: M13, M14.
  - Remove or neutralise a control without weakening the main oracle: M23, M24, M25, M32.
  - Remove or skip a main assertion, which no in-file control can catch (the same posture as the base): M26, M27, M28, M29, M34.
  - Harmful and not equivalent: M05 (N3) and, partly, M17 (N4).

Every mutant the brief named is killed: threshold, units, direction, calls reduced to 1, best call, excusing CPU, the iteration-1 metric, no-op stall, no-op child. Exceptions: dropping the final mark (equivalent), restoring the priority early (robustness only), skipping a platform (not catchable in-file), and removing a control (survives, does not weaken the oracle).

## 8. Repeatability (unmodified production, three suites per run, 16 tests)

- Idle ×20: 20/20 green. Main worst turn held 34.0 to 43.9 ms.
- Under 32 busy `node` processes on 16 logical CPUs, ×10: 10/10 green. Main worst turn held 44.9 to 55.2 ms.
- Main test alone under 64 busy processes ×5: 5/5 pass. Under 32 busy processes without the priority raise (M14) ×5: 5/5 pass.
- Every control failed the verdict in all 30 suite runs. Held minimums and maximums (ms): every call 189.4/229.0, call 1 only 188.1/217.2, call 3 only 191.2/241.3, live `Atomics.wait` 206.1/218.6, live `spawnSync` 252.0/587.4, captured `Atomics.wait` 200.6/215.3, captured `spawnSync` 252.5/524.5, destructured `execSync` 270.0/635.1.
- `npm run test:node` ×2:
  - run 1: 1110 tests, 1090 pass, 2 fail (`bundleDeps.test.cjs`, the known junction artefact), 18 skipped;
  - run 2: 1089 pass, 3 fail (`bundleDeps` plus the unrelated LD20 python-resolution flake, N10). The bounded main test passed in both runs (held 53.8 and 57.5 ms).
- Failures: none in any of the three suites.

## 9. Linux CI evidence (run 43144395889, job "Full Test Suite (test:all)", `ubuntu-24.04`, head `060a09fa`, Node 22.23.4, success in 14m50s, the suite ran once with no transport retry)

- Mode: `wall-clock minus kernel run-queue wait`, so the `/proc/self/task/<pid>/schedstat` path was active. The priority raise did not apply (no "above-normal priority" in the log, as expected without CAP_SYS_NICE). Non-zero run-queue waits were reported, so the accounting is live.
- Main test, `ok 100`: worst turn held 60.0 ms (wall 75.3, main-thread CPU 60.0, run-queue wait 15.3) over 21 turns. 15.3 ms was excused, and the turn would also pass on wall-clock time alone.
- Controls, all `ok`, meaning each verdict failed as required:
  - every call 207.6 ms (CPU 205.1, queue 0.1);
  - call 1 of 5 only 200.6 ms (queue 0.9);
  - call 3 of 5 only 200.7 ms (queue 0.2);
  - live `Atomics.wait` 202.9 ms (CPU 3.6, queue 0.0);
  - live `spawnSync` 227.6 ms (CPU 2.6, queue 0.0);
  - **captured `Atomics.wait` 200.9 ms (CPU 0.9, queue 0.0)**;
  - **captured `spawnSync` 227.0 ms (CPU 2.1, queue 0.0)**;
  - **destructured `execSync` 227.2 ms (CPU 3.0, queue 0.0)**.
- Conclusion: on Linux, off-CPU blocking through captured references is held in full and not excused. The captured-reference controls asserted `blocking == []`, so they really bypassed the seams. The sampler's own `readFileSync(schedstat, 'utf8')` was not counted as blocking: the main test asserts `blocking == []` and passed. On Linux the 2x stall margin holds (200.6 ms or more).
- Linux semantics I checked by reasoning, not by running:
  - The main thread's tid equals the pid (the thread-group leader).
  - Field 2 of `schedstat` is `run_delay` in ns.
  - Sleeping, `Atomics.wait`, child waits and D-state I/O (including major page faults) are not `run_delay`.
  - Involuntary preemption, including inside a syscall, and CFS-bandwidth throttling, do count as `run_delay` and are excused (N1).
  - If `/proc` is a different PID namespace or the file is missing, `runQueueMs()` returns null and the verdict is strict wall-clock time. If schedstat reports zeros, the result is the same.

## 10. Coverage comparison (base `9f16548d` `ArchitectureLinks.test.cjs`, 12 tests)

I extracted every top-level `test(...)` block and compared it byte for byte with the three split files at the head:
- 11 of 11 non-bounded tests are present and **IDENTICAL**: 6 in `ArchitectureLinks.test.cjs`, 5 in `ArchitectureLinks.registry.test.cjs`.
- The old bounded test (`describe: bounded I/O ...`) is replaced in `ArchitectureLinks.boundedIo.test.cjs`. All of its assertions are kept on every one of the 5 calls: git stub called 0 times, no sync fs and no child process (now also no `Atomics.wait` and no raw binding), lag under 100 ms, the `src/m4999/index.ts: r4999` line present, and the over-4-KiB cell line present. The stub's 50,000-file stdout became `''`. That is equivalent, because any call fails `stubCalls === 0`.
- There are 4 new tests: the pin test and 3 control tests. The total is 16.
- Fixtures: `architectureFixtures.cjs` carries the base helpers (`tmp`, `git`, `write`, `row`, `indexText`, `SELF`, `AFFECT_ROWS`, `workspace`, the constants and the module requires) with unchanged bodies. The only change is that cleanup is wrapped in `registerCleanup(test)`, which each of the three files calls. Each file runs in its own `node --test` process, so module state is per file. All three suites passed 30/30 locally and in CI.

## 11. Razor (committed blobs at `060a09fa`; acorn AST walker, cross-checked with ESLint `max-depth`, `max-lines-per-function` and `max-lines`)

| File (added or modified against `origin/main`) | Lines | Longest function | Max nesting | Result |
|---|---|---|---|---|
| `src/test/.../eventLoopOracle.cjs` | 125 | 18 (`installSeams`) | 2 | ok |
| `src/test/.../architectureFixtures.cjs` | 87 | 6 | 2 | ok |
| `src/test/.../ArchitectureLinks.boundedIo.test.cjs` | 117 | 13 | 1 | ok |
| `src/test/.../ArchitectureLinks.test.cjs` | 132 (463 at iteration 1) | 34 | 1 | ok (B4 fixed) |
| `src/test/.../ArchitectureLinks.registry.test.cjs` | 153 | 32 | 2 | ok |
| `.agent/staging/evidence-651/probe.cjs` | 38 | 20 | 1 | ok |
| `.agent/staging/evidence-651/falsify.cjs` | 48 | under 40 | **4** (ESLint: L42, L44) | **breach (V2)** |

There are no nested ternaries in these files. The remaining touched files are Markdown, JSON, JSONL and text records.

## 12. Scope and records

- `git diff --stat origin/main...060a09fa`: 29 files. Code changes are limited to `FailSafe/extension/src/test/governance/architecture/` (5 files). There is nothing under `.github/`, no production source and no other test. The other changes are `.agent/staging/` (the report and evidence), `.qor/gates/...`, `.qor/session/current`, the plan, and `docs/META_LEDGER.md`.
- Merge `72bf0449` (parents `dd7841a2` and `54724e01`): `git diff 54724e01 72bf0449` touches only the PR's two files (the plan and `ArchitectureLinks.test.cjs`). Main's governance records (#947 to #949 and everything else) are preserved byte for byte, and `origin/main` is an ancestor of the head.
- Ledger Entry #950:
  - it directly follows #949;
  - Previous Hash `bfb9d6ce…` equals #949's chain hash;
  - Content Hash `d8efcf53f687ca7b2e4d86bc212b51b4cf23e1693397578b103427335df42f13` equals my LF-normalised SHA-256 of `.agent/staging/AUDIT_REPORT-656.md` at the head, and also of the previous auditor's scratch copy;
  - `python -I -m qor.cli verify-ledger --post-anchor` reports "post-anchor clean (boundary=#382)", with only the disclosed pre-anchor residuals;
  - the Decision text is true against the report, except for the overstatement in N7.
- Gate records: `audit.json` has target hash `ddcef54e…`, which equals the LF SHA-256 of the iteration-1 plan at `dd7841a2`. `plan-iter2.json` has `plan_content_hash` `035d6e97…`, which equals the head plan.
- Plan iteration 2: it truthfully describes the design, the controls, the split, the Linux-only CI evidence and the limitation. It contains these falsehoods or imprecisions: V1 ("a literal 200 ms ... twice the limit" is false on Windows), N2 (the captured-reference wording), and N8 (the "13 before" count and the uncommitted "27 to 54 ms").
- Committed evidence sample:
  - `falsify-windows.jsonl` matches my planted results variant for variant (all violations fail 5/5; `none` and thread-pool pass 5/5);
  - `stress-windows-idle-diag.txt` (31.9 to 37.7 ms) matches my idle range (34.0 to 43.9 ms);
  - `stress-windows-load32-diag.txt` (44.0 to 54.0 ms) matches my load range (44.9 to 55.2 ms);
  - `test-node-windows-run*.txt` match my run 1 (1090 pass, 2 bundleDeps failures).

## 13. Guards and CI

- `npm run lint`: exit 0, 0 errors, 136 warnings (the same count as iteration 1).
- `npm run test:runner-coverage`: PASS (756 test files, all claimed; 110 `node --test`).
- `npm run test:citation-parity`: PASS (structure: 37 tracked plans).
- CI on `060a09fa` (read-only): 13/13 checks pass, including "Full Test Suite (test:all)" (14m50s; test:node 1110 tests, 0 failures), both `standards` jobs, three-OS compile and lint, CodeQL, Semgrep, Dependency Review and VSIX guardrails.

## 14. Not verified

- I made no Linux runs of my own. The planted set, the mutants and the load runs were Windows-only. The Linux claims rest on the CI log of one run and on kernel semantics (section 9). Linux-only mutants (for example, reading schedstat field 1 instead of field 2, or skipping on Linux) were not exercised.
- macOS: not run. Only "Compile and lint (macos-latest)" runs in CI, so on macOS the verdict code path (wall-clock time; `setPriority` expected to throw for non-root) is unexercised.
- I did not try CFS-bandwidth throttling or cgroup CPU limits.
- The external method probe was not read.

## 15. State left behind

- My worktree `%TEMP%\audit656-iter2-wt` was removed with `git worktree remove --force` and pruned. Before that I unlinked the `node_modules` junction with `cmd //c rmdir`. The junction target `C:\dev\mythologiq\FailSafe-g4\FailSafe\extension\node_modules` is intact. Every planted module was restored from `.orig` before removal, and every mutated test file was restored with `git checkout`. `git status` was clean before removal.
- `C:\dev\mythologiq\FailSafe-650`: only `git fetch origin` and `git worktree add/remove` were run, and its working tree is unchanged. `C:\dev\mythologiq\FailSafe-656` and the other worktrees were not touched.
- No commits, pushes, GitHub posts or workflow triggers. The only network use was read-only `gh`.
- Scratch files are in the scratchpad `audit656\iter2\`: `plant2.cjs`, `runv2.sh`, `mutants2.cjs`, `runmut2.sh`, `harm.sh`, `rep.sh`, `load2.sh`, `burn.cjs`, `razor2.cjs`, `cov.cjs`, the logs, and `ci_full.log`. This report is a new file. The previous report is unmodified.
