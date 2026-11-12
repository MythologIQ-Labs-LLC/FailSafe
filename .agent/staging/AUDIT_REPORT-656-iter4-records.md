# /qor-audit: PR #656 iteration 4, bounded records-only confirmation check (#651)

## 1. Scope statement

**This is a bounded, records-only confirmation check, not an audit of the code.** It checks only that the delta `fcb16f68..b29cd870` changes no test or source file, that it corrects R1 to R3 and O1 of the previous check (`AUDIT_REPORT-656-iter3-confirmation.md`), that every sentence the delta adds or changes is true, and that CI passes on the current head. The code was not re-audited, and no new hypothetical classes are raised.

- Repository: MythologIQ-Labs-LLC/FailSafe, PR #656 (draft, open), branch `fix/651-architecturelinks-bounded-io`.
- **Audited head: `b29cd87075706b56924e5e3ec98f985de19cafdc`**, confirmed with `gh pr view 656 --json headRefOid`. The delta is `68748d7c` (ledger Entry #952, its report and gate) and `b29cd870` (plan iteration 4 and plan gate).
- I used a disposable detached worktree created from `FailSafe-650` after `git fetch origin`. It has been removed (`git worktree list` no longer shows it). No other worktree was touched. I made no commits, pushes, GitHub posts or workflow triggers.
- Reviewer: an independent judge. I wrote none of the code, the plan or any earlier report.

## 2. Verdict: VETO

The record corrections R1, R2, R3 and O1 are all made, and they are true. Criteria 1, 3 and 4 hold. The VETO has two grounds:

- **C5 (blocking): CI on the exact head is not green.** "Full Test Suite (test:all)" failed (run 43151479737, headSha `b29cd870`). It failed in `lockQueue.test.js`, a file the PR does not touch. This is a real test assertion, not an infrastructure failure. The 12 other checks passed.
- **R4 (blocking, records): one sentence in the new Entry #952 does not match the report it seals.** The ledger cannot be edited, so the fix is a correction in a later entry.

## 3. Criteria

| # | Criterion | Status |
|---|---|---|
| 1 | No test or source change | **PASS** |
| 2 | R1 corrected without altering history | **PARTIAL**: the chain, hashes, gates and history are correct, and the #951 correction is true. One Decision sentence is false (R4). |
| 3 | R2 and R3 corrected; O1 true | **PASS** |
| 4 | Changed plan sentences true | **PASS** |
| 5 | Current-head CI 13 of 13 | **FAIL**: 12 of 13 |

### Criterion 1
- `git diff --name-only fcb16f68 b29cd870` gives 12 paths:
  - `docs/META_LEDGER.md`;
  - `.agent/staging/AUDIT_REPORT-656-iter3-confirmation.md`;
  - the plan;
  - 9 files under `.qor/gates/2026-11-12T0251-53f40b/`.
- No path is outside the allowed set. Nothing is under `FailSafe/` or `.github/`.

### Criterion 2
- **Append-only.** I compared the git blobs, not the CRLF worktree copy. The `fcb16f68` ledger (2,501,414 bytes) is a byte prefix of the head ledger (2,504,483 bytes). Entries #938 to #951 are byte-identical. The diff adds only Entry #952, right after #951. There is one #952 and no #953.
- **Hashes.**
  - The LF-normalised SHA-256 of `AUDIT_REPORT-656-iter3-confirmation.md` is `237bcce870379907a2ddf387e4f58b70358a6381a081757700fc1bf0d47cdaf0`. This equals #952's Content Hash.
  - #952's Previous Hash `3c63f3d2...97cf01` equals #951's Chain Hash.
- **Chain.** `python -I -m qor.cli verify-ledger --post-anchor`, run with the specified venv: "OK Entry #952: chain hash verified (post-anchor)", "post-anchor clean (boundary=#382)", exit 0.
- **Count check (25 of 29).** `AUDIT_REPORT-656-iter2.md` section 6 has 29 rows:
  - 25 rows are FAIL 5/5;
  - 4 rows are pass 5/5: unmodified code, async thread-pool work, destructured `readFileSync(...,'utf8')` and captured `statSync`. The last two are marked sub-ms, and the base test also passes them 3/3.
  - #952's correction ("29 variants, of which 25 fail 5 of 5, 2 are correct passes ... and 2 are sub-millisecond captured-reference calls that pass, as in the base test") is true.
- **Gates.**
  - The raw SHA-256 of `audit-iter3.json` is `b874e480...b71d6`. It matches `audit-iter3.provenance` and `audit.provenance`, and `audit.json` is identical to it.
  - The raw SHA-256 of `plan-iter4.json` is `91395458...dc933`. It matches `plan-iter4.provenance` and `plan.provenance`, and `plan.json` is identical to it.
  - `audit-iter3.json` gives ledger_entry 952, the same chain hash `4be02026...dac4` and report hash `237bcce8...`, and audited_candidate `fcb16f68`.
  - Its target_content_hash `c8ace3cf...8551` equals the plan's SHA-256 at `fcb16f68`.
  - `plan-iter4.json` plan_content_hash `45859e92...c08c` equals the plan's SHA-256 at the head.
  - The last line of `audit_history.jsonl` matches.
- **R4: Decision text checked against the sealed report.** #952 says: "There is no regression: 29 planted variants match the previous audit". The sealed report says (criteria table row 4): "The planted set (29 variants x 5 runs) matches iteration 2 on 28 rows". Its section 5 table shows `cpu150 random50` as "pass 1, FAIL 4" against iteration 2's "FAIL 5/5".
  - The report explains the passing run: no stall was drawn, about 1 in 32 runs. It still counts 28 matching rows, not 29.
  - This is the same kind of count misstatement as R1. The Decision's closing observation about the random variant does not state the 1/5 pass.
  - Every other figure in #952's Decision matches the report: eight criteria; 205.6 ms minimum over 250 trials (150 idle and 100 under load); 74 of 100; 20/20 and 10/10; run 43148402279 with 60.0 ms, 216.5 to 226.9 ms, 141.5 ms and 201.1 to 228.9 ms; the N6 behaviour (5 of 5 fail with a clear message); M05 and M17 killed; R1 to R3; O1; and about 1 run in 32.
  - Fix: a later ledger entry stating that 28 of 29 rows matched, and that `cpu150_random50` passed 1 of 5 by chance of no draw.

### Criterion 3
- **R2.** The iteration-3 sentence now reads "25 of its 29 planted variants failed 5 of 5 (the other four pass as they should ...)". This is true against iteration-2 section 6. The only remaining "26" is the iteration-4 R1 bullet, which quotes the old claim as the error.
- **R3.** `probe-windows-load32-priority.txt` holds 15 records. Their wall values range from 27.1 to 48.3 ms, and the plan now says 27.1 to 48.3 ms.
  - `stress-windows-load32-diag.txt` holds 10 lines, all above-normal priority. Their worst held times are 44.2 to 55.1 ms, and the maximum is 55.1. That matches the plan's "at most 55.1 ms".
  - The "has committed raw output" sentence is replaced by "corrected in iteration 4 to match its committed raw output". That is true.
- **O1.** At `060a09fa`, `test-node-windows-run1..3.txt` exist, and each shows tests 1090, pass 1070, fail 2.
  - At the head, run3 is gone. Runs 1 and 2 have different blobs and show 1110/1090/2.
  - So the new sentence "Those three summaries were committed at `060a09fa` and replaced in iteration 3 by two new runs; the originals remain in git history at that commit" is true.

### Criterion 4
I read every sentence the delta adds or changes in the plan (`git diff --word-diff fcb16f68 b29cd870 -- <plan>`):
- The status line now cites Entries #950, #951 and #952 and says "iteration 4 (records only)". True.
- Item 3: the probe and suite figures and their files are true, as checked under criterion 3.
- "The raw output of iteration 3 is in `.agent/staging/evidence-651/`". True: the directory holds the files listed in its README.
- The iteration-3 count sentence is true.
- The N2/N8 line is true.
- The iteration-4 section:
  - It says the check "found every technical criterion met and vetoed on three record statements". That matches report section 2.
  - It says "No test or source file changes in this iteration". That matches criterion 1.
  - The R1, R2, R3 and Observation bullets are each true.
- The changed plan has no false sentence.

### Criterion 5: current-head CI (all runs on headSha `b29cd870`)
- **Passed (12):**
  - Analyze (actions), Analyze (javascript-typescript), Analyze (python);
  - CodeQL;
  - Compile and lint on macos-latest, ubuntu-latest and windows-latest;
  - Dependency Review;
  - Semgrep Community Edition;
  - both standards checks;
  - verify-vsix-guardrails.
- **Failed (1): Full Test Suite (test:all).** Run 43151479737, job 130961426124, 10m14s.
  - `test:all` is `lint && test:runner-coverage && test:citation-parity && npm test && test:node && test:ui`. Lint, runner coverage and citation parity passed.
  - `npm test` (vscode-test) ended with "6168 passing, 15 pending, 1 failing". The failing test is "Cross-process lock queue (v6.0.8 #528 LD-4) R1 a single update waits for at most 3 of a hot writer's updates, in each of five rounds".
  - Its error: `AssertionError: the hot writer stored 16 updates after the waiter started waiting [{"before":22,"after":20,"overtaken":16},{"before":24,"after":23,"overtaken":1},...]` at `out/test/shared/fileLock/lockQueue.test.js:186:29`.
  - Because of the `&&` chain, `test:node`, which contains the #651 ArchitectureLinks suites, did not run on this head.
  - The transport-retry condition (ECONNRESET, "Error downloading", "Error: aborted") did not match, so the workflow did not retry.
  - **Classification.**
    - The failing file is not in the PR: the PR's files are the five ArchitectureLinks test files, the plan, the ledger, `.agent/**` and `.qor/**`, with nothing under `fileLock`. The delta since the last green head (`fcb16f68`, CI 13 of 13) changes only records.
    - It is a timing and fairness assertion failure in an unrelated test. It is not runner setup or network.
    - Under the verdict rule, any completed failure blocks the PASS.
  - Per the CI budget rule, at most one re-run of the failed job is allowed. I did not trigger it.

## 4. Remediation (mechanical)
1. **CI.** Re-run the failed "Full Test Suite (test:all)" job once, which needs owner action, and confirm 13 of 13 on `b29cd870`. If it fails again, reproduce `lockQueue.test` locally.
2. **R4.** In the ledger entry that records this check, state that #952's sentence "29 planted variants match the previous audit" should read "28 of 29 rows matched; `cpu150_random50` passed 1 of 5 because no stall was drawn in that run". Do not edit #952.

## 5. State left behind
- The worktree is removed. The only files I wrote are this report and `ci-43151479737-failed.log`, both in the scratchpad `audit656` folder.
