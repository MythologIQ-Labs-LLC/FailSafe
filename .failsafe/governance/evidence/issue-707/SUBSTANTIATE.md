# SUBSTANTIATION REPORT: plan-707-voice-dependency-isolation (iteration 3)

**Timestamp**: 2026-11-23T06:10:24Z
**Phase**: SUBSTANTIATE
**Judge**: The Qor-logic Judge (fresh-context independent subagent; authored none of the plan, code, tests or records)
**Session**: `2026-11-23T0340-d5e334`
**Target**: PR #712 as a whole, `origin/main...f4251d8908e27d5ad088a7150b21d1c69afe7521` (merge base 0c0e30e042f628455c2a7f4d1287b5efd9d3ecfc, which is still origin/main), plus the supplied bounded-read patch
**Plan**: `.failsafe/governance/plans/plan-707-voice-dependency-isolation.md` iteration 3, raw sha256 6191b7a3218fd639b0925ceffcb0e00f65a58ea9ce48176f5470a520776bfbe7 (re-hashed: equal)
**Authority chain**: Entry #970 VETO, #971 VETO, #972 PASS L3 (`AUDIT-PLAN-iter3.md`, conditions C1-C8), #973 IMPLEMENT (`IMPLEMENTATION.md`)
**Risk Grade**: L3
**Tooling**: qor-logic 0.176.1 (frozen, not modified), QOR_SKILL_ACTIVE=substantiate, QOR_MODEL_FAMILY=claude; Node 22.23.5; System32 bsdtar first on PATH; gh authenticated
**Skill followed**: the installed qor-logic 0.176.1 `qor-substantiate` SKILL.md and its three references. The repository copy at `.claude/skills/qor-substantiate/SKILL.md` differs from it only in Step 9.7 (tag push), which this cycle does not reach.

---

## VERDICT: VETO (session NOT sealed)

The implementation matches the plan. I verified that by execution, and I found no Reality-versus-Promise defect in the #707 code, tests or implementation records. The seal is still refused, because the skill's Step 4.7 documentation-integrity gate (strict) raises a `ValueError`. The skill makes that an ABORT with no waiver path ("Any raised ValueError ABORTs substantiation ... No retry-with-waiver path"). The defect predates #712. The iteration 3 audit flagged it in its Documentation Drift section as something that "would hard-block at /qor-substantiate", and nobody remediated it. The precedent this repository used for it (ledger entries for plan-475 and plan-478) supplied the gitignored home brief locally. That brief does not exist anywhere on this host, so the precedent path is not available.

One remedy is needed (S1 below), and then `/qor-substantiate` must be re-run. Everything else verified here can be reused on that re-run, provided HEAD changes only by the S1 remedy and the records.

---

## Blocking finding

