# AUDIT REPORT: PR #656 / issue #651, iteration 5 (records-only confirmation check)

**This is a bounded, records-only confirmation check. It is not an audit of the code.** It checks four criteria that were set before the check began. It does not re-audit the implementation and raises no new hypothetical classes.

- **Repository:** MythologIQ-Labs-LLC/FailSafe, PR #656 (draft, open)
- **Audited head:** `e48d1c65c30e2dbfc8b9a3bfea1b207c4e89e8a9`. `gh pr view 656 --json headRefOid` returned this SHA.
- **Technically confirmed source:** `fcb16f682cd06aec601baca8758438ee623c3088` (Entry #952)
- **Plan:** `.failsafe/governance/plans/plan-v6013-651-architecturelinks-ci-reliability.md`
- **Method:** a fresh disposable worktree (`git worktree add --detach`), read-only `gh` calls and the read-only qor verifier. The worktree was clean at the end and has been removed. Nothing was committed, pushed or posted, and no workflow was triggered. No tests were run locally and no node_modules junction was made.

## VERDICT: PASS

| # | Criterion | Status |
|---|-----------|--------|
| 1 | No test or source change since fcb16f68 | PASS |
| 2 | Entry #953 is true and in sequence | PASS, with two non-blocking observations |
| 3 | The move is real and unchanged | PASS |
| 4 | CI on the current head | PASS (13 of 13) |

## Criterion 1: no test or source change since fcb16f68. PASS

There are four commits in `fcb16f68..e48d1c65`:

- `68748d7c`
- `b29cd870`
- `888ced6f`
- `e48d1c65`

`git diff --name-only fcb16f68 HEAD` lists 17 files, and every one is under an allowed path:

- `.agent/staging/`: the iter3 and iter4 reports and `evidence-651/README.md`
- `.failsafe/governance/`: `evidence/651/ci-43151479737-failed.log` and the plan
- `.qor/gates/2026-11-12T0251-53f40b/`: 11 gate and provenance files
- `docs/META_LEDGER.md`

`git diff --name-only fcb16f68 HEAD -- FailSafe .github` prints nothing (0 lines).

## Criterion 2: Entry #953 is true and in sequence. PASS

### Sequence and hashes

- Entry #953 is the last entry in the ledger and comes directly after #952.
- **Content hash.** The LF-normalised SHA-256 of `.agent/staging/AUDIT_REPORT-656-iter4-records.md` at the head is `e7eb760d624116db7857b27e3edef35fca8c84655964ebeb0e70c54d34f0fc31`. The file has no CR bytes, so the raw hash is the same. This equals #953's Content Hash. The report is byte-identical at `888ced6f`.
- **Previous hash.** #953's Previous Hash is `4be02026...aedac4`, which equals #952's Chain Hash.
- **Prefix.** The ledger at `b29cd870` (2,504,483 bytes) is a byte prefix of the head's ledger (2,506,969 bytes). So Entries #938 to #952 are byte-identical to `b29cd870`, and each heading sits at the same offset. The ledger at `fcb16f68` is also a prefix. The ledger at the head is identical to the one at `888ced6f`; `e48d1c65` does not touch it.
- **Chain verifier.** `python -I -m qor.cli verify-ledger --post-anchor`, run with the specified venv from the worktree root, exited 0 and reported `post-anchor clean (boundary=#382)`. It printed `OK Entry #950` to `OK Entry #953: chain hash verified (post-anchor)`. The only non-OK lines are the declared pre-anchor residuals (`DISCLOSED_PRE_ANCHOR`, Entries #232 to #236, #340 and #382).
- **ASCII.** Everything added to the ledger after `fcb16f68` is ASCII.

### Factual sentences of #953's Decision

**"the delta since fcb16f68 changes no file under FailSafe/ or .github/; the ledger at fcb16f68 is a byte prefix ...; Entry #952 is the only addition"**
True. `fcb16f68` to `b29cd870` touches only records, and the ledger diff adds only #952.

**"#952's content and previous hashes are correct and the chain verifies"**
True. The verifier passes.

**Quotation of #952, "There is no regression: 29 planted variants match the previous audit"**
Verbatim in #952's Decision.

**Quotation of the iter3 report: "The planted set (29 variants x 5 runs) matches iteration 2 on 28 rows. `cpu150_random50` passed 1/5: in that run no stall was drawn"**
This is verbatim at line 46 of `.agent/staging/AUDIT_REPORT-656-iter3-confirmation.md`, except that the report uses U+00D7 where the entry uses `x`. A Python substring test with U+00D7 put back returns True. The report's only non-ASCII characters are U+00D7 and U+2026, so the stated substitution is the only change.

**"the ledger seals ASCII only"**
True of the tooling. In `qor/scripts/ledger_hash.py`, `assert_sealable_text` raises `ValueError` on the first non-ASCII character ("contains non-ASCII character U+XXXX ... before sealing"). It is called by:

- `qor/scripts/ledger_fragment.py`, before the META_LEDGER write ("GH #201: reject non-ASCII before the META_LEDGER write");
- `qor/reliability/seal_entry_check.py`, for the entry just sealed ("making the seal fail-closed").

**CI facts for run 43151479737**
`gh run view` shows:

- headSha `b29cd87075706b56924e5e3ec98f985de19cafdc`, workflow "PR Full Test", conclusion failure;
- job "Full Test Suite (test:all)" failed in step "Run complete suite with bounded transport retry".

The check-runs on `b29cd870` are 13, of which 12 succeeded and only Full Test failed. That matches "12 of 13 checks passing". The log shows:

- `AssertionError [ERR_ASSERTION]: the hot writer stored 16 updates after the waiter started waiting` at `out/test/shared/fileLock/lockQueue.test.js:186:29`;
- the test title "R1 a single update waits for at most 3 of a hot writer's updates".

The limit of 3 is correct. `lockQueue.test.js` is not in the PR's diff. The log has 0 matches for `ArchitectureLinks` or `wall-clock`, so the #651 suites did not run. True.

**"The failed job log is committed at .agent/staging/evidence-651/ci-43151479737-failed.log"**
True when sealed. At `888ced6f`, the commit that sealed #953, `git ls-tree` shows blob `88af08af2e86eaca7258874fb52d2aa38c187700` at that path.

### The later move

**Facts.** In `e48d1c65` the file was moved, as a pure rename with 0 lines changed, to `.failsafe/governance/evidence/651/ci-43151479737-failed.log`. Its blob there is `88af08af...`, the same as before, and the old path is gone. The move is disclosed in two places:

- **The commit message:** "moved unchanged (same blob 88af08af) to .failsafe/governance/evidence/651/, a historical prefix that guard exempts. No test or source change".
- **A new line in `.agent/staging/evidence-651/README.md`:** it gives the new path, says the file was first committed in `888ced6f`, and gives the reason. A reader who follows #953's path lands in this directory and finds the forwarding note.

**Judgement: honestly disclosed and acceptable. #953 is not made materially false.**

1. A ledger entry describes the repository as it was when sealed. At `888ced6f` the sentence was literally true.
2. The ledger is append-only and hash-chained. Rewriting #953 to follow the file would break the chain, which is what the chain exists to prevent.
3. The evidence itself is unchanged. The blob ID is the same, so a reader can retrieve the exact bytes from either commit, and nothing the entry asserts about the log's contents has changed.
4. The reason for the move is legitimate and stated: the `pro-retirement` guard exempts `.failsafe/` (see criterion 3). The move was not made to hide or alter evidence.

**Recommendation, not blocking:** the next ledger entry for this session should record the relocation, so the ledger itself carries the forwarding pointer and not only the README.

### Gate file `.qor/gates/2026-11-12T0251-53f40b/audit-iter4.json`

The gate file matches the ledger:

- verdict VETO, iteration 4, `ledger_entry` 953;
- `ledger_chain_hash` `9e112c90...a767`, which equals #953's chain hash;
- `report_content_hash` `e7eb760d...`, which equals #953's content hash;
- `report_path` and `target` match #953;
- `ts` 2026-11-12T04:11:07Z, which equals #953's timestamp;
- `audited_candidate` `b29cd870...`;
- `target_content_hash` `45859e92...`, the LF-normalised SHA-256 of the plan at `b29cd870`, which is unchanged at `888ced6f` and at the head;
- violations R4 and C5, which match the Decision.

The `payload_sha256` in `audit-iter4.provenance` equals the raw SHA-256 of `audit-iter4.json` (`47eff191...`). `audit.json` is byte-identical to `audit-iter4.json`, and the last line of `audit_history.jsonl` is the iteration-4 record.

### Non-blocking observations on criterion 2

- **O1. The stated reason the suites did not run is incomplete.** #953 says "Because the job stops at the first failing step, the #651 suites did not run". The facts it rests on are true: the job stopped at the failing step and the suites did not run. But the #651 suites are inside that same step. `test:all` is `lint && test:runner-coverage && test:citation-parity && npm test && test:node && test:ui`, and the suites live in `test:node`. They were skipped because `npm test` failed and the `&&` chain stopped. The report #953 seals gives this mechanism correctly ("Because of the `&&` chain, `test:node` ... did not run"). The ledger's shorter wording is imprecise about where it stopped, but it is not a false statement of fact, so it does not block.
- **O2.** The relocation is not yet recorded in the ledger itself (see the recommendation above).

## Criterion 3: the move is real and unchanged. PASS

- **Same blob.** `git rev-parse 888ced6f:.agent/staging/evidence-651/ci-43151479737-failed.log` and `git rev-parse e48d1c65:.failsafe/governance/evidence/651/ci-43151479737-failed.log` both return `88af08af2e86eaca7258874fb52d2aa38c187700`.
- **`.failsafe/` really is exempt.** In `FailSafe/extension/src/test/docs/pro-retirement.test.cjs`:
  - line 26 is `const HISTORICAL_PREFIXES = [".failsafe/", "docs/research/", ...]`;
  - line 65 defines `isHistorical` with `rel.startsWith(p)`;
  - line 69 returns no findings for a historical path.
- **No other file was edited to pass the guard.** `e48d1c65` changes exactly two paths: the rename (0 lines) and one added line in the README. The guard file's last change is `8f70401a`, which predates this PR, and `git diff fcb16f68 HEAD` on it is empty. Nothing under `FailSafe/` or `.github/` changed (criterion 1).

## Criterion 4: CI on the current head. PASS

`gh pr checks 656 --watch --interval 60` exited 0. The check-runs API for `e48d1c65` reports `total_count` 13, and all 13 concluded `success`:

- CodeQL;
- Analyze (actions), Analyze (javascript-typescript) and Analyze (python);
- Compile and lint on ubuntu-latest, windows-latest and macos-latest;
- Dependency Review;
- Semgrep Community Edition;
- standards (twice);
- verify-vsix-guardrails;
- Full Test Suite (test:all).

No check failed and none failed for infrastructure reasons.

**Full Test run 43154347011** (headSha `e48d1c65...`, conclusion success). `gh run view --log`, filtered for `wall-clock`, `held` and `ArchitectureLinks`:

- **Run-queue mode was active.** Every #651 line reports `wall-clock minus kernel run-queue wait`, which is the Linux run-queue mode.
- **The #651 tests passed:**
  - `ok 99 - #651: the limit is the literal 100 ms, sampled every 10 ms, and the planted stall is twice that`
  - `ok 100 - ... bounded I/O ... the event loop stays responsive (5,000 rows, a pathological cell)`. Worst turn held 74.2 ms (wall 83.0, CPU 71.1, run-queue wait 8.8) over 22 turns, under the 100 ms limit.
  - `ok 101 - #651 control: a 200 ms main-thread stall fails, on every call and on one call only`. Held 223.0 ms on every call, 216.6 ms on call 1 of 5 and 217.3 ms on call 3 of 5. The 120 ms control held 137.0 ms.
  - `ok 102 - #651 control: live synchronous fs, Atomics.wait and spawnSync are counted and held`. Live Atomics.wait held 205.7 ms; live spawnSync held 226.9 ms.
  - `ok 103 - #651 control: captured Atomics.wait, spawnSync and execSync bypass the seams and are still held, not excused`. Captured Atomics.wait 202.8 ms; captured spawnSync 232.6 ms; destructured execSync 226.9 ms.
- **Every control failed its verdict as required.** Each control test asserts that the planted blocking fails the bounded-I/O verdict, and each one passed (`ok`). Every control's held time is above 100 ms.
- **test:node summary:** tests 1110, pass 1077, fail 0, cancelled 0, skipped 33.
- **The guard passed:** `ok 38 - no tracked file presents FailSafe Pro as a product`, and the other three pro-retirement tests passed too.
- **test:ui** then ran: 263 passed.

## Summary

- The head differs from the technically confirmed source only in records.
- Entry #953 is in sequence and its hashes are correct. Its quotations are verbatim, apart from the disclosed U+00D7 to `x` substitution, which the tooling's ASCII-only refusal requires.
- Its CI facts for run 43151479737 are true, and its evidence path was true when sealed.
- The later move keeps the same blob and is honestly disclosed, so the sealed entry is not made materially false.
- CI on the exact head is 13 of 13 green, and the #651 suites ran and passed on Linux with run-queue mode active and every control failing its verdict.

**VERDICT: PASS.**
