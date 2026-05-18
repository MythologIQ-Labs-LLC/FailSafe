# Plan: Voice Substrate Extraction (B195 resolution)

**Plan slug**: `plan-qor-voice-substrate-extraction`
**Target version**: v5.2.x (no in-cycle version bump; bump deferred to release runbook)
**change_class**: `feature`
**Risk grade**: L2 (modifies build pipeline + activation surface + adds external download path; no L3 governance bypass)
**doc_tier**: `standard`
**high_risk_target**: false
**Review boundary**: stage artifacts only (no push / PR / merge / tag / publish / GitHub Release)
**Resolves**: B195 (VSIX size approaches marketplace cap) per operator disposition 2026-05-18
**Carry-over governance**: feedback_voice_separate_download.md, feedback_failsafe_pro_repo_boundary.md, feedback_no_ship_without_approval.md, feedback_per_feature_tdd.md, feedback_e2e_before_claim_closed.md

## terms_introduced

- term: voice-pack
  home: docs/INTEGRATIONS.md
- term: voice-pack-detector
  home: FailSafe/extension/src/voice-pack/voice-pack-detector.ts
- term: VoicePackManifest
  home: FailSafe/extension/src/voice-pack/types.ts
- term: failsafe.installVoicePack
  home: FailSafe/extension/package.json (contributes.commands)
- term: failsafe.uninstallVoicePack
  home: FailSafe/extension/package.json (contributes.commands)
- term: base VSIX
  home: docs/INTEGRATIONS.md (Voice Pack section)

## boundaries

- limitations:
  - Voice pack is operator-installed only (no auto-download on activation)
  - No auto-update mechanism — operator triggers update via Settings card when extension version advances
  - No per-platform pack variants (current Piper + Whisper assets are platform-neutral WASM/JS)
  - Pack download requires GitHub Releases reachability; offline install is out of scope
- non_goals:
  - Cross-platform installer signing / notarization
  - Voice-pack auto-update beyond manual reinstall
  - Additional voice models beyond the currently vendored Piper + Whisper assets
  - Migrating brainstorm voice integration to a different STT engine
  - FailSafe Pro daemon integration (separate repo per feedback_failsafe_pro_repo_boundary.md)
- exclusions:
  - Browser Web Speech API code paths (already covered by existing `voice-controller.js`; remain available without the pack)
  - 3d-force-graph + force-graph vendor assets (brainstorm canvas — out of scope; smaller footprint, different concern)
  - node_modules/piper-tts-web + node_modules/@huggingface/transformers (dev-only dependencies; never shipped in VSIX)

## Open Questions

- **Pack hosting attestation**: should the manifest carry a signed checksum (Cosign / Sigstore) or is plain `.sha256` + HTTPS-from-GitHub trust sufficient? Plan defaults to plain `.sha256` (matches existing trust posture for Bicameral MCP install which delegates to PyPI / pip).
- **Stale-pack policy on extension downgrade**: if operator downgrades the extension (e.g., v5.2.1 → v5.2.0), should the runtime accept the existing pack as still-valid? Plan defaults to "yes, pack >= manifest-minimum-version" check (downgrade-tolerant).
- **VSIX size target**: B195 cites ~50 MB marketplace ceiling. Plan asserts ≤ 30 MB in `validate-vsix.cjs`. Operator confirms 30 MB target is appropriate (vs 25 MB or 35 MB).
- **Brainstorm voice-button first-click prompt vs Settings-only**: plan ships both paths. Open question: does the first-click prompt suppress on subsequent absence (e.g., user dismissed once, dismissed forever for this session)? Plan defaults to "show once per session unless explicitly dismissed."

## Feature Inventory Touches

