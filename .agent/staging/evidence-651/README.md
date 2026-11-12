# #651 iteration 2 evidence (Windows 11, 16 logical CPUs, Node 22.23.4, 2026-11-12)

- falsify.cjs: plants each violation at the top of the compiled describeAffectedArchitecture and runs the main test 5 times; results in falsify-windows.jsonl (pass/fail counts and the first diagnostic line).
- probe.cjs: the pre-design measurement of the real function (wall clock and main-thread CPU per turn).
- stress-windows-idle-diag.txt (20 runs) and stress-windows-load32-diag.txt (10 runs under 32 busy processes): the main test diagnostic line of each run of the three suites; all runs passed.
- test-node-windows-run1..3.txt: summary of npm run test:node; the 2 failures are bundleDeps.test.cjs, which fails in junction-linked worktrees on unmodified main.
- Linux: not run locally (no WSL or container runtime); see the plan, iteration 2.
