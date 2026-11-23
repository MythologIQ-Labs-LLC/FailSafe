# AUDIT REPORT

**Tribunal Date**: 2026-11-23T04:06:37Z
**Target**: `.failsafe/governance/plans/plan-707-voice-dependency-isolation.md` (iteration 2, raw sha256 c27e11615904a7294f5347452a3608afd286b0772caba26fb2ce36569c40bc82)
**Scope audited**: PR #712 head a465bd85249862a9e355ad584a338ca6fc9aeb25 (merge base origin/main 0c0e30e042f628455c2a7f4d1287b5efd9d3ecfc, 15 files) plus `fix.patch` sha256 2ff29ced70c74795f0c3a9c0393a710c201308b78315ff41fe69ddd07ada8458
**Session**: `2026-11-23T0340-d5e334`; plan gate `.qor/gates/2026-11-23T0340-d5e334/plan.json` (iteration 2, plan_sha256 matches the target)
**Risk Grade**: L3
**Auditor**: The Qor-logic Judge (fresh-context independent subagent; did not author the plan or the code). Mode: solo (codex-plugin and external reviewer absent; capability shortfall emitted). `audit_risk_score`: option_b_required true (high-citation-surface). This independent fresh-context audit is the Option B review.
**Tooling**: qor-logic 0.176.1 as installed (frozen), QOR_SKILL_ACTIVE=audit, QOR_MODEL_FAMILY=claude; Node v24 on Windows 11; Git for Windows with system core.autocrlf=true

---

## VERDICT: VETO

---

### Executive Summary

Iteration 2 answers most of the iteration 1 VETO. I executed several of its answers on this host and they hold. The strengthened Phase 1b assertion catches the recorded mutation. The `.gitattributes -text` rule makes the JS assets check out LF, and `verify:voice-pins` then exits 0 on a default Windows checkout. The 30-test file map is complete. vendor-piper.cjs has no remaining reference. The plan still cannot proceed, for four reasons. (1) The new prerelease cleanup test, which is the only proof the plan offers for the V3 fix, already passes against the unfixed baseline. I ran its scenario at a465bd85 and the stale archive and checksum were removed, because the normal-path removal at package-voice-pack.cjs:41-42 runs before the missing-asset failure. The changed failure-cleanup branch is never reached. (2) The V8 answer covers only empty and wrong-type assets. The boundary claims the build message tells the operator to remove an over-75-MiB asset, but the moved check has no upper size bound, so that claim is false. (3) The Linux run is now the plan's only evidence for the seven symlink and ancestry tests and for C1, but the plan names no Linux host. This host has neither WSL nor Docker. The only Linux runner, CI, is evidence the plan itself declares "not native acceptance". C1's Linux `verify:voice-pins` run is not in the DoD. (4) The plan requires `bundle.cjs` `main` to be at most 93 lines. LD5 measures it at 94, and Phase 2 only substitutes one call ("unchanged in length or shorter"), so following Phase 2 literally fails the plan's own DoD.

### Preflight and Step 0