| entry_id | operation | test_path | test_descriptor |
|---|---|---|---|
| FX491 | NEW | src/test/voice-pack/voice-pack-detector.test.ts | `probeVoicePackState({ globalStoragePath })` returns `absent` when directory missing, `installed` with version+manifest fields when valid, `stale` when manifest version < extension's required minimum |
| FX492 | NEW | src/test/extension/voice-pack-install.test.ts | `installVoicePack(context, opts)` downloads via stubbed fetcher, verifies SHA256, extracts to staging, atomic-renames to final; cleanup on failure leaves prior pack intact |
| FX493 | NEW | src/test/roadmap/voice-pack-settings-card.test.ts | Settings "Voice Pack" card renders `absent / installed v<X> / stale` states with correct buttons (Install / Update / Uninstall) + version display + disk-usage line |
| FX494 | NEW | src/test/roadmap/ConsoleRouteRegistrar.test.ts (extend existing) | `setupAllRoutes()` mounts `/vendor` from `globalStoragePath/voice-pack/` when pack present; falls through to default `dist/extension/ui/vendor/` mount otherwise |
| FX495 | NEW | src/test/ui/voice-pack.spec.ts (Playwright) | Settings tab Voice Pack card: install-button click triggers POST `/api/actions/install-voice-pack`; success state shows version + uninstall button; brainstorm voice button renders disabled with "Install voice pack" tooltip when pack absent |
| FX196 | MODIFIED | src/test/roadmap/tts-engine-vendor-presence.test.ts (existing) | TtsEngine emits `error:piper_not_vendored` when fetch HEAD on vendor path returns 404 — semantic unchanged post-extraction; now exercised by the absent-pack path in addition to the dev-misconfigure path |
| FX221 | MODIFIED | src/test/roadmap/stt-engine-transcription.test.ts (existing) | STT engine refuses to initialize when transformers.min.js fetch 404s; surfaces `whisper-load-failed` state — semantic unchanged; absent-pack now drives the same code path |
| FX222 | MODIFIED | src/test/roadmap/voice-controller-allowlist.test.ts (existing) | Voice controller `init()` consults `voice-pack-detector` and skips TtsEngine/SttEngine wiring when state≠installed — NEW assertion added on top of existing allowlist semantics |
| FX480 | n/a-justified | — | SHIELD risk auto-derivation unaffected; voice-pack absence is not a governance failure |

## CI Commands

- `cd FailSafe/extension && npm run compile` — TypeScript clean
- `cd FailSafe/extension && npm test` — mocha (extends current 2377 passing; +5 voice-pack cases land in Phases 1-3)
- `cd FailSafe/extension && npm run lint` — ESLint 0 errors in new files
- `cd FailSafe/extension && npm run build:package` — produces both VSIX and `dist/failsafe-voice-pack-<version>.tar.gz`
- `cd FailSafe/extension && npm run package:voice-pack` — pack assembly script alone (faster iteration)
- `cd FailSafe/extension && npm run validate:vsix` — asserts VSIX ≤ 30 MB AND voice-pack tarball SHA256 matches `.sha256` companion
- `cd FailSafe/extension && npm run test:e2e -- --grep "voice-pack"` — Playwright spec for FX495

---

## Phase 1: Voice Pack Runtime Substrate

### Affected Files

**Tests (red-then-green, declared first per TDD discipline):**

- `FailSafe/extension/src/test/voice-pack/voice-pack-detector.test.ts` — NEW. 5 cases: `probeVoicePackState` returns `absent` when dir missing; `installed` with `{version, manifestPath}` when manifest+files valid; `stale` when manifest.version < required minimum; surface a `corrupt` state when manifest exists but referenced files missing (sha256 mismatch); reject path traversal in globalStoragePath (defense in depth).
- `FailSafe/extension/src/test/extension/voice-pack-install.test.ts` — NEW. 6 cases: `installVoicePack` invokes fetcher with correct URL (resolved from extension version); SHA256 mismatch aborts before extract; extract failure leaves staging dir without renaming over prior pack; success path atomic-renames; uninstall removes globalStoragePath/voice-pack/ directory; rejects malformed pack URL via spawn-boundary allowlist (mirrors `isSafeBicameralCommand`).

**Source (NEW under `src/voice-pack/`):**

