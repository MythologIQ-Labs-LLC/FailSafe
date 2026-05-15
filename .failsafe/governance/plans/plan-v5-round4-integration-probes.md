# Plan: v5.0.0 Round 4 — Integration Probes (Ollama Liveness + Voice Lifecycle)

**Issues closed:** #61 (Ollama false positive), #62 (Voice activation chain)
**Tracker:** #63
**Plan author:** /qor-plan, 2026-04-27
**Status:** implementation-ready

## Open Questions

1. **Ollama probe interval** — issue #61 suggests 30 s while panel visible, plus on-open and manual-refresh. Confirm interval; default 30 s.
2. **Probe endpoint port** — assumes default `localhost:11434`. Make configurable via `failsafe.ai.ollamaEndpoint` setting? Default: yes (string, default `http://localhost:11434`).
3. **Voice mic-preflight before model load** — issue #62 says split mic permission from Whisper readiness. Confirm we want mic-permission request to be available before model load completes.
4. **Whisper non-English model selection** — #62 ties to B127. Default: ship the model-selection logic but keep `Xenova/whisper-tiny.en` as the only model for v5.0.0; non-English path lands in v5.0.1 (out of v5.0.0 blocker scope, since the issue is voice activation, not language coverage).

## Affected Surfaces

```text
NEW src/sentinel/integrations/OllamaProbe.ts
NEW src/test/sentinel/ollama-probe.test.ts
NEW src/test/roadmap/voice-controller-state.test.ts

MOD src/sentinel/utils/LLMClient.ts (or wherever Ollama detection lives) # remove default-true
MOD src/roadmap/ConsoleServer.ts                                        # aiStatus snapshot
MOD src/roadmap/ui/modules/llm-status.js                                # render OllamaStatus + last-checked
MOD src/roadmap/ui/modules/brainstorm.js                                # voice state machine
MOD src/roadmap/services/SttEngine.ts (or current STT module)           # preflightMic + normalized error status
MOD src/roadmap/services/VoiceController.ts (or current)                # syncButtonState
MOD src/roadmap/ui/modules/prep-bay.js                                  # visualizer guards
MOD src/roadmap/services/LiveTranscriber.ts (or current)                # onError callback
MOD package.json                                                        # ollamaEndpoint setting
```

---

## Phase 1 — Ollama liveness probe (#61)

**Goal:** AI status shows "Ollama: not detected" on systems without Ollama. Status only flips to "connected" after a real `/api/version` response with a plausible version field.

### Unit Tests (write first)

- `src/test/sentinel/ollama-probe.test.ts` (new)
  - No server (ECONNREFUSED): returns `{ state: 'not-detected', error: <message> }`.
  - Server returns 404: returns `{ state: 'unreachable', error: 'HTTP 404' }`.
  - Server returns 200 with `{}`: returns `{ state: 'error', error: 'Ollama response missing version' }`.
  - Server returns 200 with `{ version: '0.x.y' }`: returns `{ state: 'connected', version: '0.x.y' }`.
  - Probe times out after `timeoutMs`: returns `{ state: 'not-detected', error: <abort message> }`.
  - All results carry `checkedAt` ISO timestamp.
  - Initial cached state before any probe: `{ state: 'unknown', checkedAt: null }`.

### Changes

`src/sentinel/integrations/OllamaProbe.ts` (new):

```ts
export interface OllamaStatus {
  state: 'connected' | 'not-detected' | 'unreachable' | 'error' | 'unknown';
  version?: string;
  endpoint: string;
  checkedAt: string | null;
  error?: string;
}

export async function detectOllama(
  endpoint: string,
  timeoutMs = 1500,
): Promise<OllamaStatus> {
  // exact code from issue #61 suggestion
}

export class OllamaStatusCache {
  private current: OllamaStatus = { state: 'unknown', endpoint: '', checkedAt: null };
  async refresh(endpoint: string, timeoutMs?: number): Promise<OllamaStatus>;
  get(): OllamaStatus;
}
```

`src/sentinel/utils/LLMClient.ts` — remove any "any HTTP response → connected" optimism. Delegate to `OllamaProbe`.

`src/roadmap/ConsoleServer.ts`:

```ts
aiStatus: {
  ollama: this.ollamaStatusCache.get(),
  wasm: this.wasmStatusCache.get(),
}
```

Add a route or message handler that triggers a refresh on demand: `/api/ai-status/refresh` or webview message `aiStatus.refresh`.

`src/roadmap/ui/modules/llm-status.js` — render the OllamaStatus shape with the `state` value, version when connected, last-checked timestamp, and a manual "Refresh" button.

`package.json`:

```json
"failsafe.ai.ollamaEndpoint": {
  "type": "string",
  "default": "http://localhost:11434",
  "description": "Ollama API endpoint to probe for liveness."
}
```

