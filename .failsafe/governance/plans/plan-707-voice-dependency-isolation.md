# Plan: isolate browser voice vendoring from core npm ci, with a bounded read of existing vendor assets (#707, PR #712)

**change_class**: feature
**doc_tier**: standard
**terms**: none
**iteration**: 3
**Risk Grade**: L3
**Baseline**: a465bd85249862a9e355ad584a338ca6fc9aeb25 (PR #712 head), merge base 0c0e30e042f628455c2a7f4d1287b5efd9d3ecfc (origin/main)
**originating_remediation**: FailSafe #707; source draft `.failsafe/governance/plans/plan-v610-707-voice-dependency-isolation-candidate.md` (self-declared non-native candidate)

**boundaries**:
- limitations: re-vendoring needs network access to registry.npmjs.org and a `tar` executable; the vendor transaction is pathname based and is not race-free against a concurrent process running as the same OS user; reads of transaction-owned or size-checked files (vendor-voice.cjs lines 249, 277, 294, 334, 394 at the baseline) stay bounded only by the size or inode check immediately before them, so a same-user writer can still grow such a file between check and read; `vendor:voice` refuses to replace an existing asset that is empty or larger than 75 MiB, so the operator removes that file first, and the build refuses both cases with a message saying so; on Windows without symlink privilege the seven symlink and ancestry tests and the two win32-skipped dist tests are pending, so their behaviour is evidenced only by the Linux runs named in LD11 and LD12, which are execution logs of named tests, not native acceptance; a checkout made before the `.gitattributes` rule needs the six assets re-checked-out once
- non_goals: the Voice Pack release installer and archive extraction (#710, PR #711); optional voice activation and consent; the #695 dependency remediation (its lockfile overlap is a merge-order risk, handled at integration by re-running `npm ci` and the dependency tests on the merged lock); frozen Qor-logic pins; any version bump, tag or release
- exclusions: protected workflows under `.github/workflows/**`; the Razor findings in `bundle.cjs` that already exist at origin/main (file 314 lines, `main` 93 lines, `bundlePattern` 46 lines). #712 changes `bundle.cjs`; this plan requires those changes to leave `main` at or under 93 lines and the file at or under its origin/main length, and refactors nothing else in it

## Iteration history

Iteration 1 (sha256 283c74365940e83fa321a3c6606eb1d0b08d36e5b9835fa71dead7e605f0fc60, preserved at `.failsafe/governance/evidence/issue-707/plan-iter1.md`) received an independent VETO, report `.failsafe/governance/evidence/issue-707/AUDIT-PLAN-iter1.md`. That VETO stands. Iteration 2 answers it:

- **V1** (the patch's regression test cannot detect the defect, because `readFileSync` bypasses the counted `openSync`): the owner chose to apply `fix.patch` verbatim and then, in a separate commit, strengthen the test so every read path on the target is counted (Phase 1b). A recorded mutation run re-adds the unbounded read and must make the test fail.
- **V2** (`verify:voice-pins` fails on a default Windows checkout because the two JS assets check out with CRLF): `.gitattributes` marks the piper and whisper vendor directories `-text` (Phase 1c); `verify:voice-pins` joins the CI Commands and Definition of Done (C1).
- **V3** (prerelease versions skip failure cleanup): one `removeCandidateArtifacts` runs for every version `readVersion` accepts, with a prerelease test (Phase 2).
- **V4** (missed Razor breaches): `vendor-voice.cjs` `main` (nesting 4) gets an extracted `collectPinnedOutputs`; the 44-line test at baseline line 603 gets an extracted fixture helper and is the one declared body-digest exception.
- **V5** (false `bundle.cjs` exclusion): corrected in boundaries; the asset check moves out of `bundle.cjs` into a tested module, shrinking it (Phase 2).
- **V6** (orphan `vendor-piper.cjs`): deleted; `vendor:piper` already runs `vendor-voice.cjs --piper-only`.
- **V7** (name-only proof): a per-test body sha256 inventory, an explicit file map for all 30 tests, and both a Windows run and a Linux run with 0 pending (C2, C3).
- **V8** (empty-asset repair path): the build message for an empty or invalid existing asset tells the operator to remove it before `vendor:voice`, and the limitation is disclosed.
- **Notes**: N2 corrected in LD7; N3 and C4 adopted in Phase 2; N4 recorded (the tar test needs System32 bsdtar on Windows); N6 corrected in the plan gate; N7 answered in non_goals; N9 accepted (mocha comes from the lock via `@vscode/test-cli`).

Iteration 2 (sha256 c27e11615904a7294f5347452a3608afd286b0772caba26fb2ce36569c40bc82, preserved at `.failsafe/governance/evidence/issue-707/plan-iter2.md`) received an independent VETO, report `.failsafe/governance/evidence/issue-707/AUDIT-PLAN-iter2.md`. That VETO stands. Iteration 3 answers it:

- **V1** (the prerelease test passes on the baseline, because the normal path deletes stale files before any failure reaches the cleanup branch): `package-voice-pack.cjs` exposes `packageVoicePack(repoRoot, run = spawnSync)`, the same injection shape as `verifyCommittedVendorOutputs(outputs, extensionRoot, run)`. The test calls it in-process with a `run` that writes a partial archive and returns status 1, so only the failure-cleanup branch can remove it. A recorded mutation that restores the baseline `^\d+\.\d+\.\d+$` guard must make the test fail.
- **V2** (oversized asset has no repair message): `assertCommittedVoiceAssets` also refuses an asset larger than `MAX_ASSET` with the same remove-then-revendor message, with a sparse-file test.
- **V3** (no Linux evidence source): LD11 and LD12 name them. Before the split: Full Test run 44988318243 at a465bd85. After the split: the PR Full Test run on the single checkpoint push of the locally validated final head. Linux `verify:voice-pins`: run 44694011230 on #733, whose six asset blobs equal a465bd85's. No intermediate tree is pushed.
- **V4** (`bundle.cjs` `main` cap unreachable): Phase 2 removes one named comment line from `main`, giving 93.
- **Conditions and notes**: C3 and N1 adopted (the moved helpers are digested too); C4 adopted (`assertSafeDistDirectory` precedes every `rmSync` in `removeCandidateArtifacts`); N5 answered (the directory case names its message); N7 corrected in the ledger; N9 corrected in LD5.

## Authority and scope

This is the native plan for the whole of PR #712: every change in `origin/main...a465bd85` (15 files) plus the supplied bounded-read patch. Owner decisions recorded in this session: plan the whole PR including the patch; apply `fix.patch` verbatim first, then a behaviour-preserving split to meet the Section 4 Razor; answer V1 with a separate follow-up commit rather than an amended patch.

The supplied archive `failsafe-pr-712-adversarial-bounded-vendor-v2.zip` has sha256 89e9f70ac7ed174941c9c05630595b937663a7f967fb2f7180733233373e5377; its `fix.patch` has sha256 2ff29ced70c74795f0c3a9c0393a710c201308b78315ff41fe69ddd07ada8458 and `git apply --check` passes at the baseline. CI results on #712 are engineering evidence only, not native acceptance.

## Open Questions

None.

## Locked decisions and evidence

- **LD1 (patch base)**: `git rev-parse a465bd85:FailSafe/extension/scripts/vendor-voice.cjs` -> `299d60a5337d975b89e59dd7d858c7445fbaafe5`; `git rev-parse a465bd85:FailSafe/extension/src/test/scripts/vendorVoiceIsolation.test.ts` -> `a7d072521e814433ea26f7ed15db3a25caf69dd4`. Implementation refuses to continue if either blob, the patch sha256 or HEAD differs (C5).
- **LD2 (defect)**: `git show a465bd85:FailSafe/extension/scripts/vendor-voice.cjs | grep -n "io.readFileSync(target)"` -> `217:    const originalSha256 = original ? crypto.createHash('sha256').update(io.readFileSync(target)).digest() : null;` and `394:    if (stat.size !== expected.length || !io.readFileSync(target).equals(Buffer.from(expected))) {` (line 391 refuses `stat.size > MAX_ASSET` before line 394).
- **LD3 (helpers the patch uses)**: `git show a465bd85:FailSafe/extension/scripts/vendor-voice.cjs | grep -nE "^const MAX_ASSET|^function sameVendorEntry"` -> `40:const MAX_ASSET = 75 * 1024 * 1024;` and `146:function sameVendorEntry(before, after) {`.
- **LD4 (core dependency removal)**: `git show origin/main:FailSafe/extension/package.json | grep -nE 'piper-tts-web|@xenova/transformers'` -> `864:    "@xenova/transformers": "^2.17.2",` and `869:    "piper-tts-web": "1.1.2",`; at a465bd85 neither remains, `grep -c onnxruntime-node FailSafe/extension/package-lock.json` -> `0`, and the scripts are `842: "vendor:piper": "node ./scripts/vendor-voice.cjs --piper-only"`, `847: "vendor:voice": "node ./scripts/vendor-voice.cjs"`, `848: "verify:voice-pins": "node ./scripts/vendor-voice.cjs --verify"`.
- **LD5 (Razor at the baseline)**: limits 250 file lines, 40 function lines, nesting 3 (installed qor-audit SKILL.md lines 350-352). Measured at a465bd85: `vendor-voice.cjs` 490 lines, `stageVoiceOutputs` 43, `restoreVoiceOutputs` 41, `verifyCommittedVendorOutputs` 47, `main` nesting 4; `package-voice-pack.cjs` `main` 53 lines, nesting 5; `vendorVoiceIsolation.test.ts` 659 lines, test body at line 603 44 lines; `bundle.cjs` 323 lines, `main` 94 lines (origin/main: 313 by `wc -l` and 93).
- **LD6 (test entry point)**: `git show a465bd85:FailSafe/extension/src/test/scripts/vendorVoiceIsolation.test.ts | grep -n "^const vendorTool"` -> `10:const vendorTool = require(path.join(extensionRoot, 'scripts', 'vendor-voice.cjs'));`. Every unit is reached through the `vendor-voice.cjs` exports.
- **LD7 (test discovery)**: `grep -n "out/test/" FailSafe/extension/src/test/vscodeTestConfigs.cjs` -> (line 7 is a comment) `21:    files: Object.freeze(['out/test/*.test.js', 'out/test/!(extension-arch)/**/*.test.js']),`; `grep -n 'endsWith(".test.ts")) return "vscode-test"' FailSafe/extension/scripts/test-file-discovery.cjs` -> `29:  if (rel.endsWith(".test.ts")) return "vscode-test";`. New `src/test/scripts/*.test.ts` files need no registration.
- **LD8 (line endings)**: `git ls-files --eol FailSafe/extension/src/roadmap/ui/vendor/piper/piper.min.js FailSafe/extension/src/roadmap/ui/vendor/whisper/transformers.min.js` -> `i/lf    w/crlf  attr/` for both; `git config --show-origin core.autocrlf` -> `file:C:/Program Files/Git/etc/gitconfig	true`; `.gitattributes` has no vendor rule.
- **LD9 (prerelease gap)**: `git show a465bd85:FailSafe/extension/scripts/package-voice-pack.cjs | grep -nF '\d+\.\d+\.\d+'` -> `64:      if (/^\d+\.\d+\.\d+$/.test(String(pkg.version || ''))) {` (failure cleanup) and `84:      !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(pkg.version)) {` (`readVersion`).
- **LD11 (Linux run before the split)**: `gh run view 44988318243 --json headSha,conclusion` -> head `a465bd85249862a9e355ad584a338ca6fc9aeb25`, `success`; its log lists all 28 tests of `voice vendor isolation #707` and all 11 of `package-voice-pack.cjs exact asset inventory #707` as passing, none pending.
- **LD12 (Linux `verify:voice-pins`)**: run 44694011230 on #733 executed `npm run verify:voice-pins` successfully at source 7278ffdc15f0b134028af0f4497579d8f303708c; `git rev-parse 7278ffdc:<asset>` equals `git rev-parse a465bd85:<asset>` for all six assets (414d9d4f, f50a2850, fe1ce53f, e3e9fd6f, b4985f02, fd14f597). The `.gitattributes` rule does not change checkout bytes on Linux, where no conversion applies.
- **LD10 (orphan)**: `git grep -n "vendor-piper" a465bd85 -- . ':!docs/META_LEDGER.md'` -> no output.

## Phase 1: apply the bounded-read patch verbatim

### Affected Files

- `FailSafe/extension/src/test/scripts/vendorVoiceIsolation.test.ts` - the patch's two regression tests
- `FailSafe/extension/scripts/vendor-voice.cjs` - the patch's `hashExistingVendorAsset(io, file, original)` and its use at the stage preflight

### Changes

`git apply` of `fix.patch` after the LD1 checks, with no edit to its bytes, as its own commit.

### Unit Tests

- "oversized or empty old asset is refused without reading, staging or overwriting" and "old file modified after open is refused without promoting", as supplied.

## Phase 1b: make the oversized-asset test detect the defect (V1)

### Affected Files

- `FailSafe/extension/src/test/scripts/vendorVoiceIsolation.test.ts` - strengthen the first Phase 1 test only

### Changes

The injected `io` also counts `readFileSync`, `createReadStream`, `openSync` and `readSync` calls whose path or descriptor refers to the target, and the test asserts zero target reads of any kind. The test body stays at or under 40 lines.

### Unit Tests

- The strengthened test passes with the patched source.
- Mutation run (recorded, not committed): adding `if (original) io.readFileSync(target);` before the bounded hash in the patched source makes the strengthened test fail; the unmodified Phase 1 test passed under the same mutation (audit iteration 1).
- Red run: the strengthened test fails against the baseline `vendor-voice.cjs`.

## Phase 1c: committed voice assets check out byte-exact (V2)

### Affected Files

- `FailSafe/extension/src/test/scripts/vendorVoiceVerify.test.ts` - a test that `git check-attr text` reports `unset` for each of the six assets and the two VENDOR.md notes (created here, receives the moved tests in Phase 2)
- `.gitattributes` - `FailSafe/extension/src/roadmap/ui/vendor/piper/** -text` and `FailSafe/extension/src/roadmap/ui/vendor/whisper/** -text`

### Changes

The two rules only; the committed blobs are already LF and do not change.

### Unit Tests

- `vendorVoiceVerify.test.ts` "voice vendor files are never line-ending converted" - for each of the eight paths, `git check-attr text -- <path>` run in the repository prints `text: unset`.
- Executed check: after re-checking-out the six assets, `git ls-files --eol` shows `w/-text` or `w/lf` matching `i/` for each, and `npm run verify:voice-pins` exits 0 on this Windows host.

## Phase 2: behaviour-preserving split to meet the Razor

### Affected Files

- `FailSafe/extension/src/test/scripts/vendorVoiceTestSupport.ts` - new; shared `extensionRoot`, `vendorTool` and `temporary`
- `FailSafe/extension/src/test/scripts/vendorVoiceSource.test.ts` - new; baseline tests at lines 19, 33, 41, 648
- `FailSafe/extension/src/test/scripts/vendorVoiceStaging.test.ts` - new; baseline tests at lines 78, 106, 138, 165, 198, 495, 509
- `FailSafe/extension/src/test/scripts/vendorVoiceExisting.test.ts` - new; baseline tests at lines 228 and 257 and the two Phase 1 tests
- `FailSafe/extension/src/test/scripts/vendorVoicePromotion.test.ts` - new; baseline tests at lines 59, 283, 308, 346, 382, 416, 525
- `FailSafe/extension/src/test/scripts/vendorVoiceVerify.test.ts` - baseline tests at lines 448, 477, 531, 555, 567, 580, 595, 603, plus the Phase 1c test; the line-603 test's fixture setup moves to a local helper
- `FailSafe/extension/src/test/scripts/vendorVoiceAssets.test.ts` - new; tests for `assertCommittedVoiceAssets`
- `FailSafe/extension/src/test/scripts/packageVoicePack.test.ts` - one added prerelease cleanup test
- `FailSafe/extension/src/test/scripts/vendorVoiceIsolation.test.ts` - removed after its tests move
- `FailSafe/extension/scripts/vendor-voice-source.cjs` - new; `PACKAGES`, `MAX_DOWNLOAD`, `MAX_ASSET`, `assertPinnedDigest`, `downloadPinned`, `extractApprovedArchiveMembers`, `sanitizeWhisperBrowserBundle`
- `FailSafe/extension/scripts/vendor-voice-fs.cjs` - new; `ROOT`, `VENDOR`, `assertVendorAncestry`, `existingVendorEntry`, `requireRegularVendorTarget`, `sameVendorEntry`, `hashExistingVendorAsset`, `assertOwnedBackup(io, item, message)`, `assertVoiceVendorInventory`, `assertCommittedVoiceAssets(vendorRoot, io, trustedRoot)`; imports only `vendor-voice-source.cjs` and Node built-ins
- `FailSafe/extension/scripts/vendor-voice-transaction.cjs` - new; `prepareVoiceOutput`, `stageVoiceOutputs`, `promoteVoiceOutputs`, `assertOwnedPromoted`, `restoreVoiceOutputs`, `cleanupVoiceOutputs`, `commitOutputs`
- `FailSafe/extension/scripts/vendor-voice-verify.cjs` - new; `verifyPinnedVendorOutputs`, `assertExpectedCheckoutRoot`, `assertCommittedAsset`, `verifyCommittedVendorOutputs`
- `FailSafe/extension/scripts/vendor-voice.cjs` - `collectPinnedOutputs(selected, tmp)`, `main`, and `module.exports` with the baseline's ten names plus `assertCommittedVoiceAssets`
- `FailSafe/extension/scripts/bundle.cjs` - `verifyVendoredVoiceAssets` replaced by a call to `assertCommittedVoiceAssets`; in `main`, the comment line `// Voice files are maintained by the explicit pinned vendor:voice command.` is removed (its content moves to the `assertCommittedVoiceAssets` doc comment), so `main` is 93 lines
- `FailSafe/extension/scripts/package-voice-pack.cjs` - `packageVoicePack(repoRoot, run = spawnSync)` exported and run only when `require.main === module` (the CLI passes `process.env.FAILSAFE_REPO_ROOT || path.resolve(__dirname, '..')`, as the baseline `REPO_ROOT` does); it delegates to `removeCandidateArtifacts(distDir, version)` (normal path and failure cleanup, for every version `readVersion` accepts; `assertSafeDistDirectory` before each `rmSync`) and `buildVoicePack(distDir, version, tarballPath, run)`, which passes `run` to `runTarCreate`
- `FailSafe/extension/scripts/vendor-piper.cjs` - deleted

### Changes

Code moves without changing any condition, message, order of side effects or default argument, except the two declared behaviour changes: failure cleanup now also runs for prerelease versions (V3), and `assertCommittedVoiceAssets` reports an existing empty, oversized (more than `MAX_ASSET` bytes) or wrong-type asset as `Invalid browser voice asset: <rel>. Remove it, then run npm run vendor:voice` (V8), so `npm run bundle` now also refuses an oversized asset. No split module has top-level side effects beyond constant definitions; `ROOT` and `VENDOR` keep their baseline values (C4).

### Unit Tests

- Body-digest inventory (C3): a script extracts each `test('<name>'` block from the Phase 1b test file and from the five new test files, normalizes only indentation, and sha256s each body; it also digests the moved helpers `extensionRoot`, `vendorTool` and `temporary`. The 30 names, 29 test digests and 3 helper digests must be equal before and after; the line-603 test is the one declared exception and its assertions are listed side by side in the implementation record.
- `vendorVoiceAssets.test.ts` - a missing asset throws `Missing browser voice asset: <rel>. Run npm run vendor:voice`; an empty asset, a sparse asset of `MAX_ASSET + 1` bytes and a directory in place of an asset each throw `Invalid browser voice asset: <rel>. Remove it, then run npm run vendor:voice`; a seventh unapproved file is refused by the inventory check; six valid assets and two notes pass.
- `packageVoicePack.test.ts` "a tar failure after writing a partial prerelease archive leaves no archive or checksum" - `packageVoicePack(root, run)` with version `6.1.0-rc.1`, six valid assets and a `run` that writes `failsafe-voice-pack-6.1.0-rc.1.tar.gz` and returns status 1 throws, and afterwards neither the archive nor its `.sha256` exists. Mutation run (recorded, not committed): restoring the `^\d+\.\d+\.\d+$` cleanup guard makes this test fail. The same test with version `6.1.0` passes before and after the mutation.
- Windows runs before and after the split: all vendor and package tests pass; pending only the symlink and win32-skipped dist tests. Linux before the split: LD11. Linux after the split: the PR Full Test run on the checkpoint push of the final locally validated head, all vendor and package tests passing and none pending, read from its log (C2).

## Phase 3: records

### Affected Files

- `docs/architecture/integrations/voice-pack.md` - the module files, the bounded existing-asset read, the remove-then-revendor repair step and the `.gitattributes` rule in the #707 section
- `FailSafe/extension/src/roadmap/ui/vendor/piper/VENDOR.md`, `FailSafe/extension/src/roadmap/ui/vendor/whisper/VENDOR.md` - the same repair step
- `.failsafe/governance/plans/plan-v610-707-voice-dependency-isolation-candidate.md` - one status line pointing to this native plan

## Feature Inventory Touches

- `entry_id`: n/a-justified (no FEATURE_INDEX row covers build-time voice vendoring; the shipped voice feature surface is unchanged); `operation`: n/a-justified; `test_path`: `FailSafe/extension/src/test/scripts/vendorVoiceExisting.test.ts`; `test_descriptor`: an oversized pre-existing vendor asset is refused before any read of it and no file changes.

## Definition of Done

### Deliverable: core install without native voice inference

- **D1**: ordinary `npm ci` of the extension installs no native ONNX package and keeps better-sqlite3.
- **D2**: no `piper-tts-web` or `@xenova/transformers` in devDependencies; no `onnxruntime-node` in `package-lock.json`.
- **D3**: `voice-pack.md` #707 section describes the boundary as a candidate until release.
- **D4**: `vendorVoiceSource.test.ts` "core npm lock excludes native voice inference packages" passes; clean `npm ci` on this Windows host completes, `node_modules/onnxruntime-node` is absent and `node -e "require('better-sqlite3')"` loads.

### Deliverable: pinned re-vendoring and verification with a bounded existing-asset read

- **D1**: `vendor:voice` fetches only the two SHA-512-pinned archives and replaces committed assets transactionally, never reading an existing asset beyond `MAX_ASSET + 1` bytes and refusing an empty or oversized one; `verify:voice-pins` confirms the pinned bytes against disk and committed HEAD.
- **D2**: `hashExistingVendorAsset` in `vendor-voice-fs.cjs`, called from `prepareVoiceOutput`; the two `.gitattributes` rules.
- **D3**: implementation and seal ledger entries record the patch sha256, the mutation run and the body-digest inventory.
- **D4**: the strengthened test fails under the recorded mutation and passes otherwise; `npm run verify:voice-pins` exits 0 on this Windows host after re-checkout; Linux `verify:voice-pins` per LD12 (C1).

### Deliverable: Razor compliance of the #712 sources

- **D1**: every Phase 2 source and test file at most 250 lines, every function and test body at most 40 lines, nesting at most 3; `bundle.cjs` no longer than at origin/main and its `main` at most 93 lines.
- **D2**: the module layout in Phase 2.
- **D3**: the implementation entry records the measured sizes.
- **D4**: a measurement run over the Phase 2 files reports no breach; the body-digest inventory matches; the Windows runs and the LD11 and post-split Linux runs pass as stated; the prerelease test fails under the recorded guard mutation.

## CI Commands

- `cd FailSafe/extension && npm ci` - clean install from the committed lock
- `cd FailSafe/extension && npm run compile` - TypeScript build
- `cd FailSafe/extension && npm run lint` - ESLint, 0 errors
- `cd FailSafe/extension && npx mocha --ui tdd --timeout 60000 out/test/scripts/vendorVoice*.test.js out/test/scripts/packageVoicePack.test.js` - focused vendor and package tests
- `cd FailSafe/extension && npm run verify:voice-pins` - pinned upstream bytes equal disk and committed HEAD (network)
- `cd FailSafe/extension && npm run bundle` - build including the committed-asset and inventory checks
- `cd FailSafe/extension && npm run test:node` - Node suites including bundleDeps and dependencyFloor
- `cd FailSafe/extension && npm run test:runner-coverage` - every test file has a runner
- `cd FailSafe/extension && npm run test:ui` - Playwright
- `cd FailSafe/extension && npm test` - extension-host suite
- `cd FailSafe/extension && npm run build:package` - Voice Pack archive with exactly six assets and a matching checksum
