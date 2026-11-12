# Plan: #651 deterministic ArchitectureLinks bounded-I/O qualification

**Status:** iteration 2, after the independent VETO recorded as ledger Entry #950. Iteration 1 is kept below, marked rejected. This document records no PASS and no merge authority.
**Owner scope:** issue [#651](https://github.com/MythologIQ-Labs-LLC/FailSafe/issues/651) (CI reliability). **Associated PR:** #656, replacement for #655 on a branch allowed by repository policy.
**Baseline:** `main` `54724e0180c0dcf33bf3a34f46a6b4b9a3dc475c` (the branch was synced with it); iteration 1 was based on `9f16548d`.
**Implementation candidates:** iteration 1 `3ba649ac` (rejected); iteration 2 is the commit that adds this section (test-only source).
**Proposed risk grade:** L2 (test acceptance reliability with security-adjacent bounded-I/O proof). The independent judge may raise it.
**Changed product code:** none. **Change:** test files under `FailSafe/extension/src/test/governance/architecture/` only (see iteration 2).

## Why this work exists

The original 100 ms wall-clock event-loop responsiveness assertion failed sporadically under shared Linux CI runner contention (issue #651 documents 105 ms and 121 ms). That metric includes time when the runner has descheduled Node; CI green after an unbounded retry would not prove responsiveness. Conversely, raising the 100 ms threshold would destroy the original bounded-I/O claim.

## Iteration 1 implementation and test contract (rejected, VETO #950)

1. Keep `LAG_LIMIT_MS = 100`. Measure a timer-turn gap in wall time and process CPU time; `busyLag` uses the lower value as a heuristic to distinguish descheduling from synchronous event-loop work.
2. A maximum of five bounded attempts can discount noisy external scheduler contention. This is an acceptance-policy change: the normal test passes if at least one attempt measures less than 100 ms busy time, **not** if every run is under 100 ms. The judge must explicitly review and accept that trade-off.
3. Preserve precise no-Git, no-synchronous-filesystem and no-child-process assertions. Include `Atomics.wait` to catch an off-CPU synchronous stall that CPU-time estimation alone would miss. The counts aggregate across all attempts; one prohibited call fails even when another attempt is fast.
4. Deliberately inject three independently falsifiable violations:
   - A 150 ms synchronous CPU-burning `readIndex` callback must fail all five tries against the unchanged 100 ms limit.
   - A synchronous `fs.statSync` callback must be counted once for each attempted run and refused regardless of elapsed time.
   - A synchronous 150 ms `Atomics.wait` callback must be counted once per attempted run and refused regardless of CPU measurement.
5. Retain pre-existing functional expectations for the 5,000-row pathological index: affected file included and oversized registry cell reported; no false PASS from missing execution.
6. Do not change the runtime implementation, release gate configuration, CI threshold, security policy, or the historical failed workflow results.

## Iteration 2 (VETO #950 remediation)

The independent audit of `dd7841a2` found that iteration 1 fixed the flake by weakening detection. B1: the best of five attempts was accepted, so code that blocks on some calls passed. B2: lag was clamped by process CPU time, so blocking that never uses the CPU passed when it went through a reference captured before the wrappers were installed (captured `spawnSync`, destructured `execSync`, captured or bound `Atomics.wait`, `process.binding('spawn_sync')`). B3: the 150 ms control measured process-wide CPU, so it was not a reliable 150 ms stall and failed on clean code. B4: one function was 48 lines and the file 463 lines.

**What was measured before choosing the design** (Windows 11, 16 logical CPUs, Node 22.23.4). The real `describeAffectedArchitecture` over the 5,000-row index has a worst event-loop turn of about 17 to 38 ms when the machine is idle. Under 32 busy processes the worst turn's wall-clock time rose to 105 to 388 ms while the main thread itself used 0 to 48 ms of CPU in that turn. The lag under load is the main thread waiting for a CPU. Blocking off the CPU (a child process, `Atomics.wait`) looks the same in CPU time, so CPU time cannot excuse anything. Only the operating system's record of time spent waiting for a CPU can tell the two apart.

**Verdict now** (`eventLoopOracle.cjs`):
1. Every turn of every call counts. The measured run makes five describe calls one after another and takes the worst turn over all of them. Nothing is retried and no attempt is discarded.
2. A turn's held time is its wall-clock gap minus the main thread's run-queue wait in that gap. On Linux that wait is the kernel's own accounting for the main thread (`/proc/self/task/<tid>/schedstat`, second field). Time blocked off the CPU is not run-queue wait, so it always counts.
3. Where the kernel does not expose that accounting (Windows, macOS), the run-queue wait is taken as zero and the verdict is plain wall-clock time. To keep wall-clock time meaningful on a loaded machine, the measurement raises the test process to above-normal priority when the system allows it, and restores it afterwards. On the same 32-process load the real function's worst turn was then 27 to 54 ms with nothing excused.
4. The seams that count synchronous fs, any child process, `Atomics.wait` and raw `process.binding` calls stay, for live references. A reference captured earlier bypasses them and is caught by the time verdict instead; the controls prove that.
5. The limit is the literal 100 ms, pinned by a test. The planted stall is a literal 200 ms of main-thread CPU (`process.threadCpuUsage()`), twice the limit, and does not move with the limit.

**Negative controls**, each required to fail the verdict:
- A 200 ms main-thread stall on every call, on the first call only, and on the third call only.
- Live `fs.statSync`, live `Atomics.wait`, and live `spawnSync` of a child that sleeps 200 ms. Each is counted by the seams and held by the time verdict.
- Captured `Atomics.wait`, captured `spawnSync` and a destructured `execSync`. These bypass the seams, the test requires that they do, and they must still be held.

**Split for the Section 4 limits.**
- `architectureFixtures.cjs`: shared fixtures and the modules under test.
- `ArchitectureLinks.test.cjs`: review text, affected matching and the describe states. These tests are moved verbatim.
- `ArchitectureLinks.registry.test.cjs`: registry and decision links. These tests are moved verbatim.
- `ArchitectureLinks.boundedIo.test.cjs`: the #651 verdict and its controls.
- `eventLoopOracle.cjs`: the measurement.

Every file is under 250 lines and every function under 40. The suites have 16 tests in total, against 13 before: the old bounded test is replaced by five.

**Evidence on Windows.**
- 15 violations were planted at the top of the compiled production `describeAffectedArchitecture` and the main test was run 5 times each. All 13 violations failed 5 of 5: CPU stalls of 150 ms always, on the first call, on every fifth call, on alternate calls and at random; a 105 ms stall; captured `spawnSync`; destructured `execSync`; captured and bound `Atomics.wait`; `process.binding('spawn_sync')`; live `statSync`; destructured `readFileSync`. Unmodified code and asynchronous thread-pool work passed 5 of 5.
- The three suites passed 20 of 20 idle and 10 of 10 under 32 busy processes.
- `npm run test:node` passed apart from the known `bundleDeps` worktree artefact, three runs in a row.
- Raw output is retained with the audit evidence.

**Evidence on Linux, and what is not claimed.**
- No Linux machine is available locally (no WSL, no container runtime). On Linux the verdict uses the kernel's run-queue accounting, and that path has run only in CI (`ubuntu-24.04`).
- In CI the negative controls run on every build, including the captured-reference controls that prove off-CPU blocking is not excused. The test prints the measurement mode and the worst turn, so the CI log shows whether the run-queue path was used.
- If a Linux kernel does not expose the accounting, the verdict falls back to plain wall-clock time, which never excuses anything.

**Limitation.** On Windows and macOS the verdict cannot tell waiting for a CPU apart from blocking off the CPU, so it does not try. It is strict wall-clock time at raised priority. On a machine loaded heavily enough to keep an above-normal-priority process from the CPU for 100 ms, it can fail without a defect in the code. That failure is not excused. The safer arrangement, if it occurs, is to run this suite on its own (`node --test` with this one file) rather than in parallel with the rest of the suite.

## Falsification and independent-review questions (iteration 1)

- Does `process.cpuUsage()` include other threads' CPU under parallel runner load, causing false positives? If so, does five-attempt bounded sampling provide enough isolation without masking a real stall?
- Can a forbidden blocking call escape wrappers (other import aliases, sync syscall mechanisms, or platform-specific APIs)? Treat this as an explicitly bounded assertion, not proof of all possible synchronous work.
- Does the source actually exercise the negative hooks through the real `describeAffectedArchitecture` implementation, with `d.state='ok'` and the expected output? A mocked verdict without invoking production logic does not qualify.
- Does an injected blocking call remain a test failure on Windows and Linux? Verify actual FAIL outcomes before restoring the pristine test source; do not accept descriptive comments as evidence.
- Check resource and cleanup hygiene: every monkey-patched method must be restored in reverse order even when the tested operation throws; all timers and scratch paths must be cleaned safely.
- Is the 5-attempt minimum a proportionate stability compromise? Do not silently increase attempts, stop the clock sooner, loosen 100 ms, or drop the mutation-sensitive tests.

## Acceptance and promotion

1. Verify `fix/651-architecturelinks-bounded-io` points to the intended test-only commit. #655 was closed **unmerged** because its `claude/*` branch failed the enforced branch-name regex.
2. Run focused Node tests locally on Windows and Linux where available; retain raw pass/fail output.
3. Verify a fresh, **complete 13/13 check set on the current final PR head**. In particular, Repo Standards must PASS on this replacement branch and Full Test must PASS. Earlier #655 receipts are historical, not substitute evidence.
4. Require fresh independent native `/qor-audit` covering the measurement-method risk and all three falsification paths, with a recorded audit verdict, immutable ledger continuity and exact source hash.
5. Compare audited product/test source and final PR-head tree. Any change beyond governance evidence requires a bounded-delta review and fresh qualification if tests change.
6. Only after those gates, advance draft #656 through the normal protected-branch review and merge path. Do not bypass rulesets or claim a GO for v6.0.13 from this unrelated CI reliability change.

## Dependencies and rollback

No new dependencies or extension runtime behavior. The PR is separable from Statewright #653 and G4 release verifier #654. Revert or replace only this test change if independent measurement proves unsound. Keep the genuine failed tests on #647 visible regardless of outcome. The release remains gated separately by operational G4 owner decisions and exact artifact qualification.
