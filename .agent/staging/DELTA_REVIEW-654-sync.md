# DELTA REVIEW: PR #654 branch sync after the iteration-2 PASS (#638)

## Scope

Bounded-delta qualification, not a fresh audit. Question: does the delta from the audited source
`911505874c67aff0e15303ccb715942942e97e0b` (independent PASS, report
`.agent/staging/AUDIT_REPORT-g4-release-evidence-layout-iter2.md`; preceded by VETO on
`2b223e5f5d4b2e4c0e8c299ca5b1eaa2fcecda1a`) to the current head preserve that PASS?

- Head: `7f4c173b2d0c39eb3595d802767074080f866c17`, equal to `gh pr view 654 --json headRefOid` (PR is draft).
- `origin/main`: `9a9d8c0d2283d227d03230bde5974516a45b7172` (PR #653 merged). Original PR base: `9f16548d83116e2d8ee7f9010545963c06e5c93a` (merge-base of 91150587 and main).
- Delta commits: `1abf42e8` (merge of main into the branch; parents 91150587, 9a9d8c0d) and `7f4c173b` (ledger entries #947, #948, gate files, PASS report).
- The G4 rules themselves were not re-audited. The reviewer wrote none of this work. Host: Windows 11, Node v22.23.4.

## Verdict

**ACCEPT.** Criteria 1 to 6 hold, and no completed CI check failed. One CI check, the Full Test Suite, was still running at review time.

## Criteria

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Source preserved | HOLDS | Every PR file outside the ledger, `.agent/**` and `.qor/**` has the same blob at 91150587 and at 7f4c173b (table below). Outside those paths, `git diff 911505874c67 7f4c173b` contains only main's #653 files. |
| 2 | Nothing from main lost or altered | HOLDS | `git diff --name-only origin/main 7f4c173b` lists 24 paths. All are the PR's own: 5 product and test files, 2 docs, the plan, 2 audit reports and 15 gate files under `.qor/gates/2026-11-11T0032-37b50f/`, plus `docs/META_LEDGER.md`. `git diff 9f16548d origin/main` touches none of the PR's product, doc or plan files. Only two paths overlap with the PR's history: `docs/META_LEDGER.md` (the PR had not touched it at 91150587) and `.qor/session/current`. The ledger diff against main removes 0 lines; it only appends after #946. |
| 3 | Merge resolution | HOLDS | `git show --remerge-diff 1abf42e8` (11 lines) shows a single conflict, in `.qor/session/current`. It was resolved to main's value `2026-11-10T2349-6c3050`; the PR side had `2026-11-11T0032-37b50f`. At 1abf42e8, `docs/META_LEDGER.md` and `.qor/session/current` equal main. This does not affect product behaviour: the file is a tooling session pointer that no G4 script reads, and merging the PR leaves main's value unchanged. See O3. |
| 4 | Behaviour at head | HOLDS | In a scratch worktree at 7f4c173b with `node_modules` junctioned, `node --test src/test/scripts/g4*.test.cjs` ran 108 tests: 108 pass, 0 fail. `npm run test:node` first gave 36 MODULE_NOT_FOUND failures, because a fresh worktree has no compiled `out/`. After `npm run compile` (exit 0) it ran 1106 tests: 1086 pass, 18 skipped, 2 fail. Both failures are subtests of `src/test/scripts/bundleDeps.test.cjs` (`bundled dependencies (C2 T5)`), the known junction artefact. The verifier, run from the review worktree root and from the scratch worktree, gives `mode: diagnostic (NOT release evidence)`, `BLOCKED TSA_POLICY_UNSELECTED: no TSA trust root is selected in tools/g4/tsa-policy.json`, exit 2. There is no shared module. The G4 scripts require only `node:*` and `scripts/lib/g4/*.cjs`, plus the test helpers `g4Scenario.cjs` and `g4TestPki.cjs`. #653's files (`statewright-handoff.js`, `integration-catalog-renderer.js`, their tests and the CHANGELOGs) import only `brainstorm-templates.js` and each other, and reference no G4 module. |
| 5 | Records true | HOLDS (see O1 and O2) | See "Ledger and gates" below. Chain verifier: `python -I -m qor.cli verify-ledger --post-anchor` exits 0 with `post-anchor clean (boundary=#382)`, and reports `OK Entry #947` and `OK Entry #948: chain hash verified (post-anchor)`. |
| 6 | No secrets | HOLDS | `git ls-tree -r 7f4c173b` tracks nothing under `.qor/session/keys/`; the only file under `.qor/session` is `.qor/session/current`. No `*.key`, `*.pem`, `*.pfx`, `*.p12` or `.env` file is tracked. The diff against main contains no `PRIVATE KEY` or certificate block and no token pattern. `.gitignore` covers `.qor/` and `*.key`. |
| 7 | CI | 12 of 13 pass, 1 running | `gh pr checks 654` at 7f4c173b: every completed check succeeded; `Full Test Suite (test:all)` is in progress. No check has completed with a failure. |

### Criterion 1: blob IDs (911505874c67 vs 7f4c173b)

| Path | 91150587 | 7f4c173b |
|---|---|---|
| `FailSafe/extension/scripts/g4-verify-checkpoint.cjs` | a2436d6b5422511bc7cf1dd15161cc775e1a970c | same |
| `FailSafe/extension/scripts/lib/g4/git.cjs` | e176e006ed367ce1c22bf9ec6091ed128b6d9bfc | same |
| `FailSafe/extension/scripts/lib/g4/release-mode.cjs` | 76aabe2fbd970e5c8c741ffded1f51ef77797eff | same |
| `FailSafe/extension/src/test/scripts/g4ReleaseLayout.test.cjs` | 545272aebcbbc5515d690c05b7b79ae151ddd206 | same |
| `FailSafe/extension/src/test/scripts/g4ReleaseLayoutPaths.test.cjs` | ac47e0dc601a498e9e56d5d61e8cc20f37b01087 | same |
| `docs/releases/G4_WITNESS_OPERATIONS.md` | 29cc085b74d5369b405095583830de4cc35e1361 | same |
| `docs/releases/RELEASE_INTEGRATION_PATH.md` | 1962c2fdf6a46547c56428fd8d4fe7cf4c724ab9 | same |
| `.failsafe/governance/plans/plan-v6013-638-g4-release-evidence-layout.md` | 3ab6d45a6587696e995fe2585dc6427bc974ecb8 | same |

Also unchanged since the audit: the VETO report (8199ba57), `plan-iter1.json` (ae01ec33) and `plan-iter1.provenance` (6fc87e53). The `release-mode.cjs` and `git.cjs` blobs match the ones the PASS report names (`76aabe2f…`, `e176e006…`).

### Ledger and gates

- **#938 to #946.** The ledger diff against `origin/main` starts after #946's closing `---` and removes nothing, so every earlier byte is identical to main.
- **Sequence.** #947 follows #946, and #948 follows #947. #947's Previous Hash `1fda71ae…efbe` equals #946's Chain Hash (line 36270). #948's Previous Hash `333f31e2…b14e` equals #947's Chain Hash.
- **Content hashes** (LF-normalised SHA-256 of each committed report; the files contain no CR, so raw and LF-normalised hashes are the same):
  - VETO report `964d4553ab4e13e388a51d909898a64af8969f99c3b8c89825f76c88c0642bca` equals #947's Content Hash.
  - PASS report `65ed5f7dc5294901516be02cfd25d8e5734ceeb2805282bdadcc04ef51355115` equals #948's Content Hash.
- **#947 Decision text, checked against the VETO report:**
  - Audited SHA 2b223e5f on 9f16548d: true (the report says "one commit on origin/main 9f16548d").
  - Verdict VETO: true.
  - B1: true. The parser split on every tab, so an extra entry and a missing query were accepted; on NTFS the run was refused only by a later check, and a POSIX simulation reached a release PASS.
  - B2: true. Case-variant prefixes gave PASS OK, release mode, exit 0 from the CLI on Windows, and the weakness is present on main.
  - N1 to N10 summary: true. It covers empty trees (N1), the GIT_DIR plus GIT_WORK_TREE PASS that is also present on main (N2), eight surviving mutants, and the record inconsistencies (N7).
  - "Diagnostic mode byte-identical to main": true (21 of 21 runs).
  - "No real key, TSA or network service": true.
  - "committed in 91150587": true (the report was added in that commit).
  - Dates: see O1.
- **#948 Decision text, checked against the PASS report:**
  - Audited SHA 91150587, two commits on 9f16548d: true.
  - B1 and B2 closed as described: true. That is the three tab trees and the POSIX simulation for B1, and for B2 the three prefixes, in place and in a fresh clone with a clean status, while main returns PASS OK.
  - "more than 60 crafted trees, a 40-row environment matrix and 60 mutants": true.
  - The false-refusal search (one, two and six checkpoints, worktrees, the real tree): true.
  - "66 of 66": true.
  - Razor within limits: true.
  - The N1 to N12 summaries: true. They cover the root directories not being required to be trees, duplicate entries, 8.3 and other aliases, core.worktree and a planted git, and twelve non-equivalent mutants.
  - "written 2026-11-11 02:28 UTC, after that commit": true. The file time is `2026-11-10 21:28:36.99 -0500`, which is 02:28:36Z on 2026-11-11. Commit 91150587's committer time is `2026-11-10T20:47:25-05:00`, which is 01:47:25Z, so the report was written 41 minutes after the commit.
  - The closing sentence (an implementation verdict, not G4 operational qualification; no key, TSA, trust anchor or checkpoint; BLOCKED TSA_POLICY_UNSELECTED until #647) does not come from the report, but it is true. The verifier output is shown above. `tools/g4` tracks no checkpoints, keys or TSA roots. #647 is open, titled "consolidated G4 owner decision record (PROPOSED, NOT APPROVED)". See O2.
- **PASS report provenance.** The report names `911505874c67aff0e15303ccb715942942e97e0b` as audited, and its file time follows that commit's committer time (see above). Its "State left behind" section says HEAD was 91150587 when the audit finished.
- **Gates** (`.qor/gates/2026-11-11T0032-37b50f/`):
  - `audit-iter1.json` is consistent with #947: verdict VETO, ledger_entry 947, ledger_chain_hash `333f31e2…b14e` and report_content_hash `964d4553…` (both equal #947), audited_candidate 2b223e5f. Its target_content_hash `45208a6c…a83f` equals the SHA-256 of the plan at 2b223e5f.
  - `audit-iter2.json`, and `audit.json` (byte-identical to it), are consistent with #948: verdict PASS, ledger_entry 948, chain hash `64c549da…e541` and report hash `65ed5f7d…` (both equal #948), audited_candidate 91150587. Its target_content_hash `99857352…9b16` equals the SHA-256 of the plan at 91150587, which is unchanged at 7f4c173b.
  - `plan-iter2.json`, and `plan.json` (byte-identical to it), are consistent: iteration 2, plan_content_hash `99857352…9b16`. `plan-iter1.json` is unchanged, with `45208a6c…`.
  - `audit_history.jsonl` has two rows, matching the two audit files.
  - Retrospective disclosure is honest. Every new gate file carries `"ordering": "retrospective: recorded on 2026-11-12 after the reviews were performed on 2026-11-10/11; not a pre-implementation verdict"`. Both ledger entries say "recorded here on 2026-11-12 from the preserved report" and explain the delay. The timestamps `2026-11-12T01:28:49Z` match the commit time of 7f4c173b (`2026-11-11T20:29:08-05:00`, which is 01:29:08Z), and no gate claims to precede implementation.
  - The `human_oversight` values (`veto`, `pass`) follow the repository convention (35 `pass` and 23 `veto` across gate files) and do not by themselves claim a human reviewer.

## Blocking findings

None.

## Observations (non-blocking)

- **O1. #947 mixes time zones in its dates.** #947 says the audit was "performed on 2026-11-10 and recorded here on 2026-11-12".
  - The VETO report's file time is `2026-11-10 19:56:43 -0500` (00:56:43Z on 2026-11-11), and its audited commit was created at 00:32:23Z on 2026-11-11. So "2026-11-10" is the local (-05:00) date, while "2026-11-12" is the UTC recording date (2026-11-11 in local time).
  - #948 uses UTC throughout ("performed on 2026-11-11", "written 2026-11-11 02:28 UTC").
  - Each date is correct under one of the conventions the record uses: commit times are in -05:00 and ledger timestamps are in UTC. So I do not count it as a false statement.
  - Read together, though, the entries suggest that the two audits were on different days and that #947 waited two days to be recorded. In fact the two reports were written 92 minutes apart, and the VETO was recorded about 24.5 hours after it was written.
  - A later correction entry could restate the dates in one convention. The gate files' "2026-11-10/11" is accurate.
- **O2. #948 adds a caveat that its report does not contain.** The final sentence (no key, TSA, trust anchor or checkpoint; BLOCKED TSA_POLICY_UNSELECTED until #647) comes from the plan and docs, not the PASS report. It is true and narrows the verdict, so it does not mislead.
- **O3. The session pointer names another session.** `.qor/session/current` at head points to the #652 session `2026-11-10T2349-6c3050`, not to this PR's `2026-11-11T0032-37b50f`. Taking main's value was the right merge choice. Any later qor phase for #638 run from this branch must name its session explicitly.
- **O4. Provenance tags cannot be verified here.** Checking the `.provenance` HMAC tags needs a key this review does not have. Their `payload_sha256` values are not the SHA-256 of the raw JSON files, presumably because they hash a canonical form. Both audit reports had the same limitation.
- **O5. `high_risk_target: false` persists in `plan-iter2.json`,** although the plan, both audits and both ledger entries grade the change L3. The VETO report raised this as N7 and it was not corrected. It affects record precision only.
- **O6. A fresh worktree needs `npm run compile` before `npm run test:node`.** Without it, 36 test files fail with MODULE_NOT_FOUND. This comes from the environment, not the delta.

## CI (exact head 7f4c173b, read-only `gh pr checks 654`)

Success: Analyze (actions), Analyze (javascript-typescript), Analyze (python), CodeQL, Compile and lint (macos-latest, ubuntu-latest, windows-latest), Dependency Review, Semgrep Community Edition, standards (two runs), verify-vsix-guardrails.

Running: Full Test Suite (test:all), in progress at review time. Under the verdict rule this does not block. If it completes with a failure, check whether the failing file is one the delta touches. The delta adds no product code beyond the audited source and main.

## State left behind

- Review worktree `/c/dev/mythologiq/FailSafe-g4lay`: unmodified except for this new file (`.agent/` is git-ignored). `git status --short` was empty before the file was written, and the verifier run there is read-only.
- Scratch worktree `C:\Users\krkna\AppData\Local\Temp\d654rev-1204\wt` (detached at 7f4c173b): the junction was removed with `rmdir`, leaving its target `FailSafe-g4\...\node_modules` intact, and the worktree was removed and pruned. Logs remain in `C:\Users\krkna\AppData\Local\Temp\d654rev-1204\` (`g4tests.log`, `testnode.log`, `testnode2.log`, `compile.log`) and can be deleted.
- Nothing was committed, pushed, posted or triggered. Network use was limited to read-only `gh` calls (PR view, checks, check-runs, and the title of issue #647). The tests used no key, TSA or network service.
