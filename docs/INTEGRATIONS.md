# Third-Party Integrations

FailSafe v5.x exposes a small, opinionated set of third-party integrations behind a single Command Center surface. Each integration is **opt-in**, installed on the operator's own machine, and exposes a typed surface that FailSafe drives — nothing is bundled inside the VSIX.

## Voice Pack (companion download)

Resolves [B195](BACKLOG.md) — the v5.0.0 VSIX hit 47.6 MB (vs 24.2 MB in v4.9.9) due to vendored Piper TTS + Whisper STT vendor binaries. Per the 2026-05-18 disposition decision, all voice functionality beyond system-native components ships as a **separate voice-pack download**. The base VSIX strips the heavy vendor binaries; voice substrate **code** stays in the extension and degrades gracefully when the pack isn't installed.

### What's in the pack

A single `failsafe-voice-pack-<version>.tar.gz` containing six vendor files (~86 MB uncompressed, ~28 MB gzipped):

| Path | Approx. size | Role |
|---|---|---|
| `piper/piper.min.js` | 46.7 MB | Piper TTS browser-side bundle |
| `piper/piper_phonemize.data` | 18.1 MB | Phoneme model data |
| `piper/piper_phonemize.wasm` | 0.6 MB | Phonemize WASM |
| `whisper/ort-wasm-simd.wasm` | 10.0 MB | ONNX Runtime SIMD (Whisper STT) |
| `whisper/ort-wasm-simd-threaded.wasm` | 10.0 MB | ONNX Runtime SIMD threaded |
| `whisper/transformers.min.js` | 0.9 MB | `@xenova/transformers` browser bundle |

The pack also contains a `voice-pack.manifest.json` declaring version, build timestamp, expected files, and SHA-256 of each.

### What stays in the base extension

Voice substrate code — controllers, audio pipeline, brainstorm voice integration — lives at `FailSafe/extension/src/roadmap/ui/modules/` (`tts-engine.js`, `stt-engine.js`, `whisper-loader.js`, `whisper-pipeline.js`, `voice-controller.js`, `voice-catalog.js`, `voice-settings.js`, `voice-status-badge.js`). All 12+ voice tests stay. None of these require the pack to load; they only require it to **execute** TTS playback or Whisper STT.

### Install / uninstall

Two operator-explicit paths:

1. **Command palette** — run `FailSafe: Install Voice Pack` (`failsafe.installVoicePack`). Companion `FailSafe: Uninstall Voice Pack` (`failsafe.uninstallVoicePack`).
2. **Settings tab → Voice Pack card** — Install / Update / Uninstall buttons; live progress per phase (download → verify → extract → manifest-verify); explicit Dismiss + Retry on error.

The pack lives at `context.globalStorageUri.fsPath/voice-pack/` (OS-correct VS Code per-user storage). When installed, the ConsoleServer mounts `/vendor` from that directory at first route registration; existing voice substrate code reaches `../vendor/piper/piper.min.js` and `../vendor/whisper/transformers.min.js` without source-edits.

### Graceful degradation

When the pack is absent:

- `voice-pack-detector` reports `state: absent` (or `stale` / `corrupt`); status surfaced via `GET /api/integrations/voice-pack/status`.
- TtsEngine emits `error:piper_not_vendored` when it tries to fetch the missing piper bundle.
- Whisper-loader emits `whisper-load-failed` when transformers.min.js is unreachable.
- Voice UI elements render disabled with an "Install voice pack" affordance.
- Brainstorm text-only flow remains fully functional.

### Supply-chain trust boundary

Pack is distributed as a **GitHub Releases asset** alongside the matching extension version tag. The asset URL is constructed deterministically:

```
https://github.com/MythologIQ/FailSafe/releases/download/v<X.Y.Z>-voice/failsafe-voice-pack-<X.Y.Z>.tar.gz
```

Plus a companion `.sha256` file. Both download via Node 20+ built-in `fetch({ redirect: 'follow' })`. The redirect chain is **bounded** to GitHub-hosted destinations (`github.com` / `objects.githubusercontent.com` / `codeload.github.com`); any other final-URL host rejects the download before any bytes hit disk. Tarball SHA-256 is verified before extraction; extraction failure leaves the prior pack intact (atomic-rename semantics).

This is a supply-chain trust decision consistent with other operator-installed integrations: the operator trusts GitHub Releases under MythologIQ's organization namespace, the same trust posture used for the extension itself.

### Version pinning

Pack version === extension version (single source of truth from `package.json`). Runtime accepts pack ≥ `requiredMinVersion` (downgrade-tolerant — a v5.2.0 extension keeps working with an installed v5.2.0 pack after the extension is downgraded to v5.2.0 from v5.2.1). When the extension version exceeds the installed pack version's minimum, the pack reports `state: stale` and the Settings card surfaces an **Update** button.

### Routes

All routes are local-only (gated by `rejectIfRemote`).

| Method | Path | Purpose |
|---|---|---|
| `GET`  | `/api/integrations/voice-pack/status` | Probe (state + version + manifestPath + missingFiles + requiredMinVersion + diskUsageBytes). Safe to poll. |
| `POST` | `/api/actions/install-voice-pack` | Bridge for install. Final report in body; per-phase progress over WebSocket as `voicePack.install.progress` / `voicePack.install.complete` / `voicePack.install.error`. |
| `POST` | `/api/actions/uninstall-voice-pack` | rm-rf voice-pack/; broadcasts `voicePack.uninstalled`. |

### VS Code settings

No new operator-visible settings in v1. The pack version is derived from the extension's `package.json`; redirect-allowlist is hardcoded; the download path is hardcoded to `MythologIQ/FailSafe` GitHub Releases. Future flexibility (custom GitHub repo, mirror URLs, signature verification) tracked in the Out of Scope section of the plan.

### Out of scope (v1)

- Cosign / Sigstore signed manifests (current trust: HTTPS-from-GitHub + SHA-256).
- Auto-update beyond manual reinstall.
- Per-platform pack variants (current Piper + Whisper assets are platform-neutral WASM/JS).
- Voice-pack mirror hosting / offline install.

### License credit

`piper-tts-web` is the work of its upstream maintainers. `@xenova/transformers` is the work of HuggingFace and the Transformers.js maintainers. ONNX Runtime is the work of the Microsoft ONNX Runtime project. All three are distributed under their own licenses (consult upstream READMEs). FailSafe's voice substrate code (engines, controllers, UI cards, install handler, route module) is part of the FailSafe extension and ships under the FailSafe license; no upstream source is vendored or redistributed in the base VSIX. The companion voice pack mirrors the existing license terms of each upstream.