- `qor-logic governance-health --profile skill-entry`: all 8 artifacts OK (META_LEDGER pre-anchor residuals disclosed and tolerated; post-anchor band clean).
- Merkle check of the uncommitted head: Entry #970 Content Hash d8918b32... equals SHA256 of `AUDIT-PLAN-iter1.md` (LF-normalized). Chain Hash 2ab41b3864fe196e163c5500e13bbdbf96d5b74bedd4549424693f7132ee8949 = SHA256(content + "|" + 9aecdbf5...) recomputes exactly. The chain is intact (see N7 for a formatting residual).
- Step 0 prior artifact: found, valid. Step 0.3 `plan_iteration_status_lint`: rc 0. Step 0.4 unchanged-plan: should_skip false (the hash differs from iteration 1). Step 0.5 cycle-count and session-total: none.
- `current_phase_plan_path()` cannot resolve on a detached HEAD, so every plan-path lint ran with the explicit target path.
- Step 0.6 ladder (WARN-only): plan_test_lint, plan_enumeration_lint, plan_text_consistency_lint, delivery_branch_lint, plan_signature_widening_caller_lint, plan_data_round_trip_lint, plan_feature_tdd_lint, gate_schema_freeze_lint (0 unjustified): clean. plan_grep_lint: 6 WARNs, all false positives (N6). ci_coverage_lint: 1 WARN (oss-sast semgrep install, out of scope). workspace_fragility_check: high (pre-existing: 333 pre-anchor ledger chain failures, 48 branches, dirty gate artifacts). plan_live_progress_lint: 18 pre-existing findings, none in scope. publication_boundary_lint: 528 pre-existing structural findings. sg_closure_lint: crashed (FileNotFoundError on a repo-relative `qor/references/...` path); recorded as SKIP.
- Prompt Injection Pass: rc 0. 4 `<script` code-span WARNs, all in historical META_LEDGER text. The plan is clean.
- Version-Applicability Pass: SKIP, because the tool requires pyproject.toml. Manual check: `change_class: feature` and non_goals exclude any bump. No finding.
- Runtime Contract Walk: 0 findings.

### Iteration 1 grounds and conditions: status

| Ground | Iteration 2 answer | Status | Evidence |
| --- | --- | --- | --- |
| V1 | Phase 1b counts readFileSync/createReadStream/openSync/readSync on the target (plan:76) | ANSWERED | I executed a scratch model of the planned assertion against three trees. Patched: passes (sizes 0 and 75 MiB+1). Patched plus `if (original) io.readFileSync(target);`: fails (reads=1) at both sizes. Baseline: fails. Residual: N2, N3 |
| V2 | `-text` for the piper and whisper trees; verify:voice-pins in CI and DoD (plan:89, 174, 159) | ANSWERED (Windows) | Scratch clone (core.autocrlf=true) at a465bd85: before the rule, both JS files and both VENDOR.md are `w/crlf`. After the rule and `git checkout HEAD -- <dirs>`, all are `w/lf attr/-text`, and `git check-attr text` prints `text: unset` for all 8 paths. `node scripts/vendor-voice.cjs --verify` then exits 0 ("pinned upstream bytes match 6 browser assets on disk and committed HEAD") |
| V3 | One removeCandidateArtifacts for every accepted version, plus a prerelease test (plan:119, 130) | NOT ANSWERED: the fix is specified, but its only test cannot detect the defect | new V1 below |
| V4 | `collectPinnedOutputs` lowers `main` nesting; the line-603 test gets a fixture helper (plan:117, 109, 128) | ANSWERED | the planned decomposition reaches nesting 3 (for > for > if inside the helper); see Razor table |
| V5 | Exclusion corrected; the asset check moves out of bundle.cjs (plan:14, 118) | PARTIALLY ANSWERED | file length is fine (about 299 lines planned, against a 313 cap); the `main` cap of 93 is unreachable as written (new V4) |
| V6 | vendor-piper.cjs deleted (plan:120) | ANSWERED | LD10 re-run: `git grep -n "vendor-piper" a465bd85 -- . ':!docs/META_LEDGER.md'` returns nothing (rc 1); package.json:842 already runs `vendor-voice.cjs --piper-only` |
| V7 | Body digests, a 30-test file map, Windows and Linux runs (plan:105-109, 128, 131) | PARTIALLY ANSWERED | the map is complete and disjoint (28 baseline lines 19...648 + 2 patch tests = 30, sums 4+7+4+7+8); digests cover test bodies only, not the moved helper (N1); the Linux run has no named source (new V3) |
| V8 | The build message for an empty or invalid asset says "Remove it" (plan:12, 124, 129) | PARTIALLY ANSWERED | the empty and wrong-type cases are covered; the over-75-MiB case is not (new V2) |
| C1 | verify:voice-pins in CI Commands and DoD | PARTIALLY | Windows only (plan:159); the Linux half of C1 is absent (new V3) |
| C2 | POSIX run, 0 pending, before and after the split | STATED, NOT EXECUTABLE AS PLANNED | new V3 |
| C3 | normalized per-test body digests | PARTIALLY | helpers excluded (N1) |
| C4 | fs module imports only source; no top-level side effects; ROOT and VENDOR unchanged | ADOPTED | plan:114, 124 |
| C5 | LD1 refusal kept | ADOPTED | plan:42 |
| N2, N6 | LD7 authority; gate feature_inventory_touches | CORRECTED | LD7 now cites vscodeTestConfigs.cjs:21 and test-file-discovery.cjs:29 (both reproduce); plan.json now carries the n/a-justified row |

