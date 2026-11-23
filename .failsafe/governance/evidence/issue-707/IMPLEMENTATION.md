# Implementation record: plan-707-voice-dependency-isolation (iteration 3)

**Status**: implemented on `fix/707-isolate-optional-voice-vendoring`; NOT sealed, NOT merged, NOT released.
**Plan**: `.failsafe/governance/plans/plan-707-voice-dependency-isolation.md` iteration 3, raw sha256 6191b7a3218fd639b0925ceffcb0e00f65a58ea9ce48176f5470a520776bfbe7
**Authority**: independent PASS L3, ledger Entry #972, report `AUDIT-PLAN-iter3.md` (LF sha256 90b1c15fd3bbed068fc6380ff95536660942de5e8752f90816c421a3ab75c1ac); iteration 1 and 2 VETOs stand (Entries #970, #971)
**Session**: 2026-11-23T0340-d5e334; intent lock LOCKED before any implementation file
**Audited source**: a465bd85249862a9e355ad584a338ca6fc9aeb25
**Host**: Windows 11 Pro 10.0.26300, Node 22.23.5, npm 10.9.9, Git 2.55.0.windows.3; tar on PATH was System32 bsdtar for every test run (audit N6)

## Commits

| Commit | Phase | Content |
|---|---|---|
| 477955a7 | 1 | `fix.patch` applied verbatim after the LD1 checks (HEAD a465bd85, blobs 299d60a5 and a7d07252, patch sha256 2ff29ced...) |
| 3d73c539 | 1b | oversized-asset test counts openSync, readFileSync and createReadStream on the target |
| 4c49f98c | 1c | `.gitattributes` `-text` for the piper and whisper vendor directories; check-attr test |
| 04c69c85 | 2 | module and test split; packageVoicePack seam and prerelease cleanup; assertCommittedVoiceAssets; vendor-piper.cjs deleted; acp-devin.md citation |
| b7c3cd0b | 3 | voice-pack.md, both VENDOR.md notes, draft plan pointer |

## Evidence by phase

**Phase 1.** `git apply` exit 0; diff +101/-1 over the two files.

**Phase 1b (V1).** Strengthened test green: vendorVoiceIsolation 23 passing, 7 pending (Windows symlink tests), 30 tests. Recorded mutation `if (original) io.readFileSync(target);` before the bounded hash: the test fails with "the rejected existing file must never be opened or read". Against the baseline vendor-voice.cjs: fails with "Missing expected exception".

**Phase 1c (V2).** Red before the rule: `git check-attr text` printed `text: unspecified` for all eight paths. After the rule and re-checkout: `text: unset` for all eight, `git ls-files --eol` shows `i/lf w/lf` for the two JS files and both notes and `i/-text w/-text` for the four binaries. `npm run verify:voice-pins` exit 0 on this host: "pinned upstream bytes match 6 browser assets on disk and committed HEAD; no source files changed".

**Phase 2.**
- Before the test split, the unsplit suite ran against the split modules: 24 passing, 7 pending (30 vendor tests plus the Phase 1c test).
- Body-digest inventory (C3, normalization: per-line indentation and a leading `export ` only): 30 names before and after; 29 test digests equal; 3 helper digests (`extensionRoot`, `vendorTool`, `temporary`) equal; the one differing digest is the declared exception "upstream parity is checked against committed HEAD bytes, never just a dirty worktree". Its fixture setup moved to `committedPiperFixture(root)`; every assertion line is unchanged and in the same order; the two `git add` plus `git commit` sequences became `commitAsset('pinned fixture')` and `commitAsset('symlink fixture')`.
- Test file map: Source 4 (baseline lines 19, 33, 41, 648); Staging 7 (78, 106, 138, 165, 198, 495, 509); Existing 4 (228, 257 and the two Phase 1 tests); Promotion 7 (59, 283, 308, 346, 382, 416, 525); Verify 8 (448, 477, 531, 555, 567, 580, 595, 603) plus the Phase 1c test.
- Prerelease cleanup (V3, C6): red, the baseline script runs `main()` on load and exits; green, `packageVoicePack(root, run)` with a `run` that writes `opts.cwd/args[1]` and returns `{status: 1, stderr}` throws `tar -czf failed (exit 1): simulated tar failure`, `run` was called once, the archive existed when it returned, and neither archive nor checksum remains, for 6.1.0-rc.1 and 6.1.0. Recorded mutation restoring `if (!/^\d+\.\d+\.\d+$/.test(version)) return;` in `cleanupAfterFailure`: fails with "6.1.0-rc.1: partial archive removed".
- Focused Windows run after the split (`npx mocha --ui tdd --timeout 60000 out/test/scripts/vendorVoice*.test.js out/test/scripts/packageVoicePack.test.js`): 36 passing, 11 pending, 0 failing. The 11 pending (C8): dangling vendor destination link; dangling backup collision injected after staging; destination replaced with dangling link during staging; vendor root symlink; vendor ancestor symlink; recursive voice inventory symlinked file; read-only verification linked ancestor; symlinked Whisper directory; symlinked parent UI directory; linked dist foreign archive; dangling dist symlink.
- C4: `packageVoicePack(repoRoot, run)` threads one `repoRoot` through `readVersion`, `assertSafeDistDirectory`, `collectFiles` and `cleanupAfterFailure`; no module-level `REPO_ROOT` remains; `removeCandidateArtifacts` calls `assertSafeDistDirectory` before both `rmSync`; the CLI keeps cleanup warning, then `ERROR`, then exit 1. Split modules define only constants and functions at top level; `vendor-voice-fs.cjs` imports only `vendor-voice-source.cjs` and built-ins; `ROOT` and `VENDOR` keep their baseline values.
- C7: `bundle.cjs` line 113 `assertCommittedVoiceAssets(path.join(root, 'src', 'roadmap', 'ui', 'vendor'), fs, root);` precedes the UI `copyDir(` at line 116, inside `main` (lines 95-187, 93 lines); file 297 lines (origin/main 313).
- C1 identity: `PACKAGES`, `assertPinnedDigest`, `downloadPinned`, `extractApprovedArchiveMembers`, `sanitizeWhisperBrowserBundle` and `verifyPinnedVendorOutputs` are textually identical to 7278ffdc `scripts/vendor-voice.cjs`; every statement of 7278ffdc `verifyCommittedVendorOutputs` appears verbatim in `assertExpectedCheckoutRoot`, `assertCommittedAsset` or `verifyCommittedVendorOutputs`. LD12 run identities: run 44694011230, head 22fc2837 (7278ffdc plus a CI-only workflow step), checkout merge a5f918db, verify step success, run conclusion cancelled.