- `FailSafe/extension/src/voice-pack/types.ts` — NEW. `VoicePackState` (`absent | installed | stale | corrupt`), `VoicePackManifest` (`{ version, builtAt, expectedFiles: string[], sha256: Record<string, string> }`), `VoicePackProbeResult` (`{ state, version?, manifestPath?, missingFiles?: string[] }`), `InstallProgressEvent` (`{ phase: 'download' | 'verify' | 'extract' | 'manifest-verify', status: 'running' | 'success' | 'error', bytesTransferred?, totalBytes?, error? }`).
- `FailSafe/extension/src/voice-pack/voice-pack-detector.ts` — NEW. `probeVoicePackState(globalStoragePath: string): Promise<VoicePackProbeResult>` reads `<globalStoragePath>/voice-pack/voice-pack.manifest.json`, validates JSON shape, asserts each `expectedFiles` entry exists with matching sha256, returns classified result. Exports `REQUIRED_PACK_MIN_VERSION` constant read at runtime from extension `package.json` (single source of truth).
- `FailSafe/extension/src/voice-pack/install-handler.ts` — NEW. `installVoicePack(opts: { globalStoragePath, version, output, onProgress }): Promise<InstallReport>`. Resolves pack URL via `resolveVoicePackUrl(version) -> ` `https://github.com/MythologIQ/FailSafe/releases/download/v<X.Y.Z>-voice/failsafe-voice-pack-<X.Y.Z>.tar.gz`. Downloads via `node:https.get` (no shell, no extra deps) writing to `<staging>/voice-pack.tar.gz`; concurrently fetches `.sha256` companion; verifies; extracts via `child_process.spawn('tar', ['-xzf', staging, '-C', staging], { shell: false })`; reads extracted manifest; atomic `fs.renameSync(staging, finalPath)`. Failure cleans staging. `uninstallVoicePack(globalStoragePath)` rm-rf's the voice-pack/ directory only.
- `FailSafe/extension/src/voice-pack/index.ts` — NEW. Barrel.

### Changes

The substrate is read-mostly: `probeVoicePackState` is a pure function over filesystem state; `installVoicePack` is a sequence of `node:https.get` + `crypto.createHash` + `spawn(tar)` calls under explicit operator action. No new npm dependencies (Node stdlib `https`, `crypto`, `fs`, `child_process` only). Pack URL allowlist mirrors `isSafeBicameralCommand` shape: only `https://github.com/MythologIQ/FailSafe/releases/download/v<semver>-voice/failsafe-voice-pack-<semver>.tar.gz` patterns pass.

### Unit Tests

Cases declared above. Each test invokes the unit under test (not just imports it) and asserts on output per SG-035.

---

## Phase 2: ConsoleServer Static-Mount Routing

### Affected Files

**Tests (extend existing test file):**

- `FailSafe/extension/src/test/roadmap/ConsoleRouteRegistrar.test.ts` — EXTEND. New cases for FX494: when `host.getVoicePackPath()` returns a path that exists, `setupAllRoutes()` registers an `app.use('/vendor', express.static(...))` middleware BEFORE the default `app.use(express.static(uiDir))`; when path doesn't exist, no extra mount is registered; route registration ordering preserved (vendor mount comes after `express.json` but before SPA fallback).

**Source:**

- `FailSafe/extension/src/roadmap/services/ConsoleRouteRegistrar.ts` — MODIFY. Add `getVoicePackPath: () => string | null` to `ConsoleRouteHost` interface (returns absolute path to voice-pack dir or null). In `setupAllRoutes()`, after `app.use(express.json(...))` and before `app.use(express.static(this.host.uiDir, ...))`, conditionally mount the voice-pack:

  ```ts
  const voicePackPath = this.host.getVoicePackPath();
  if (voicePackPath && fs.existsSync(voicePackPath)) {
    app.use("/vendor", express.static(voicePackPath, { dotfiles: "allow" }));
  }
  ```

- `FailSafe/extension/src/roadmap/ConsoleServer.ts` — MODIFY. Add `private voicePackPath: string | null = null` field + `setVoicePackPath(p: string | null): void { this.voicePackPath = p; }` setter. `buildRouteHost()` adds `getVoicePackPath: () => this.voicePackPath`.

### Changes

