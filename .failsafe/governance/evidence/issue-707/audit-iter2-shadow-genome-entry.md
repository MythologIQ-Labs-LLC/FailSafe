# Pending docs/SHADOW_GENOME.md entry (not yet appended)

Append once, in the same ordered records step as the ledger entry. It follows Failure Entry #334 (the iteration 1 entry, now present in the working copy); if the last Failure Entry differs at append time, renumber.

----- BEGIN ENTRY -----

## Failure Entry #335

**Date**: 2026-11-23T04:06:37Z
**Verdict ID**: GATE TRIBUNAL plan-707-voice-dependency-isolation iteration 2 VETO (session 2026-11-23T0340-d5e334; report .failsafe/governance/evidence/issue-707/AUDIT-PLAN-iter2.md)
**Failure Mode**: GHOST_PATH (test that cannot reach the changed branch); specification drift; unsourced evidence

### What Failed
Iteration 2 of the native plan for PR #712 (#707). Most of the iteration 1 grounds were answered, and the answers held when executed (Phase 1b mutation detection, the .gitattributes -text rule, verify:voice-pins exit 0 on Windows, the 30-test map, the vendor-piper.cjs deletion).

### Why It Failed
- The test added to prove the prerelease failure-cleanup fix seeds a missing asset. package-voice-pack.cjs removes stale same-version artifacts on the normal path (lines 41-42) before that failure (line 116), so the test passes on the unfixed baseline (executed). The changed catch-path branch (lines 62-72) is never reached.
- The V8 answer covered empty and wrong-type assets but not over-75-MiB ones, while the boundary text claimed the build message covers both. The moved check has no upper size bound.
- The Linux run became the sole evidence for 7 symlink tests and for half of a condition, but no Linux source was named. The host has no WSL or Docker, and the plan itself excludes CI as native acceptance.
- A Razor cap (bundle.cjs main at most 93) was set against a measured 94 with no prescribed change that reaches it.

### Pattern to Avoid
- Prove a fix with a red run against the unfixed code before declaring the test, and make sure the fixture reaches the changed branch, not an earlier path with the same outcome.
- When answering a prior ground, answer every case the ground names ("the same applies to ...").
- Every evidence requirement must name where it will be executed and whether that source counts as acceptance.
- A numeric cap below the measured baseline needs a named change that reaches it.

### Remediation Attempted
Iteration 2 amendment (answers to V1, V2, V4, V6 held under execution). VETO issued on four plan-text grounds; the Governor amends the plan and re-runs /qor-audit.

----- END ENTRY -----