**Razor (D4).**

| File | Lines | Longest function or test body | Max nesting |
|---|---|---|---|
| scripts/vendor-voice.cjs | 70 | under 40 | at most 3 |
| scripts/vendor-voice-source.cjs | 103 | under 40 | at most 3 |
| scripts/vendor-voice-fs.cjs | 187 | under 40 | at most 3 |
| scripts/vendor-voice-transaction.cjs | 182 | under 40 | at most 3 |
| scripts/vendor-voice-verify.cjs | 113 | under 40 | at most 3 |
| scripts/package-voice-pack.cjs | 198 | under 40 | at most 3 |
| scripts/bundle.cjs | 297 | `main` 93 (cap 93); `bundlePattern` 46 is the pre-existing exclusion | 4 in `bundlePattern` (pre-existing) |
| test files (6) and packageVoicePack.test.ts | 14 to 219 | 36 | n/a |

## Full local gate (Windows)

| Command | Result |
|---|---|
| `npm ci` | exit 0; `node_modules/onnxruntime-node` absent; `require('better-sqlite3')` loads |
| `npm run compile` | exit 0 |
| `npm run lint` | exit 0, 0 errors, 138 warnings |
| `npm run bundle` | exit 0 |
| `npm run test:runner-coverage` | exit 0 |
| `npm run test:citation-parity` | exit 0 |
| `npm run test:node` | 1170 tests, 1159 pass, 2 fail, 9 skipped. FX1003 failed on a stale `bundle.cjs:181-185` citation in acp-devin.md; fixed in 04c69c85 (now 153-157), FX1003 rerun 91 pass, 0 fail. The other failure is g4Witness "no witness yet", which fails without this change because #688 published checkpoint g4-000001 |
| `npm run test:ui` | 264 passed, 4 skipped |
| `npm test` (extension host) | 6192 passing, 34 pending, 4 failing; all four are 15 s or 300 s timeouts in `governedCommitLink.test` and `deliveryReview.test`; a `--grep "#532"` rerun: 253 passing, 5 failing, same timeouts. #712 changes nothing under `src/extension` or `src/governance`; the same suites passed in Linux run 44988318243 at a465bd85. Recorded as Windows-host timeouts, to be confirmed by the post-split Linux run |
| `npm run verify:voice-pins` | exit 0 (Phase 1c) |
| `npm run build:package` | exit 0; archive with 6 files and its `.sha256` |

## Outstanding before seal

- **C2**: the PR Full Test run on the checkpoint push of the final head: record run id, head, merge commit and base; all vendor, assets, prerelease and packaging tests passing with none pending; if the base moved, confirm the merged tree's voice files equal the head's.
- Substantiation by an independent judge.

## Differences from the plan text

- The prerelease test lives at the end of the existing package suite and calls `require(SCRIPT)` inside the test.
- `cleanupAfterFailure` returns silently when `readVersion` throws, as the baseline did for an unsafe version; any other cleanup error still prints the warning.
- `assertCommittedVoiceAssets` keeps the baseline build's catch-all on `lstat` (any error is reported as missing).