Probe schedule:
- On Command Center open
- On Settings/AI panel open
- On manual Refresh
- Every 30 s while the AI panel is visible

### CI / validation

```bash
cd FailSafe/extension
npm test
```

Manual: on a system without Ollama → status shows "Ollama: not detected" with checked timestamp. With Ollama running → shows "connected" + version.

---

## Phase 2 — Voice activation lifecycle (#62)

**Goal:** clicking the record button never silently fails. The four states (PREPARING / LISTEN / NO MIC / MODEL FAILED / STOP) are explicit. Mic-permission request is decoupled from Whisper-model readiness. Modal record button state syncs immediately with the main controller. Visualizer is guarded against stale draw loops.

### Unit Tests (write first)

- `src/test/roadmap/voice-controller-state.test.ts` (new)
  - Initial state with `stt.modelReady === false` and `loadingStatus === 'loading'`: `syncButtonState()` reports button label `⏳ LOADING`, disabled.
  - Mic available + model ready: `🎙️ LISTEN`, enabled.
  - Mic denied: `❌ NO MIC`, disabled.
  - Model load failed: `MODEL FAILED`, disabled.
  - Recording active: `⏹️ STOP`, enabled.
- `src/test/roadmap/stt-engine-preflight.test.ts` (new)
  - `preflightMic()` returns `{ ok: true }` when getUserMedia resolves.
  - `NotAllowedError` → `{ ok: false, reason: 'Microphone access denied' }`.
  - `NotFoundError` → `{ ok: false, reason: 'No microphone detected' }`.
  - Missing `mediaDevices`: `{ ok: false, reason: 'Browser mediaDevices.getUserMedia is unavailable' }`.

### Changes

`src/roadmap/services/SttEngine.ts` (or equivalent):

```ts
async preflightMic(): Promise<{ ok: true } | { ok: false; reason: string }> {
  // exact code from issue #62 suggestion
}

// Normalize error progress callback
this.onModelProgress?.('error', err?.message || 'model_load_failed');
```

`src/roadmap/services/VoiceController.ts`:

```ts
syncButtonState(): void {
  if (this.voiceActive) this.onMicButton?.('⏹️ STOP', true, false, 'Stop recording');
  else if (this.stt.modelReady) this.onMicButton?.('🎙️ LISTEN', false, false, 'Click to speak');
  else if (this.stt.loadingStatus === 'loading' || this.stt.loadingStatus === 'downloading') {
    this.onMicButton?.('⏳ LOADING', false, true, 'Voice model is loading');
  } else if (this.stt.loadFailed) {
    this.onMicButton?.('MODEL FAILED', false, true, 'Voice model failed to load');
  } else {
    this.onMicButton?.('❌ NO MIC', false, true, 'Voice unavailable');
  }
}
```

Call `syncButtonState()` after `_wireModalVoiceState(...)`.

`src/roadmap/ui/modules/prep-bay.js` (modal visualizer guards):

```js
// Inside _drawModalVisualizer() and the inner draw() loop:
if (!analyser || !this._modalTextarea || !document.body.contains(canvas)) return;
```

`src/roadmap/services/LiveTranscriber.ts`:

```ts
this._live.onError = (reason) => {
  this.onModelProgress?.('warning', `Live captions unavailable: ${reason}`);
};
```

`VoiceController.wireModelProgress()` — handle `warning` status without disabling the mic.

`SttEngine` — model selection:

```ts
const model = this.language?.startsWith('en')
  ? 'Xenova/whisper-tiny.en'
  : 'Xenova/whisper-tiny.en'; // v5.0.0: keep en-only; non-en in v5.0.1
```

(B127 fully resolves in v5.0.1 — out-of-scope for this issue's blocker definition.)

### CI / validation

Manual sequence (per issue #62 acceptance):
1. Fresh install → open Brainstorm Prep Bay → click record → permission prompt appears.
2. Accept permission → button shows recording state, waveform draws.
3. Speak briefly → final transcript appears in textarea.
4. Deny mic → status shows "Microphone access denied"; button does not pretend to record.
5. Simulate model load failure (block transformers.js fetch) → "MODEL FAILED" state, recoverable retry path.
6. Open modal → start record → close modal quickly → reopen → start record → no duplicate visualizer loops, no stale callback errors.

---

## Aggregate verification

```bash
cd FailSafe/extension
npm run lint
npm run compile
npx vscode-test --extensionDevelopmentPath . --extensionTestsPath ./out/test/suite/index
```

Per-phase additions: +6, +9 = **+15 new tests**.

CHANGELOG.md (root + extension) under v5.0.0 "Fixed":
- AI status shows real Ollama liveness (was: false-positive when not installed).
- Voice recording activation reports honest state per failure mode (mic / model / permission); modal record button syncs with main controller.
