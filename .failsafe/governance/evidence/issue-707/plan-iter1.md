# Plan: isolate browser voice vendoring from core npm ci, with a bounded read of existing vendor assets (#707, PR #712)

**change_class**: feature
**doc_tier**: standard
**terms**: none
**iteration**: 1
**Risk Grade**: L3
**Baseline**: a465bd85249862a9e355ad584a338ca6fc9aeb25 (PR #712 head), merge base 0c0e30e042f628455c2a7f4d1287b5efd9d3ecfc (origin/main)
**originating_remediation**: FailSafe #707; source draft `.failsafe/governance/plans/plan-v610-707-voice-dependency-isolation-candidate.md` (self-declared non-native candidate)

**boundaries**:
- limitations: re-vendoring needs network access to registry.npmjs.org and a `tar` executable; the vendor transaction is pathname based and is not race-free against a concurrent process running as the same OS user; reads of transaction-owned or size-checked files (vendor-voice.cjs lines 249, 277, 294, 334, 394 at the baseline) stay bounded only by the size or inode check immediately before them, so a same-user writer can still grow such a file between check and read
- non_goals: the Voice Pack release installer and archive extraction (#710, PR #711); optional voice activation and consent; the #695 dependency remediation; frozen Qor-logic pins; any version bump, tag or release
- exclusions: protected workflows under `.github/workflows/**`; `bundle.cjs` Razor findings that already exist at origin/main (`main` 93 lines, `bundlePattern` 46 lines, file 314 lines), which this plan does not touch

## Authority and scope

This is the first native plan for the whole of PR #712: every change in `origin/main...a465bd85` (15 files) plus the supplied bounded-read patch. Owner decisions recorded in this session: plan the whole PR including the patch; apply `fix.patch` verbatim first, then make a behaviour-preserving split to meet the Section 4 Razor.

The supplied archive `failsafe-pr-712-adversarial-bounded-vendor-v2.zip` has sha256 89e9f70ac7ed174941c9c05630595b937663a7f967fb2f7180733233373e5377; its `fix.patch` has sha256 2ff29ced70c74795f0c3a9c0393a710c201308b78315ff41fe69ddd07ada8458 and `git apply --check` passes at the baseline. CI results on #712 are engineering evidence only, not native acceptance.

## Open Questions

None. Both scope questions were decided by the owner in this session (see Authority and scope).

## Locked decisions and evidence

- **LD1 (patch base)**: the patch applies only to the baseline blobs.
  `git rev-parse a465bd85:FailSafe/extension/scripts/vendor-voice.cjs` -> `299d60a5337d975b89e59dd7d858c7445fbaafe5`;
  `git rev-parse a465bd85:FailSafe/extension/src/test/scripts/vendorVoiceIsolation.test.ts` -> `a7d072521e814433ea26f7ed15db3a25caf69dd4`.
  Implementation refuses to continue if either blob, the patch sha256 or the HEAD differs.
- **LD2 (defect)**: the only read of a pre-existing vendor file without a size check before it is the stage preflight hash.
  `git show a465bd85:FailSafe/extension/scripts/vendor-voice.cjs | grep -n "io.readFileSync(target)"` -> `217:    const originalSha256 = original ? crypto.createHash('sha256').update(io.readFileSync(target)).digest() : null;` and `394:    if (stat.size !== expected.length || !io.readFileSync(target).equals(Buffer.from(expected))) {` (line 394 is preceded at line 391 by `stat.size > MAX_ASSET` refusal).
- **LD3 (helpers the patch uses)**: `git show a465bd85:FailSafe/extension/scripts/vendor-voice.cjs | grep -nE "^const MAX_ASSET|^function sameVendorEntry"` -> `40:const MAX_ASSET = 75 * 1024 * 1024;` and `146:function sameVendorEntry(before, after) {`.
- **LD4 (core dependency removal)**: `git show origin/main:FailSafe/extension/package.json | grep -nE 'piper-tts-web|@xenova/transformers'` -> `864:    "@xenova/transformers": "^2.17.2",` and `869:    "piper-tts-web": "1.1.2",`; at a465bd85 neither devDependency remains and the scripts are `842: "vendor:piper": "node ./scripts/vendor-voice.cjs --piper-only"`, `847: "vendor:voice": "node ./scripts/vendor-voice.cjs"`, `848: "verify:voice-pins": "node ./scripts/vendor-voice.cjs --verify"`.
- **LD5 (Razor at the baseline)**: limits 250 file lines, 40 function lines, nesting 3 (installed qor-audit SKILL.md lines 350-352). Measured: `vendor-voice.cjs` 490 lines, `stageVoiceOutputs` 43, `restoreVoiceOutputs` 41, `verifyCommittedVendorOutputs` 47; `package-voice-pack.cjs` `main` 53 lines, nesting 5 (on origin/main the file is within limits); `vendorVoiceIsolation.test.ts` 659 lines.
- **LD6 (test entry point)**: `git show a465bd85:FailSafe/extension/src/test/scripts/vendorVoiceIsolation.test.ts | grep -n "^const vendorTool"` -> `10:const vendorTool = require(path.join(extensionRoot, 'scripts', 'vendor-voice.cjs'));`. Tests reach every unit through the `vendor-voice.cjs` exports, so a re-exporting entry point keeps them valid unchanged.
- **LD7 (test discovery)**: `grep -n "glob(" FailSafe/extension/src/test/suite/index.ts` -> `20:  const testFiles = await glob('**/*.test.js', { cwd: testsRoot });`; new `src/test/scripts/*.test.ts` files are discovered without registration.

## Phase 1: apply the bounded-read patch verbatim

### Affected Files

- `FailSafe/extension/src/test/scripts/vendorVoiceIsolation.test.ts` - the patch's two regression tests
- `FailSafe/extension/scripts/vendor-voice.cjs` - the patch's `hashExistingVendorAsset(io, file, original)` and its use at the stage preflight

### Changes

`git apply` of `fix.patch` (sha256 2ff29ced...) after the LD1 checks, with no edit to its bytes. The helper rejects an empty or over-`MAX_ASSET` original before opening, opens read-only with `O_NOFOLLOW` where defined, requires the descriptor's `fstat` to match the `lstat` taken at preflight, hashes in 64-KiB reads with a hard total of `MAX_ASSET + 1` bytes, requires the total to equal the original size and the final `fstat` to match, and closes the descriptor in `finally`.

### Unit Tests

- `vendorVoiceIsolation.test.ts` "oversized or empty old asset is refused without reading, staging or overwriting" - a sparse 75 MiB + 1 byte prior asset and a zero-byte prior asset each throw `existing voice vendor asset exceeds size budget or is empty`, the file is never opened, nothing is staged, and the file and directory are unchanged.
- `vendorVoiceIsolation.test.ts` "old file modified after open is refused without promoting" - growth during the hash read throws `existing voice vendor asset changed during read`, and neither a staged nor a backup file survives.
- Red evidence: the first test is run against the baseline `vendor-voice.cjs` (patch test file applied, source file not) and must fail, because the baseline opens and reads the file.

## Phase 2: behaviour-preserving split to meet the Razor

### Affected Files

- `FailSafe/extension/src/test/scripts/vendorVoiceSource.test.ts` - new; the lock, digest, tar-member and Whisper-sanitization tests, moved verbatim
- `FailSafe/extension/src/test/scripts/vendorVoiceStaging.test.ts` - new; the staging, collision and dangling-link tests plus the two Phase 1 tests, moved verbatim
- `FailSafe/extension/src/test/scripts/vendorVoicePromotion.test.ts` - new; the promotion, tampering, rollback and successful-update tests, moved verbatim
- `FailSafe/extension/src/test/scripts/vendorVoiceVerify.test.ts` - new; the inventory and read-only and committed verification tests, moved verbatim
- `FailSafe/extension/src/test/scripts/vendorVoiceTestSupport.ts` - new; the shared `extensionRoot`, `vendorTool` and `temporary` helpers
- `FailSafe/extension/src/test/scripts/vendorVoiceIsolation.test.ts` - removed after its tests move
- `FailSafe/extension/scripts/vendor-voice-source.cjs` - new; `PACKAGES`, `MAX_DOWNLOAD`, `MAX_ASSET`, `assertPinnedDigest`, `downloadPinned`, `extractApprovedArchiveMembers`, `sanitizeWhisperBrowserBundle`
- `FailSafe/extension/scripts/vendor-voice-fs.cjs` - new; `assertVendorAncestry`, `existingVendorEntry`, `requireRegularVendorTarget`, `sameVendorEntry`, `hashExistingVendorAsset`, `assertVoiceVendorInventory`, and one `assertOwnedBackup(io, item, message)` replacing the backup check now written twice in restore and cleanup
- `FailSafe/extension/scripts/vendor-voice-transaction.cjs` - new; `stageVoiceOutputs` (per-output preflight extracted as `prepareVoiceOutput`), `promoteVoiceOutputs`, `restoreVoiceOutputs` (promoted-asset ownership check extracted as `assertOwnedPromoted`), `cleanupVoiceOutputs`, `commitOutputs`
- `FailSafe/extension/scripts/vendor-voice-verify.cjs` - new; `verifyPinnedVendorOutputs`, `verifyCommittedVendorOutputs` (checkout-root check extracted as `assertExpectedCheckoutRoot`, per-asset check as `assertCommittedAsset`)
- `FailSafe/extension/scripts/vendor-voice.cjs` - the CLI `main` and one `module.exports` re-exporting the same ten names as at the baseline
- `FailSafe/extension/scripts/package-voice-pack.cjs` - `main` delegates to extracted `removeCandidateArtifacts(distDir, version)` (used by both the normal path and failure cleanup) and `buildVoicePack(distDir, version, tarballPath)`

`bundle.cjs` imports `assertVendorAncestry` and `assertVoiceVendorInventory` from `vendor-voice.cjs` and `package-voice-pack.cjs` imports `assertVendorAncestry`; both keep working through the re-exports, so neither import line changes.

### Changes

Code moves without changing any condition, message, order of side effects or default argument. Extracted helpers take every value they use as parameters. No new behaviour.

### Unit Tests

- The four new test files - the same test names as the Phase 1 test file, 30 in total (28 at the baseline plus the 2 Phase 1 tests), each body unchanged except for the import of the shared helpers. A name inventory taken before and after must be equal.
- `src/test/scripts/packageVoicePack.test.ts` - unchanged; its producer, linked-ancestry and cleanup cases cover `removeCandidateArtifacts` and `buildVoicePack`.
- `src/test/scripts/bundleDeps.test.cjs`, `src/test/scripts/dependencyFloor.test.cjs` - unchanged.

## Phase 3: records

### Affected Files

- `docs/architecture/integrations/voice-pack.md` - name the new module files and the bounded existing-asset read in the #707 section
- `.failsafe/governance/plans/plan-v610-707-voice-dependency-isolation-candidate.md` - one status line pointing to this native plan

## Feature Inventory Touches

- `entry_id`: n/a-justified (no FEATURE_INDEX row covers build-time voice vendoring; the shipped voice feature surface is unchanged); `operation`: n/a-justified; `test_path`: `FailSafe/extension/src/test/scripts/vendorVoiceStaging.test.ts`; `test_descriptor`: an oversized pre-existing vendor asset is refused before it is opened and no file changes.

## Definition of Done

### Deliverable: core install without native voice inference

- **D1**: ordinary `npm ci` of the extension installs no native ONNX package and keeps better-sqlite3.
- **D2**: no `piper-tts-web` or `@xenova/transformers` in `FailSafe/extension/package.json` devDependencies; `package-lock.json` has no `onnxruntime-node` entry.
- **D3**: `docs/architecture/integrations/voice-pack.md` #707 section describes the boundary as a candidate until release.
- **D4**: `vendorVoiceSource.test.ts` "core npm lock excludes native voice inference packages" passes; clean `npm ci` on Windows completes and `node_modules/onnxruntime-node` is absent.

### Deliverable: pinned explicit re-vendoring with a bounded existing-asset read

- **D1**: `vendor:voice` fetches only the two SHA-512-pinned archives, extracts only the six approved members and replaces committed assets transactionally; an existing asset is never read beyond `MAX_ASSET + 1` bytes.
- **D2**: `hashExistingVendorAsset(io, file, original)` in `vendor-voice-fs.cjs`; called from `prepareVoiceOutput` in `vendor-voice-transaction.cjs`.
- **D3**: implementation and seal ledger entries record the patch sha256 and the before and after test-name inventories.
- **D4**: the 30 vendor tests pass, including the two Phase 1 tests; the red run of the oversized-asset test against the baseline source fails.

### Deliverable: Razor compliance of the #712 sources

- **D1**: every #712-introduced source and test file is at most 250 lines, every function at most 40 lines, nesting at most 3.
- **D2**: the module layout in Phase 2.
- **D3**: the implementation entry records the measured sizes.
- **D4**: a measurement run lists no function over 40 lines or file over 250 lines among the Phase 2 files; `packageVoicePack.test.ts` passes unchanged.

## CI Commands

- `cd FailSafe/extension && npm ci` - clean install from the committed lock
- `cd FailSafe/extension && npm run compile` - TypeScript build
- `cd FailSafe/extension && npm run lint` - ESLint, 0 errors
- `cd FailSafe/extension && npx mocha --ui tdd --timeout 60000 out/test/scripts/vendorVoice*.test.js out/test/scripts/packageVoicePack.test.js` - focused vendor and package tests
- `cd FailSafe/extension && npm run bundle` - build including the committed-asset and inventory checks
- `cd FailSafe/extension && npm run test:node` - Node suites including bundleDeps and dependencyFloor
- `cd FailSafe/extension && npm run test:runner-coverage` - every test file has a runner
- `cd FailSafe/extension && npm run test:ui` - Playwright
- `cd FailSafe/extension && npm test` - extension-host suite (needs a VS Code test host that can start)
- `cd FailSafe/extension && npm run build:package` - Voice Pack archive with exactly six assets and a matching checksum