### Audit Results

#### Security Pass
**Result**: PASS. No auth placeholders, credentials, bypassed checks or mock returns. The subprocess calls are list-form with `shell: false` (vendor-voice.cjs:81, 411, 431, 440; package-voice-pack.cjs:162). Deleting vendor-piper.cjs removes one spawn site. The `-text` rule weakens no check; it makes the digest-covered bytes reach disk exactly.

#### OWASP Top 10 Pass
**Result**: PASS. A03: no shell interpolation; prerelease identifiers allowed by readVersion (`-[0-9A-Za-z.-]+`, package-voice-pack.cjs:84) contain no path separator, so extending cleanup to them introduces no traversal. A04: no fail-open introduced (the declared V3 change widens cleanup, not acceptance). A05/A08: no change.

#### Ghost UI Pass
**Result**: PASS (build tooling only; no UI). Live-progress: n/a.

#### Section 4 Razor Pass
**Result**: FAIL (V4, the bundle.cjs `main` cap). Planned layout estimated from baseline spans:

| Check | Limit | Blueprint proposes | Status |
| --- | --- | --- | --- |
| Max function lines | 40 | vendor-voice split: `stageVoiceOutputs` 43 -> `prepareVoiceOutput` extracted; `restoreVoiceOutputs` 41 and the cleanup backup check share `assertOwnedBackup(io,item,message)` (288-297 vs 328-337 differ only in message); `verifyCommittedVendorOutputs` 47 -> `assertExpectedCheckoutRoot` + `assertCommittedAsset`; package-voice-pack `main` 53 -> `removeCandidateArtifacts` + `buildVoicePack`; test line 603 (44) -> local fixture helper; `bundle.cjs main` 94 at head, required at most 93, but Phase 2 only replaces one call | FAIL (bundle `main`, V4); others OK as planned |
| Max file lines | 250 | source about 100, fs about 175, transaction about 180, verify about 100, CLI about 60; tests: Source about 60, Staging about 195, Existing about 140, Promotion about 205, Verify about 205, support about 20; bundle.cjs 323 -> about 299 (at or under origin/main 313; pre-existing excluded breach) | OK (estimates) |
| Max nesting depth | 3 | `main` -> `collectPinnedOutputs` (for > for > if = 3); package-voice-pack split | OK |
| Nested ternaries | 0 | 0 (vendor-voice.cjs:472-473 is a single ternary) | OK |

#### Self-Application Sub-Pass
**Result**: FAIL. The discipline the plan introduces is that every declared behaviour change is proven by a test that fails without the change. Applied to the plan's own second declared change (V3 cleanup), the declared test does not fail without it (V1).

#### Test Functionality Pass
**Result**: FAIL (V1)

