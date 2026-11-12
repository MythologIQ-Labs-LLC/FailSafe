# #651 evidence (iteration 3; Windows 11, 16 logical CPUs, Node 22.23.4, 2026-11-12)

- `falsify.cjs`: plants each violation at the top of the compiled `describeAffectedArchitecture` and runs the main test N times.
  - `falsify-windows.jsonl`: 15 variants, 5 runs each, idle.
  - `falsify-windows-load32.jsonl`: 6 variants, 3 runs each, under 32 busy processes.
- `probe.cjs`: the measurement of the real function before the design was chosen (wall clock and main-thread CPU per turn).
  - `probe-windows-load32-priority.txt`: the same, under 32 busy processes at above-normal priority.
- `stall200.cjs`, `stall200-windows-100trials.json`: the iteration-3 stall over 100 trials at random clock phase (audit V1).
- Stress diagnostics (all runs passed):
  - `stress-windows-idle-diag.txt`: main-test diagnostic line of each of 20 idle runs of the three suites.
  - `stress-windows-load32-diag.txt`: the same for 10 runs under 32 busy processes.
  - `stress-windows-controls-diag.txt`: the stall-control lines of those runs.
- `test-node-windows-run1..2.txt`: summary of `npm run test:node`. The 2 failures are `bundleDeps.test.cjs`, which fails in junction-linked worktrees on unmodified main.
- `ci-linux-run43144395889-iter2.txt`: the #651 diagnostic lines from the Linux CI Full Test job on iteration 2 (`060a09fa`): run-queue mode active; off-CPU controls held with no run-queue wait.
- Linux: not run locally (no WSL or container runtime). The CI job on the final head is the Linux evidence for iteration 3.
- The raw log of the failed Full Test job on `b29cd870` (run 43151479737) is at `.failsafe/governance/evidence/651/ci-43151479737-failed.log`. It was first committed here (`.agent/staging/evidence-651/`) in `888ced6f` and moved unchanged, because its test names mention the retired product and that guard exempts historical records only under `.failsafe/`.
