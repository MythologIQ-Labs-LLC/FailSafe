# Plan: #651 deterministic ArchitectureLinks bounded-I/O qualification

**Status:** PROPOSED. Independent native `/qor-plan` and `/qor-audit` verdicts are pending; this document does not record a PASS or merge authority.
**Owner scope:** issue [#651](https://github.com/MythologIQ-Labs-LLC/FailSafe/issues/651) (CI reliability). **Associated PR:** #656, replacement for #655 on a branch allowed by repository policy.
**Baseline:** `main` `9f16548d83116e2d8ee7f9010545963c06e5c93a`.
**Implementation candidate:** `3ba649ac8babdaebe9839124c98f8dd553961251` (test-only source).
**Proposed risk grade:** L2 (test acceptance reliability with security-adjacent bounded-I/O proof). The independent judge may raise it.
**Changed product code:** none. **Change:** `FailSafe/extension/src/test/governance/architecture/ArchitectureLinks.test.cjs`.

## Why this work exists

The original 100 ms wall-clock event-loop responsiveness assertion failed sporadically under shared Linux CI runner contention (issue #651 documents 105 ms and 121 ms). That metric includes time when the runner has descheduled Node; CI green after an unbounded retry would not prove responsiveness. Conversely, raising the 100 ms threshold would destroy the original bounded-I/O claim.

## Implementation and test contract

1. Keep `LAG_LIMIT_MS = 100`. Measure a timer-turn gap in wall time and process CPU time; `busyLag` uses the lower value as a heuristic to distinguish descheduling from synchronous event-loop work.
2. A maximum of five bounded attempts can discount noisy external scheduler contention. This is an acceptance-policy change: the normal test passes if at least one attempt measures less than 100 ms busy time, **not** if every run is under 100 ms. The judge must explicitly review and accept that trade-off.
3. Preserve precise no-Git, no-synchronous-filesystem and no-child-process assertions. Include `Atomics.wait` to catch an off-CPU synchronous stall that CPU-time estimation alone would miss. The counts aggregate across all attempts; one prohibited call fails even when another attempt is fast.
4. Deliberately inject three independently falsifiable violations:
   - A 150 ms synchronous CPU-burning `readIndex` callback must fail all five tries against the unchanged 100 ms limit.
   - A synchronous `fs.statSync` callback must be counted once for each attempted run and refused regardless of elapsed time.
   - A synchronous 150 ms `Atomics.wait` callback must be counted once per attempted run and refused regardless of CPU measurement.
5. Retain pre-existing functional expectations for the 5,000-row pathological index: affected file included and oversized registry cell reported; no false PASS from missing execution.
6. Do not change the runtime implementation, release gate configuration, CI threshold, security policy, or the historical failed workflow results.

## Falsification and independent-review questions

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