| Test description (plan) | Invokes unit? | Asserts on output? | Verdict |
| --- | --- | --- | --- |
| Phase 1 two patch tests, verbatim (plan:66) | yes (`commitOutputs`) | yes | PASS as a pair with Phase 1b |
| Phase 1b strengthened "refused without reading" + recorded mutation + red run (plan:76-82) | yes | yes; executed model fails under the mutation and at the baseline | PASS |
| Phase 1c "voice vendor files are never line-ending converted" via `git check-attr` (plan:97) | invokes git attribute resolution on the committed rules | yes; removing either rule makes it fail | PASS, together with the executed eol and verify check (plan:98) |
| Body-digest inventory (plan:128) | n/a (refactor proof) | 30 names / 29 digests; helpers not digested | PASS with C3' (N1) |
| `vendorVoiceAssets.test.ts` five cases (plan:129) | yes | yes for the missing and empty messages; "directory ... refused" names no message; no oversized case | see V2, N5 |
| `packageVoicePack.test.ts` "failed repack removes stale artifacts for a prerelease version" (plan:130) | spawns the script | asserts the stale archive and checksum are absent; the baseline already produces that outcome through package-voice-pack.cjs:41-42, before the throw at :116 | **VETO (V1)** |
| Windows and Linux runs (plan:131) | yes | no Linux source | see V3 |

Executed on this host (scratch, worktree untouched): `FAILSAFE_REPO_ROOT=<fixture>`, version `6.1.0-rc.1`, five assets present, `piper/piper.min.js` missing, stale `failsafe-voice-pack-6.1.0-rc.1.tar.gz` and `.sha256` pre-seeded. Baseline `package-voice-pack.cjs` at a465bd85: exit 1, "required voice asset missing: piper/piper.min.js", `dist/` afterwards contains only `extension`. The planned test passes on the unfixed code.

`prose_test_lint --tests-dir tests`: not applicable (no Python prose tests in scope).

#### Dependency Pass
**Result**: PASS. No dependency is added; iteration 1's lock verification stands (LD4 re-run: origin/main package.json:864 and :869; neither is at head; `grep -c onnxruntime-node package-lock.json` = 0). N9 (mocha transitive through `@vscode/test-cli`) accepted.

#### Orphan Pass
**Result**: PASS

| Proposed file | Entry-point connection | Status |
| --- | --- | --- |
| scripts/vendor-voice-{source,fs,transaction,verify}.cjs | required by vendor-voice.cjs (package.json:842, 847, 848); bundle.cjs:4; package-voice-pack.cjs:12 | Connected (planned) |
| scripts/vendor-piper.cjs | deleted; no reference remains (LD10) | resolved |
| src/test/scripts/vendorVoice{Source,Staging,Existing,Promotion,Verify,Assets}.test.ts | vscodeTestConfigs.cjs:21 `out/test/!(extension-arch)/**/*.test.js`; test-file-discovery.cjs:29 | Connected |
| src/test/scripts/vendorVoiceTestSupport.ts | imported by the six test files; not matched by TEST_FILE_RE (test-file-discovery.cjs:18), so runner coverage does not flag it | Connected |
| .gitattributes rules | consumed by git checkout; proven above | Connected |

#### Macro-Level Architecture Pass
**Result**: PASS (planned). source <- fs <- transaction / verify <- CLI. `assertCommittedVoiceAssets` in fs consolidates the six-asset check that was duplicated between bundle.cjs:23-30 and PACKAGES. package-voice-pack.cjs:15-22 keeps its own REQUIRED_ASSETS list; that duplication predates #712 and is not introduced by this plan.

#### Feature Test Coverage Pass
**Result**: PASS. The n/a-justified row now matches plan.json; the test_path is NEW and the descriptor is behavioural ("refused before any read of it and no file changes"), which the Phase 1b assertion enforces.

#### Infrastructure Alignment Pass (full Locked Decision re-walk)
**Result**: PASS on citations; FAIL on the undisclosed infrastructure gap (V3, Linux host).