Single-responsibility addition: ConsoleServer learns to serve a second source for the same `/vendor` URL space. When the voice-pack dir exists, its files win (Express's `express.static` falls through to the next matching middleware on 404). Existing vendor assets in `dist/extension/ui/vendor/` (3d-force-graph, force-graph) still ship in the VSIX and serve from the default mount. Voice-substrate code in `tts-engine.js` / `whisper-loader.js` / `web-llm-engine.js` reaches the same `../vendor/piper/piper.min.js` URL regardless of where it actually resolves — zero source edits to the 4 hardcoded vendor-path lines flagged in research.

### Unit Tests

Mount-presence + mount-absence assertions cited above. Ordering invariant locked by asserting middleware registration order.

---

## Phase 3: Extension Wiring + VS Code Commands + Settings Card

### Affected Files

**Tests:**

- `FailSafe/extension/src/test/roadmap/voice-pack-settings-card.test.ts` — NEW. 5 JSDOM cases for FX493: card renders `absent` state with Install button + version-empty line + "Voice features disabled" hint; renders `installed v<X>` state with version + Uninstall + Update (when stale) + disk-usage line read from `du`-equivalent stat; toggle click POSTs `/api/integrations/voice-pack/{install,uninstall}`; slot is removed when `/api/integrations/voice-pack/status` returns 404 (build without voice substrate); brainstorm voice button bears `data-action="install-voice-pack"` when pack absent (links into the Settings card flow).
- `FailSafe/extension/src/test/extension/voice-pack-activation.test.ts` — NEW. 4 cases mirroring `bicameral-activation.test.ts` shape: `wireVoicePack(context, consoleServer)` reads globalStoragePath + sets voicePackPath on ConsoleServer; `wireVoicePack` is lazy — does NOT trigger install at activation; `failsafe.installVoicePack` command resolves and routes through `install-handler.installVoicePack`; `failsafe.uninstallVoicePack` resolves + removes pack.

**Source (NEW):**

- `FailSafe/extension/src/extension/bootstrapVoicePack.ts` — NEW. `wireVoicePack(context, consoleServer)` runs at activation (called from `bootstrapServers.ts` after `consoleServer.setIdeTracker(...)`, before `consoleServer.start()`). Probes `context.globalStorageUri.fsPath/voice-pack/` via `voice-pack-detector`; sets `consoleServer.setVoicePackPath(...)` to the resolved path when present, null otherwise. Subscribes to a `voicePack.installed` / `voicePack.uninstalled` event channel and re-probes + re-sets on each. ≤ 80 lines (Section 4 Razor).
- `FailSafe/extension/src/roadmap/routes/VoicePackRoute.ts` — NEW. Routes:
  - `GET /api/integrations/voice-pack/status` — `{ state, version?, manifestPath?, missingFiles?, requiredMinVersion }`.
  - `POST /api/actions/install-voice-pack` — `rejectIfRemote` gate; calls `installVoicePack(...)` with WS broadcast `voicePack.install.progress` per `InstallProgressEvent`.
  - `POST /api/actions/uninstall-voice-pack` — `rejectIfRemote` gate; calls `uninstallVoicePack(...)`; broadcasts `voicePack.uninstalled`.
  - All three follow the BicameralRoute.ts shape and live under ≤ 200L total.
- `FailSafe/extension/src/roadmap/ui/modules/voice-pack-settings-card.js` — NEW. ≤ 80 lines. Card render + bind, parallel to `bicameral-settings-card.js`. Reads `GET /api/integrations/voice-pack/status`, renders state-appropriate buttons + version + disk-usage line. Install button POSTs through to the route; subscribes to WS events for live progress.
- `FailSafe/extension/src/roadmap/ui/modules/voice-controller.js` — MODIFY (small). On `init()`, call `probeVoicePackState` via `/api/integrations/voice-pack/status`; if `state !== 'installed'`, skip TtsEngine/SttEngine wiring + emit `voicePackAbsent` so dependent UI (voice button, voice settings) can show disabled state. ≤ 15 added lines.

**Source (MODIFY):**

- `FailSafe/extension/src/extension/bootstrapServers.ts` — wire `wireVoicePack(context, consoleServer)` call (2 lines: import + invocation).
- `FailSafe/extension/src/extension/main.ts` — register `failsafe.installVoicePack` + `failsafe.uninstallVoicePack` commands (existing pattern; follows `failsafe.installQorLogicSkillsDefaults` shape).
- `FailSafe/extension/src/roadmap/services/ConsoleRouteRegistrar.ts` — register `VoicePackRoute` via `setupVoicePackRoutes(app, ...)` from `registerApiRoutes()`.
- `FailSafe/extension/src/roadmap/ui/modules/settings.js` — slot for `#cc-voice-pack-settings-slot` + `_renderVoicePackSettings()` call. ≤ 5 added lines (matches the bicameral-settings-card pattern).
- `FailSafe/extension/package.json` — add `contributes.commands` entries for `failsafe.installVoicePack` + `failsafe.uninstallVoicePack`; add `failsafeVoicePack.minVersion: "<extension-version>"` field consumed by `REQUIRED_PACK_MIN_VERSION`.

### Changes

Activation surface gains one new wiring helper and two new commands. ConsoleServer gains one new field + one route module. Settings tab gains one new card. No changes to the 9 voice-substrate source files (`tts-engine.js`, `stt-engine.js`, etc.) beyond the 15-line addition in `voice-controller.js` that early-exits when the pack is absent. The 12+ existing voice tests remain valid.

### Unit Tests

Cases declared above. JSDOM tests parallel `bicameral-settings-card.test.ts` shape (proven pattern).

---

## Phase 4: Build Pipeline + Pack Assembly + VSIX Validation

### Affected Files

**Tests:**

- `FailSafe/extension/src/test/scripts/package-voice-pack.test.cjs` — NEW. 4 cases: pack assembler reads from `dist/extension/ui/vendor/{piper,whisper}` and writes `dist/failsafe-voice-pack-<version>.tar.gz`; manifest.json contains all 6 expected files with correct sha256; companion `.sha256` matches tarball; assembler errors clearly when source dir missing.
- `FailSafe/extension/src/test/scripts/validate-vsix-size.test.cjs` — NEW. 2 cases: VSIX ≤ 30 MB assertion passes for a synthesized small archive; fails with descriptive error for an oversized archive.

**Source:**

- `FailSafe/extension/scripts/package-voice-pack.cjs` — NEW (~ 80 lines). Reads `package.json.version`; reads `dist/extension/ui/vendor/{piper,whisper}` contents; produces tarball + sha256 + manifest.json. Uses Node stdlib `tar` polyfill (`child_process.spawn('tar', [...], { shell: false })` — same boundary as install-handler). Manifest schema matches Phase 1's `VoicePackManifest` type.
- `FailSafe/extension/scripts/validate-vsix.cjs` — MODIFY. After existing VSIX content validation, add a 4-line size assertion: read `.vsix` file size, compare to `VSIX_MAX_BYTES = 30 * 1024 * 1024`, exit 1 with descriptive error on overage.
- `FailSafe/extension/package.json` — add scripts:
  - `"package:voice-pack": "node ./scripts/package-voice-pack.cjs"`
  - `"build:package": "npm run compile && npm run bundle && npm run package:voice-pack"` (existing line gets the `&& npm run package:voice-pack` suffix)
- `FailSafe/extension/.vscodeignore` — ADD lines:

  ```
  dist/extension/ui/vendor/piper/**
  dist/extension/ui/vendor/whisper/**
  dist/failsafe-voice-pack-*.tar.gz
  dist/failsafe-voice-pack-*.sha256
  ```

### Changes

Single new build script + two `.vscodeignore` lines + one size-assertion in `validate-vsix.cjs`. `bundle.cjs` is unchanged — it still copies the vendor dirs into `dist/extension/ui/vendor/` so `package:voice-pack` has a known source location. The .vscodeignore exclusions prevent those copied files from entering the VSIX during `vsce package`. Build pipeline timeline: `compile → bundle → package:voice-pack → vsce package (excludes vendor heavy paths)`.

### Unit Tests

Both new `.test.cjs` files use the same `tape`-style sync assertions as existing `bootstrapWorkspaceAssembleReport.test.cjs`.

---

## Phase 5: Docs + FEATURE_INDEX + Memory + CHANGELOG

### Affected Files

- `docs/INTEGRATIONS.md` — APPEND "Voice Pack" section after Bicameral MCP. Cover: what's in the pack, why it's separate, install/uninstall flow, version pinning policy, supply-chain trust boundary (GitHub Releases as the canonical source), graceful-degradation behavior.
- `docs/FEATURE_INDEX.md` — APPEND FX491–FX495 entries (new) + amend FX196 / FX221 / FX222 / FX480 notes per the "Feature Inventory Touches" table above.
- `CHANGELOG.md` — APPEND under existing `[Unreleased] — v5.2.0 (draft)` block: Voice substrate extraction entry summarizing the move + the install affordance + the VSIX size reduction.
- `FailSafe/extension/README.md` — APPEND bullet under "What's New (Unreleased)" pointing to the new INTEGRATIONS.md Voice Pack section.
- `README.md` (root) — APPEND bullet under "Upcoming" pointing to the voice-pack feature.
- Memory (out-of-tree): NEW `reference_voice_pack.md` mirroring `reference_bicameral_mcp.md` shape (pack contents, install policy, version policy, trust boundary). Link in MEMORY.md External References.

### Changes

Doc-only phase. Standard Section 5 pattern.

---

## Phase 6: Per-Feature Playwright Coverage (B199 release-class gate)

### Affected Files

- `FailSafe/extension/src/test/ui/voice-pack.spec.ts` — NEW Playwright spec for FX495. 4 cases:
  - **not-installed state**: Settings card "Voice Pack" section renders Install button + version "—" + disabled brainstorm voice button.
  - **install flow (stubbed fetcher)**: clicking Install fires POST `/api/actions/install-voice-pack`; WebSocket broadcasts replay through to UI progress bar; final state shows version + Uninstall.
  - **uninstall flow**: clicking Uninstall fires POST; UI returns to absent state.
  - **brainstorm voice button**: in `absent` state, brainstorm voice button renders disabled with tooltip "Install voice pack to enable"; clicking it opens the Settings tab focused on the Voice Pack card.
- `FailSafe/extension/src/test/ui/helpers/serveConsoleServerUI.ts` — EXTEND. New fixtures: `voicePackPath?: string`, `voicePackInstalled?: boolean` — when set, writes a fake `voice-pack.manifest.json` + 6 expected files into a temp dir and points ConsoleServer at it via `setVoicePackPath`. Mirrors the `bicameralClient` / `bicameralConfigured` fixture pattern.

### Changes

Mirrors the proven `integrations-bicameral.spec.ts` shape from Phase 5 of the bicameral cycle. Fake-fetcher fixture means no real download during E2E.

### Unit Tests

Playwright cases above also serve as the FX495 functional acceptance per SG-035.

---

## Phase Affected Files Summary

**Phase 1** (substrate): 4 NEW source files under `src/voice-pack/`, 2 NEW test files.
**Phase 2** (mount routing): 2 modified source files, 1 extended test file.
**Phase 3** (wiring + UI + commands): 4 NEW source files (bootstrap + route + settings card + activation test), 2 modified source files, 2 NEW test files, 5 modified source files.
**Phase 4** (build pipeline): 1 NEW script, 1 modified script, 1 modified `package.json`, 1 modified `.vscodeignore`, 2 NEW test files.
**Phase 5** (docs): 5 modified docs (1 new section in INTEGRATIONS, 5 row-additions in FEATURE_INDEX, 1 new CHANGELOG paragraph, 2 README bullets), 1 NEW memory file (out-of-tree).
**Phase 6** (Playwright): 1 NEW spec, 1 extended fixture helper.

Total: 12 new source files, 8 modified source files, 5 new test files, 2 extended test files, 5 modified doc files, 1 new memory file.

## Acceptance Criteria

- Base VSIX (post-extraction) size ≤ 30 MB (enforced by `validate-vsix.cjs`).
- Voice pack tarball includes exactly 6 vendor files (piper.min.js, piper_phonemize.data, piper_phonemize.wasm, ort-wasm-simd.wasm, ort-wasm-simd-threaded.wasm, transformers.min.js) + manifest.json with sha256 of each.
- All existing 12+ voice tests continue to pass.
- 5 NEW FX entries (FX491–FX495) land at `verified` status with the cited test files functional under SG-035.
- Voice substrate code (9 files) requires no path edits to function with the pack at globalStoragePath.
- Brainstorm tab remains usable without the pack (text-only flow + Settings card affordance to install).
- Cycle ends with stage-only review boundary honored: no GitHub Release created, no marketplace publish, no version bump.

## Out of Scope (Backlog Candidates)

- **B-VP-1** — Cosign / Sigstore signed manifest for the voice-pack tarball (current trust posture: plain `.sha256` + HTTPS-from-GitHub).
- **B-VP-2** — Auto-update mechanism: detect pack `stale` on extension update + offer one-click update (current: operator triggers via Settings).
- **B-VP-3** — Per-platform pack variants if future voice models introduce OS-specific binaries.
- **B-VP-4** — Voice-pack mirror hosting (offline install path / alternative CDN).
- **B-VP-5** — Migrate the pack-distribution pattern into a generic `companion-pack` abstraction reusable for future heavy-asset extractions (mirrors the B-INT-4 `McpClientHost` promotion principle).
