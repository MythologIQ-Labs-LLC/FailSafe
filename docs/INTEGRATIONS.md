# Third-Party Integrations

FailSafe v5.x ships a small, opinionated set of third-party integrations behind a single Command Center tab (**Integrations**). Each integration is **opt-in**, installed on the operator's own machine, and exposes a typed surface that FailSafe drives — nothing is bundled inside the VSIX.

## Bicameral MCP (v1)

[Bicameral MCP](https://github.com/BicameralAI/bicameral-mcp) maintains a per-workspace ledger of design decisions plus drift detection between those decisions and the code that bound them. When connected, FailSafe surfaces decision history, drifted bindings, and a one-click ratify/reject affordance for each open decision.

### Solo vs Team mode

The Integrations tab offers two install pickers. Both run `pip install bicameral-mcp` on your machine, then `bicameral-mcp setup` with the chosen mode flag. The choice affects only how the resulting `.bicameral/config.yaml` is laid out — there is no per-tier feature gating between the two modes:

| Mode | Picks | Suited for |
|---|---|---|
| **Solo** | `bicameral-mcp setup --mode solo` | Single-author workspaces. Decision ledger lives entirely under `.bicameral/`. |
| **Team** | `bicameral-mcp setup --mode team` | Shared workspaces. Setup expects the operator to commit `.bicameral/` to the repo so teammates inherit the ledger. |

Re-running install/setup against an already-configured workspace is safe: `pip install` is idempotent, and the setup CLI skips files that already exist.

### Supply-chain trust boundary

FailSafe **does not bundle** the Bicameral MCP server. The install action invokes `pip` against the operator's resolved Python interpreter, downloading from PyPI under the operator's credentials. This is a supply-chain trust decision: the operator is responsible for verifying the publisher (`bicameralai`) on PyPI, pinning a version, and reviewing what `bicameral-mcp setup` writes.

The spawn boundary is hardened against argv injection — `isSafeBicameralCommand()` allows only bare executable names matching `^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$` or absolute paths under the operator's home tree; everything else is rejected with `not-installed`. Command-line arguments are passed as a literal array, never through a shell.

### v1 surface — four MCP tools

When the operator clicks **Connect**, FailSafe opens an MCP stdio session and calls four tools:

| Tool | Used for | Return shape (parsed) |
|---|---|---|
| `bicameral.history` | List feature-scoped decisions to render in the Integrations tab | `BicameralFeatureBrief[]` |
| `bicameral.preflight` | Decision-drift check run when a tier-3 action is queued for L3 approval (B-INT-2) | `BicameralPreflightResult` |
| `bicameral.drift` | Per-file drift status when a file path is supplied | `BicameralDriftStatus[]` |
| `bicameral.ratify` | Operator confirms or rejects a single decision | void (boolean status implicit in HTTP 200) |

The remaining nine tools (`ingest`, `search`, `brief`, `judge_gaps`, `resolve_compliance`, `link_commit`, `update`, `reset`, `dashboard`, `validate_symbols`, `get_neighbors`) are tracked as follow-ups in `docs/BACKLOG.md` (**B-INT-1**).

### Preflight on the L3 approval card (B-INT-2)

When the governance pipeline routes a tier-3 (high-risk) action to the L3 approval queue, FailSafe runs `bicameral.preflight` against the target file. If the file conflicts with one or more prior bicameral decisions, the drift evidence is attached to the pending L3 entry (`meta.preflight`) and surfaces inline on the approval card as a "Conflicts with decision: …" line, so the operator sees the conflict *before* approving the action.

Preflight runs asynchronously, after the L3 entry is already queued — the approval card appears immediately and the conflict line is added on the next hub rebuild once preflight returns. When the Bicameral MCP client is absent or disconnected, the check is a silent no-op: the L3 entry stands without a conflict line.

### Drift in Sentinel + the Risks Register (B-BIC-17/18)

Each `bicameral.drift` and `bicameral.ratify` call also emits a `bicameral.verdict` event on the FailSafe event bus. Two governance surfaces consume it. **Sentinel** classifies the verdict (B-BIC-17): a `drifted` verdict is high-priority and notifying, while `ratified` and `in-sync` are benign — a notifying verdict is surfaced over the existing WebSocket broadcast channel (classification only; it is not turned into a Sentinel arbitration event). The **Risks Register** mirrors drift (B-BIC-18): a `drifted` verdict upserts a risk entry keyed `bicameral:{decisionId}` so it appears in the Risks tab; ratifying that decision closes the entry. The mirror is idempotent and exception-isolated — a register write failure never breaks the drift/ratify route response.

### Settings

Three VS Code settings control the integration:

- `failsafe.integrations.bicameral.command` (string, default `"bicameral-mcp"`) — executable to spawn for `--version` probe and MCP stdio session. Must satisfy the spawn-boundary validator described above.
- `failsafe.integrations.bicameral.pipCommand` (string, default `"pip"`) — pip invocation used by the install bridge. Accepts `"pip"`, `"pip3"`, or `"python -m pip"`.
- `failsafe.integrations.bicameral.autoConnect` (boolean, default `false`) — when enabled, FailSafe runs the install-state probe at activation and opens an MCP session in the background if the workspace is already configured. Default off; the operator explicitly clicks **Connect** when ready.

The Settings tab surfaces a Bicameral MCP card with the current install state, version, autoConnect toggle, and a "Re-install / Re-setup…" shortcut that switches to the Integrations tab. The autoConnect flag is also writable from the card (HTTP `POST /api/integrations/bicameral/auto-connect` updates the workspace-scoped setting).

### Route surface

All routes are local-only (gated by `rejectIfRemote`); the Console Server refuses requests originating outside `127.0.0.1`.

| Method | Path | Notes |
|---|---|---|
| `GET`  | `/api/integrations/bicameral/status` | Install probe (state + version + configPath + autoConnect). Safe to poll. |
| `POST` | `/api/actions/bicameral-install` | Bridge for the install picker. Body `{ mode: "solo" \| "team" }`. Per-step progress broadcast over WS as `bicameral.install.progress` / `bicameral.install.complete`. |
| `POST` | `/api/actions/bicameral-connect` | Opens the MCP stdio session lazily. 503 when the client is not wired. |
| `POST` | `/api/actions/bicameral-disconnect` | Closes the session. 503 / 409 on missing client / not-connected. |
| `POST` | `/api/actions/bicameral-history` | Returns `{ ok, features: BicameralFeatureBrief[] }`. |
| `POST` | `/api/actions/bicameral-drift` | Body `{ filePath: string }`. Returns `{ ok, drift: BicameralDriftStatus[] }`. |
| `POST` | `/api/actions/bicameral-ratify` | Body `{ decisionId: string, verdict: "ratify" \| "reject" }`. |
| `POST` | `/api/integrations/bicameral/auto-connect` | Body `{ enabled: boolean }`. Persists to workspace VS Code settings. |

### License credit

Bicameral MCP is the work of the BicameralAI maintainers and is distributed independently of FailSafe under its own license. See the upstream README for the canonical license terms. FailSafe's wrapper code (client, install detector, install handler, route module, UI cards) is part of the FailSafe extension and ships under the FailSafe license; no Bicameral source is vendored or redistributed.

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

### Test coverage

The Voice Pack **supply-chain trust boundary** is unit-covered:
`resolveVoicePackUrl()` version validation + canonical GitHub Releases asset
URL construction, the `ALLOWED_REDIRECT_HOSTS` redirect-target allowlist, and
the `installVoicePack()` SHA-256 mismatch abort are all exercised in
`src/test/extension/voice-pack-install.test.ts`. The Settings-card UI flow is
covered by the Playwright spec `src/test/ui/voice-pack.spec.ts`, which stubs the
GitHub Release download via `page.route()`.

Real Whisper transcription / Piper audio playback and a live tarball download
are a **deliberate, documented coverage trade-off** — the vendor binaries ship
as a separate companion download and are absent from CI by design. See
[`docs/TEST_COVERAGE_TRADEOFFS.md`](TEST_COVERAGE_TRADEOFFS.md) (B-B199-3 /
B-B199-6) for the full rationale and accepted residual risk.

### License credit

`piper-tts-web` is the work of its upstream maintainers. `@xenova/transformers` is the work of HuggingFace and the Transformers.js maintainers. ONNX Runtime is the work of the Microsoft ONNX Runtime project. All three are distributed under their own licenses (consult upstream READMEs). FailSafe's voice substrate code (engines, controllers, UI cards, install handler, route module) is part of the FailSafe extension and ships under the FailSafe license; no upstream source is vendored or redistributed in the base VSIX. The companion voice pack mirrors the existing license terms of each upstream.