- LD1: `git rev-parse a465bd85:...vendor-voice.cjs` -> 299d60a5337d975b89e59dd7d858c7445fbaafe5; the test blob -> a7d072521e814433ea26f7ed15db3a25caf69dd4; `git apply --check fix.patch` rc 0; patch sha256 2ff29ced... verified. Reproduces.
- LD2: 217 and 394 reproduce verbatim.
- LD3: `40:const MAX_ASSET` and `146:function sameVendorEntry` reproduce.
- LD4: reproduces (see Dependency).
- LD5: bundle.cjs 323 (head) and 313 (origin/main, by `wc -l`; the plan's 314 counts a final unterminated line); `main` 121-214 = 94 at head and 112-204 = 93 at origin/main, measured. Reproduces.
- LD6: `10:const vendorTool = ...` reproduces.
- LD7: `21:    files: Object.freeze([...])` and `29:  if (rel.endsWith(".test.ts")) return "vscode-test";` reproduce.
- LD8: `i/lf w/crlf attr/` for both and `file:C:/Program Files/Git/etc/gitconfig true` reproduce.
- LD9: `64:` and `84:` reproduce.
- LD10: no output, reproduces.
- Phase 1c `git check-attr` and `ls-files --eol` claims: executed, hold (see status table).
- Consumer trace for the moved check: bundle.cjs:140 `verifyVendoredVoiceAssets()` is the single caller; the 1-line substitution keeps the call site.
- Linux evidence source: not cited. `wsl.exe -l` reports WSL not installed; no `docker` on PATH. The only Linux execution available is `.github/workflows/pr-full-test.yml:29` (ubuntu-24.04, `xvfb-run -a npm run test:all`), which plan:34 classifies as "engineering evidence only, not native acceptance".

#### Filter-Stage Ordering Coherence
**Result**: PASS. The patch keeps all preflight before staging (stage preflight 194-219 then the staging loop 220-227). V3 cleanup: `readVersion` -> dist safety (`assertSafeDistDirectory`) -> removal. Under C4/"no order change" (plan:124), `removeCandidateArtifacts` must keep `assertSafeDistDirectory` before any `rmSync` on both paths. Only the Linux-skipped tests at packageVoicePack.test.ts:104 and :124 prove it, which is another reason the Linux source matters (V3).

### Violations Found

| ID | Category | Location | Description |
| --- | --- | --- | --- |
| V1 | test-failure | plan:130; package-voice-pack.cjs:39-42, 47, 62-72, 116 | The only V3 test passes against the unfixed baseline; the changed failure-cleanup branch is never reached |
| V2 | specification-drift | plan:12, 124, 129; bundle.cjs:37; fix.patch:14-16 | The "build message says so" claim for over-75-MiB existing assets is false; the moved check has no upper bound and the test list has no oversized case |
| V3 | coverage-gap | plan:12, 26, 34, 131, 159; host has no WSL or Docker | The Linux run that is the sole evidence for 7 tests (and C1's Linux half) has no named source; the only available one is excluded by plan:34; C1's Linux verify:voice-pins is not in the DoD |
| V4 | specification-drift | plan:14, 46, 118, 163; bundle.cjs:121-214 | `main` is required to be at most 93 lines, measured at 94, and Phase 2 prescribes no change that shortens it |

### Per-ground directives

#### Plan-text

**V1 (test-failure).** Plan:130 proves the V3 change with "with version `6.1.0-rc.1` and a missing asset, the stale same-version archive and checksum are removed and the exit is nonzero". The normal path removes `tarballPath` and `checksumPath` unconditionally for every version `readVersion` accepts (package-voice-pack.cjs:39-42). It does this before `collectFiles` (:47) throws "required voice asset missing" (:116). The failure-cleanup branch (:62-72), whose `^\d+\.\d+\.\d+$` guard (:64) is the V3 defect, only matters for an artifact created after :42, which means a partial tarball from `runTarCreate` (:51) or an archive left without its checksum when `writeSha256` (:52) fails. The planned fixture creates neither. I ran the scenario against a465bd85 and the stale files were removed (exit 1, `dist/` holds only `extension`). The test therefore passes whether or not V3 is fixed. This is the SG-035 presence-of-outcome shape: "if the unit's behaviour were silently broken, would this test fail?" No. The existing stable-version test "failed repack removes stale previously valid artifacts" (packageVoicePack.test.ts:170-186) has the same blind spot, so the plan cannot claim the catch-path cleanup is tested for any version. Required: a prerelease test whose failure happens after `runTarCreate` has written an archive in `dist`. One way is a fake `tar` placed first on PATH that writes a partial `failsafe-voice-pack-6.1.0-rc.1.tar.gz` and exits nonzero. The test asserts the partial archive is absent afterwards, plus a recorded red run showing it fails against the baseline guard.

**V2 (specification-drift).** Iteration 1 V8 stated: "The same applies to an existing asset larger than 75 MiB." Iteration 2 boundaries (plan:12) say that `vendor:voice` refuses an empty or over-75-MiB existing asset, "so the operator removes that file first (the build message says so)". The only changed build message (plan:124) is for "an existing empty or wrong-type asset", and plan:124 freezes every other condition. The baseline check `!stat.isFile() || stat.isSymbolicLink() || stat.size === 0` (bundle.cjs:37) has no upper bound. An over-75-MiB committed asset therefore passes `npm run bundle` silently and ships into dist. `vendor:voice` then fails with "existing voice vendor asset exceeds size budget or is empty" (fix.patch:16), with no repair guidance. The `vendorVoiceAssets.test.ts` list (plan:129) has no oversized case. Required: either add the `MAX_ASSET` bound and the "Remove it" message to `assertCommittedVoiceAssets` as a declared third behaviour change, with a test that uses an over-75-MiB sparse file, or correct the boundary text so it no longer claims the build message covers oversized assets.

**V3 (coverage-gap).** The plan makes the Linux run carry real weight. It is the only execution of the seven symlink and ancestry tests that cover `assertVendorAncestry`, `existingVendorEntry` and `assertVoiceVendorInventory` (plan:12, 131). It is also the only execution of the dist-safety ordering in the split `removeCandidateArtifacts` (packageVoicePack.test.ts:104, 124 skip on win32). It is required "before and after the split" (plan:131), and C1 asked for `verify:voice-pins` on Linux too. Yet the plan names no Linux host. This host has neither WSL nor Docker. The only Linux runner is CI (pr-full-test.yml:29), which plan:34 calls "engineering evidence only, not native acceptance". A "before the split" CI run would also need a push of the intermediate tree solely to obtain evidence, which conflicts with the owner's Actions-budget rule against pushing to find out. D4 (plan:159) requires `verify:voice-pins` only "on this Windows host", so C1's Linux half is dropped without a stated reason. Required: name the Linux evidence source and its acceptance status (for example, a specific owner Linux host, or an explicit owner decision to accept named pr-full-test.yml runs at named SHAs as native evidence, with the push budget accounted for). Add Linux `verify:voice-pins` to the DoD or record why it is unnecessary.

**V4 (specification-drift).** Boundaries (plan:14) and the Razor DoD (plan:163) require `bundle.cjs` `main` "at or under 93 lines". LD5 (plan:46) measures it at 94 at a465bd85, and I confirmed 121-214 = 94. Phase 2 (plan:118) says only that `verifyVendoredVoiceAssets` is "replaced by a call to `assertCommittedVoiceAssets`; `main` unchanged in length or shorter". A one-for-one call substitution keeps 94, so following Phase 2 literally fails D1. Required: state the change that takes `main` to 93 or fewer (for example, folding the line-139 comment), so Phase 2 and the DoD agree.

**Required next action:** Governor: amend plan text (V1, V2, V3, V4), re-run `/qor-audit`.

### Non-blocking notes

- **N1** (C3 partial): the body-digest inventory (plan:128) digests `test(...)` bodies only. The helpers every body depends on, `temporary` (vendorVoiceIsolation.test.ts:12-16), `extensionRoot` (:9) and `vendorTool` (:10), move to `vendorVoiceTestSupport.ts` and are not digested. A changed `temporary` (for example one that swallows errors) would leave all 29 digests equal.
- **N2**: the Phase 1b counters see only `io`-routed reads. A regression that calls the module-level `fs.readFileSync` directly would bypass them. That fits LD6's injection design and is acceptable; record it as a limit of the proof.
- **N3**: four overrides plus descriptor tracking will press the 40-line test-body limit (the patch test is already 31 lines, fix.patch:61-91). A local helper is compatible with C3 because the digest baseline is the Phase 1b file.
- **N4**: plan:98 "`w/-text` or `w/lf` matching `i/`" is loose but correct: executed result `w/lf attr/-text` for the JS and MD files, `w/-text attr/-text` for the four binaries. `git checkout HEAD -- <the two dirs>` is sufficient re-checkout. Before that, `git status` shows the four LF-text files modified on an autocrlf checkout.
- **N5**: "a directory in place of an asset is refused" (plan:129) names no expected message, although plan:124 declares the "Remove it" message for wrong-type assets.
- **N6**: the 6 plan_grep_lint WARNs are false positives (the `NNN:` grep prefix is parsed as part of the quote; `.test.js:29` is a mis-tokenized LD7 string). Every LD command reproduces byte-exact.
- **N7**: docs/META_LEDGER.md ends `---\n\n---\n` after Entry #970 (a doubled separator). The chain hashes are unaffected. This is recorded for the records step; I did not edit the ledger.
- **N8**: iteration 1 N4 stands. The focused mocha command (plan:173) depends on `C:\Windows\System32\tar.exe` preceding Git Bash GNU tar on Windows for the test at vendorVoiceIsolation.test.ts:41.
- **N9**: plan:14 cites origin/main bundle.cjs as 314 lines; `wc -l` gives 313. Using 314 is permissive by one line.
- **N10**: doc-drift advisory: the glossary orphan 'Vacuous pass' points to a missing RESEARCH_BRIEF (pre-existing).

### Implementation conditions (binding on any later PASS)

- **C1**: run `verify:voice-pins` on Windows (autocrlf=true, after re-checkout) and from the named Linux source; record both.
- **C2**: record the Linux runs before and after the split, 30 vendor tests passing and 0 pending, from the source named under V3.
- **C3**: extend the digest inventory to the moved helpers (`temporary`, `extensionRoot`, `vendorTool`) or diff the support module against baseline lines 1-16.
- **C4**: `vendor-voice-fs.cjs` imports only `vendor-voice-source.cjs` and built-ins. No split module has top-level side effects. `ROOT` and `VENDOR` resolve unchanged. `removeCandidateArtifacts` keeps `assertSafeDistDirectory` before any `rmSync` on both paths.
- **C5**: keep the LD1 refusal (both blobs, the patch sha256 and HEAD must match before `git apply`).

### Documentation Drift

<!-- qor:drift-section -->
## Documentation Drift

Non-VETO advisory. These issues would hard-block at /qor-substantiate per `qor/references/doctrine-documentation-integrity.md`. Governor can fix in a follow-on amendment or accept the block at seal time.

- Orphan: Orphan home: 'Vacuous pass' -> '.failsafe/governance/RESEARCH_BRIEF_qor169-alignment-2026-09-03.md' does not exist.

## Process Pattern Advisory

<!-- qor:veto-pattern-advisory -->

No repeated-VETO pattern detected in the last 2 sealed phases.

### Shadow Genome

The Shadow Genome entry text for this VETO is in `audit-iter2-shadow-genome-entry.md` beside this report. Append it to `docs/SHADOW_GENOME.md` in the same ordered records step as the ledger entry.

### Verdict Hash

SHA256 of this report (LF-normalized) is recorded in `audit-iter2-ledger-entry.md` and in the gate artifact.

---
_This verdict is binding. Gate LOCKED. Required next action: Governor amends the plan (V1-V4), then re-runs `/qor-audit`._