- **S1 (Step 4.7 ABORT, documentation integrity).** `doc_integrity.run_all_checks_from_plan(plan_artifact, repo_root=".", strict=True)` raises `ValueError: Orphan home: 'Vacuous pass' -> '.failsafe/governance/RESEARCH_BRIEF_qor169-alignment-2026-09-03.md' does not exist.` The source is `qor/references/glossary.md:111` (`home:` of the `Vacuous pass` term). The named file is ignored by `.gitignore:11` (`.failsafe/`, whose tracked files are force-added) and is absent from this worktree, from the main checkout and from the workspace. It is pre-existing: the same glossary line is at origin/main 0c0e30e0, #712 does not touch the glossary, and `.agent/staging/AUDIT_REPORT-917-release-plan-iter1.md:147` reports the same orphan. Diagnostic run (not passing evidence): in a scratch export of f4251d89 with a placeholder at that path, strict doc_integrity raised nothing else, so S1 is the only Step 4.7 failure.
  - **Required action**: point `qor/references/glossary.md:111` at a tracked file that exists (the term's own definition text cites the FailSafe ladder findings; `docs/META_LEDGER.md` is already in its `referenced_by`), or commit the brief. Record that glossary edit as UNPLANNED in the seal entry. Then re-run `/qor-substantiate` from Step 0. A local placeholder is not acceptable: it would make the gate pass without the home existing.

## Non-blocking findings (disclosed; each must be carried into the re-run's seal entry)

- **N1 (Step 4.6.14 publication_boundary_lint, rc 1, scope structural)**: 537 findings at the head, 528 at origin/main. I measured both on `git archive` exports with `--no-git`. The 9 that #712 adds are all in its governance records: `AUDIT-PLAN-iter1.md:71, 142, 163 (2)`, `AUDIT-PLAN-iter2.md:122, 164`, `AUDIT-PLAN-iter3.md:117`, `plan-iter2.md:49`, `plan-707-voice-dependency-isolation.md:57`. Each is a generic OS install path (the System32 tar executable, and the Git for Windows system gitconfig quoted as `git config --show-origin` output). None reveals an outside workspace or repository, which is what `doctrine-publication-boundary.md` prohibits. The lint is also miscalibrated for this consumer repository (`_SELF_REPO` is Qor-logic, so the repository's own FailSafe URLs are flagged). The repository precedent tolerates rc 1 as standing debt tracked by count, with "none in this cycle's files". This cycle does not meet that criterion, so I am disclosing the deviation rather than relying on the precedent. The affected files carry ledger-committed hashes (#970-#972) and the intent-locked plan hash, so the recommendation is per-line `boundary-lint: ok=<reason>` markers the next time those records are amended (with an AMENDMENT entry per `doctrine-ledger-commitment.md`), not an edit now.
- **N2 (Step 4.6.5 secret_scanner)**: `--staged` exits 0, but 0 files are staged, so the result is vacuous by construction (the repository glossary's own `Vacuous pass` example). `--files` over the 65 added or modified files reports 1 BLOCK: the `xoxb-` string on `docs/META_LEDGER.md:32531`. It was added by 7e3c35be on 2026-10-16, it is on origin/main, and the ledger itself describes it as a fake test fixture. Excluding the ledger: rc 0. Credential-shaped strings on lines #712 adds: 0. **Required for the re-run**: the seal staging will include `docs/META_LEDGER.md` and will trip this gate, so add the fixture token to `.qor/secret-scanner-allowlist` (the GH #359 consumer surface) before staging, or the Step 4.6.5 run on the real staging will ABORT.
- **N3 (plan Phase 1b text vs test)**: the plan says the injected io also counts `readSync`. `vendorVoiceExisting.test.ts:74-80` counts `openSync`, `readFileSync` and `createReadStream`. It is functionally covered, because a `readSync` on the target needs a descriptor from the counted `io.openSync`, and the recorded mutation fails the test (executed below). `IMPLEMENTATION.md` names the three counters but does not list this under "Differences from the plan text".
- **N4 (package-voice-pack.cjs:90)**: `cleanupAfterFailure` returns silently when `readVersion` throws. The baseline printed `artifact cleanup warning: <parse error>` for an unreadable `package.json` before the same `ERROR:` line. Only that duplicate diagnostic is lost; the ERROR line and exit 1 are unchanged. This is disclosed in IMPLEMENTATION.md "Differences", but it is a third behaviour change beyond the plan's two declared ones.
- **N5 (vendor-voice-fs.cjs:14-21)**: `COMMITTED_VOICE_ASSETS` is a new hard-coded six-name list. The audit's macro pass expected PACKAGES to be used. It now sits beside `package-voice-pack.cjs:14-21` `REQUIRED_ASSETS` and the inventory allowlist at `vendor-voice-fs.cjs:135-138`, so there are three copies that can drift. The plan did not require PACKAGES.
- **N6 (pre-existing Razor residue outside Phase 2 scope)**: `dependencyFloor.test.cjs:125-146` nests 4 deep (three `for` and an `if`). The same shape is at origin/main lines 96-113; #712 only adds the sharp-absent guard. `bundle.cjs` `bundlePattern` is 46 lines with nesting 4, a pre-existing exclusion that #712 leaves unchanged.
- **N7 (g4Witness attribution)**: the attribution holds, but the mechanism is more precise than recorded. `g4Witness.test.cjs:110` requires the CLI not to PASS on the real repository. origin/main carries the committed checkpoint `tools/g4/checkpoints/g4-000001` (a7839b75; #688 reconciled the docs). In a full clone the CLI verifies it and prints `PASS OK: 1 checkpoint(s) verified to g4-000001`, so the test fails (reproduced: local test:node 1170 tests, 1160 pass, 1 fail, 9 skipped, the only failure being this test). CI checks out depth 1, the attested commit 9defb951 is absent, and the CLI refuses, so the test passes. The test is pre-existing and environment-dependent, and #712 touches none of `tools/g4`, `scripts/lib/g4`, `g4-verify-checkpoint.cjs` or `g4Witness.test.cjs`. A BACKLOG row is recommended (stale test premise).
- **N8 (#532 Windows timeouts attribution)**: the attribution holds. In run 45118465441, `#532 governed commit link (B286)` passes 10 of 10 and `#532 B320 delivery review` passes 71 of 71, and `git diff 0c0e30e0...f4251d89` touches nothing under `src/extension` or `src/governance`. I did not re-run `npm test` (extension host) on Windows.
- **N9 (Step 6.5 documentation currency, WARN)**: README.md and CHANGELOG.md are not in `files_touched` for a `feature` class. The plan's non_goals exclude any version bump, tag or release. Both CHANGELOGs have `## [Unreleased]`, so release preparation must add the #707 line there.
- **N11 (Step 3 UNPLANNED, WARNING)**: 04c69c85 changes `docs/architecture/integrations/acp-devin.md` (one citation row, `bundle.cjs:181-185` to `153-157`). No Phase 1-3 Affected Files list names it. The change is forced by the planned `bundle.cjs` line shift and verified by FX1003 (test:node passes it locally and on Linux). It is disclosed in IMPLEMENTATION.md's commit table and in `implement.json` `files_touched`. The earlier PR change to the same file (e7c07d73) is inside the plan's whole-PR scope. Planned files missing: none.
- **N10 (tool residue)**: `install_drift_check --host claude --scope auto` prints `OK` even though the repository `.claude` skill copy differs from the global install at Step 9.7, which may be a vacuous pass. `gate_chain_completeness` inspected 0 sessions and says completeness is "unverified, not confirmed".

---

## Conditions C1-C8 (audit #972)

| Condition | Status | Evidence (executed by me unless stated) |
|---|---|---|
| C1 | MET | `git ls-files --eol`: both JS files and both notes `i/lf w/lf attr/-text`, the four binaries `i/-text w/-text attr/-text`. `npm run verify:voice-pins` exit 0 on this Windows host: "pinned upstream bytes match 6 browser assets on disk and committed HEAD; no source files changed". Moved-code identity: PACKAGES, MAX_ASSET, assertPinnedDigest, downloadPinned, extractApprovedArchiveMembers, sanitizeWhisperBrowserBundle, verifyPinnedVendorOutputs and commitOutputs are AST-text-identical to both 7278ffdc and a465bd85. verifyCommittedVendorOutputs at 477955a7 is split verbatim into assertExpectedCheckoutRoot, assertCommittedAsset and verifyCommittedVendorOutputs (vendor-voice-verify.cjs:52-110; read side by side). LD12 identities are recorded in IMPLEMENTATION.md as the audit required; I did not re-fetch run 44694011230 |
| C2 | MET | `gh run view 45118465441`: PR Full Test, event pull_request, headSha f4251d8908e27d5ad088a7150b21d1c69afe7521, success. The checkout fetched and checked out f01c36c9d4972ecb13ee82ea7ad744df51f509b0 "Merge f4251d89 into 0c0e30e0". `gh api commits/f01c36c9`: parents 0c0e30e0 and f4251d89, tree e8dd4dd7, which equals `git rev-parse f4251d89^{tree}`. The merged tree is the head tree, and the base equals origin/main now. The log lists 35 vendor tests (verification 9 including the Phase 1c test, staging 7, source pins 4, promotion 7, existing 4, committed assets 4) and 12 packaging tests including the prerelease test, each with a check mark and none pending. Also in the same log: extension host 6215 passing, 15 pending, no failing line; test:node 1170 tests, 1135 pass, 0 fail, 35 skipped; test:ui 264 passed, 4 skipped; `test:all` chains lint, runner-coverage and citation-parity with `&&`, and the job succeeded. Runs 45118465356, 45118465415, 45118465561, 45118465373 and 45118465490 on the same head: success |
| C3 | MET | Independent TS-AST digest (per-line leading whitespace stripped, leading `export ` removed): the 30 test names of 3d73c539 `vendorVoiceIsolation.test.ts` are all present after the split; 29 of 30 bodies are equal; the one that differs is the declared exception "upstream parity is checked against committed HEAD bytes, never just a dirty worktree". The 3 helpers are equal: extensionRoot bc13782c..., vendorTool 355f9e8a..., temporary 2e81365b.... In the exception, every assertion line is identical and in the same order; the git status assertion moved into `committedPiperFixture` (vendorVoiceVerify.test.ts:17) |
| C4 | MET | package-voice-pack.cjs:39-56 threads one `repoRoot` through readVersion, assertSafeDistDirectory, collectFiles and cleanupAfterFailure; no module-level REPO_ROOT. `removeCandidateArtifacts` (59-66) calls assertSafeDistDirectory before both `rmSync`. The cleanup warning (96) is written before the CLI's `ERROR:` (29), then exit 1. Split modules define only constants and functions at top level; vendor-voice-fs.cjs imports only vendor-voice-source.cjs and built-ins; ROOT and VENDOR are AST-identical to the baseline (see N4) |
| C5 | MET | 477955a7 has the single parent a465bd85; the baseline blobs are 299d60a5 and a7d07252; the supplied patch sha256 is 2ff29ced... and the archive sha256 is 89e9f70a... (both recomputed), and the patch inside the archive is the same file. Applying the patch to the a465bd85 blobs gives 493993375fafe1ba3a14449bdaad535b9c51722f and b4d30c50b42c6d5e056269761f3f697e48f8f66e, byte-identical to 477955a7. The patch is present verbatim and the commit touches only those two files |
| C6 | MET | packageVoicePack.test.ts:197-217: `run` writes `opts.cwd/args[1]` and returns `{status: 1, stderr}`; the test asserts `calls === 1`, that the archive existed on return, and that neither archive nor checksum remains, for 6.1.0-rc.1 and 6.1.0. Mutation results are below |
| C7 | MET | bundle.cjs:113 `assertCommittedVoiceAssets(path.join(root, 'src', 'roadmap', 'ui', 'vendor'), fs, root);` comes before `copyDir(` at 116, inside `main` at lines 95-187 (93 lines, measured with the TS AST); the file is 296 lines by `wc -l` (origin/main 313; same AST measurement there: main 93, bundlePattern 46) |
| C8 | MET | Local focused run: 36 passing, 11 pending, 0 failing. The 11 pending are exactly the listed set: 5 staging, 2 verification, 4 packaging |

## Plan phase and Unit Tests mapping

| Plan item | Code | Executed test |
|---|---|---|
| Phase 1 patch verbatim | 477955a7 (blob-identical, C5); `hashExistingVendorAsset` now at vendor-voice-fs.cjs:66-99, AST-identical to 477955a7 | "oversized or empty old asset ..." and "old file modified after open ..." pass locally and on Linux |
| Phase 1b strengthened test, mutation, red run | vendorVoiceExisting.test.ts:63-95 | M1 and M1b below |
| Phase 1c `-text` rule and check-attr test | .gitattributes (two rules) | "voice vendor files are never line-ending converted" passes; red evidence `git check-attr --source=0c0e30e0 text` gives `unspecified`; worktree gives `unset` |
| Phase 2 module split | vendor-voice{,-source,-fs,-transaction,-verify}.cjs; exports equal the baseline's 10 names plus assertCommittedVoiceAssets | the 30 moved tests pass; digests C3; transaction, verify and main splits read side by side against 477955a7 (exact extraction) |
| Phase 2 assets tests | assertCommittedVoiceAssets (fs.cjs:166-180) | vendorVoiceAssets.test.ts: 4 pass; M3 below |
| Phase 2 prerelease cleanup | package-voice-pack.cjs:39-98 | prerelease test passes; M2 below |
| Phase 2 vendor-piper.cjs deleted | deleted; `vendor:piper` runs `vendor-voice.cjs --piper-only` (package.json:842) | `git grep vendor-piper` outside the records: none |
| Phase 3 records | voice-pack.md:126 (modules, bounded read, remove-then-revendor, `.gitattributes`); both VENDOR.md notes; the candidate plan's "Superseded by" line | read |
| D1-D4 core install | package.json without piper-tts-web or @xenova/transformers; lock `onnxruntime-node` count 0; `node_modules/onnxruntime-node` and `sharp` absent; `require('better-sqlite3')` loads | "core npm lock excludes native voice inference packages" passes |

## Mutation runs (scratch copy of scripts and compiled tests; worktree untouched)

- **M1** (Phase 1b): inserting `if (original) io.readFileSync(target);` before the bounded hash (transaction.cjs:38) makes "oversized or empty old asset ..." fail with "the rejected existing file must never be opened or read".
- **M1b** (red run): restoring the baseline unbounded `createHash(...).update(io.readFileSync(target))` makes both existing-asset patch tests fail with "Missing expected exception".
- **M2** (prerelease): restoring `if (!/^\d+\.\d+\.\d+$/.test(version)) return;` in cleanupAfterFailure makes the prerelease test fail with "6.1.0-rc.1: partial archive removed". Direct check: under the mutant 6.1.0 leaves no archive and 6.1.0-rc.1 leaves the archive; with the fix neither does. M2b (no failure cleanup at all) fails the same test.
- **M3** (oversized bound): removing `|| stat.size > MAX_ASSET` from assertCommittedVoiceAssets makes "an empty, oversized or directory asset ..." fail.
- All mutated files were restored, and `cmp` confirmed them equal to the worktree.

## Section 4 Razor (TypeScript compiler AST; suites are containers, not functions)

| File | Lines | Max function or test body | Max nesting |
|---|---|---|---|
| scripts/vendor-voice.cjs | 69 | 24 | 3 |
| scripts/vendor-voice-source.cjs | 102 | 21 | 2 |
| scripts/vendor-voice-fs.cjs | 186 | 34 | 3 |
| scripts/vendor-voice-transaction.cjs | 181 | 35 | 3 |
| scripts/vendor-voice-verify.cjs | 112 | 32 | 3 |
| scripts/package-voice-pack.cjs | 197 | 24 | 2 |
| scripts/bundle.cjs | 296 (origin 313) | main 93 (cap 93); bundlePattern 46 (excluded) | 4 in bundlePattern (excluded) |
| six vendorVoice*.ts files and packageVoicePack.test.ts | 13 to 218 | 36 | 2 |

There are no nested ternaries (`collectPinnedOutputs` has one single ternary), no TODO or stub, and no console.log beyond the CLIs' operator output.

## Reliability ladder and protocol steps

| Step | Result |
|---|---|
| Preflight governance-health | all 8 OK |
| Step 0 prior artifact | found, valid (`implement-iter1.json`, identical gate) |
| 2 PASS verdict / implementation | #972 PASS present; implementation present |
| 2.5 version validation | `version_applicability.validate` needs pyproject.toml: SKIP. Manual: change_class feature (release class); package.json 6.0.13 equals the highest tag v6.0.13; a feature target 6.1.0 would exceed it; the plan's non_goals forbid any bump, tag or release |
| 3 ledger_commitment | OK (23 touched artifacts) |
| 3.5 BACKLOG blockers | `docs/BACKLOG.md` Security Blockers section is empty; no BACKLOG row names #707, #710 or onnxruntime |
| 4 test audit | no presence-only tests; every new test invokes its unit and asserts its output; runtime-principal: not applicable (no DB path) |
| 4.6 intent_lock verify | VERIFIED (plan and audit hashes equal; captured head a465bd85 is an ancestor of HEAD) |
| 4.6 skill_admission / gate_skill_matrix / session_id_lint | ADMITTED / 0 broken of 156 / rc 0 |
| 4.6 substantiate_gates and substantiate-capability | crash: both read `qor/skills/governance/qor-substantiate/SKILL.md` relative to the repository, which a consumer repository does not have. SKIP (prerequisite absent) |
| 4.6.5 secret_scanner | see N2 |
| 4.6.6 procedural_fidelity | rc 0 |
| 4.6.7 dod_check | rc 0 |
| 4.6.8 merge_velocity | healthy (0 merged in 7 days) |
| 4.6.9 skill_size_budget | WARN only (qor-substantiate 37.0 KB) |
| 4.6.10 data_api_acl | disclosed SKIP (no SQL migrations) |
| 4.6.12 continuity | not applicable (the plan declares no execution_continuity) |
| 4.6.13 install_drift | OK, scope auto, drift 0 (see N10) |
| 4.6.14 publication_boundary | rc 1, structural (see N1) |
| **4.7 doc_integrity strict** | **ValueError: ABORT (S1)** |
| 4.7.5 governance-index | in a scratch export: `--advance-last-reviewed 2026-11-23 --enforce` rc 0, no unregistered or tier3 drift. The mechanical advance would re-date the top line's prior description, so a prepended line is proposed in substantiate-doc-edits.md, following repository precedent |
| 6 FEATURE_INDEX | Total 805 / verified 765 / unverified 0 / n/a 40; there is no prior snapshot under `.qor/feature_index_snapshots`, so the regression diff cannot run; surface lint WARN FX922 (pre-existing) |
| 6.5 doc currency | WARN (see N9) |
| 7.4 SSDF | `**SSDF Practices**: PO.1.4, PS.2.1, PW.1.1` |
| 7.5 / 7.6 / 9.5.5 | no repository-root pyproject.toml, package.json or Cargo.toml: SKIP (prerequisite absent); the plan's non_goals forbid a bump, tag or release in any case. No version, CHANGELOG stamp or tag was produced |
| 7.7 / 7.7.5 / 7.8 / 7.9 / 8.5 / 9.x | not reached because of the 4.7 ABORT. 7.8 run read-only: 0 sessions inspected. No spec deltas. No commit, push, tag, PR state change or session rotation |
| Ledger chain | `verify-ledger --post-anchor --boundary 382`: post-anchor clean. #970-#973 content and chain hashes recomputed independently (SHA256(LF-normalized report); SHA256(content + "\|" + previous)): all four equal |

## Local commands executed

`npm run compile` (0); focused vendor and package mocha (36 passing, 11 pending, 0 failing); `npm run lint` (0 errors, 138 warnings); `npm run test:runner-coverage` (PASS, 768 files); `npm run test:citation-parity` (0); `npm run test:node` (1170 tests, 1160 pass, 1 fail = N7, 9 skipped); `npm run verify:voice-pins` (0). Not run locally: `npm ci` (node_modules already present; install facts checked directly), `npm run bundle`, `build:package` and `test:ui` (all three passed inside Linux run 45118465441, whose log shows `build:package` writing 6 files), and `npm test` (extension host; Linux result in C2).

## Disposition

Session NOT sealed. VETO on S1 only. Next: remedy S1 (glossary home), prepare the N2 allowlist before staging, then re-run `/qor-substantiate`. No version bump, tag or release is authorized or was performed.
