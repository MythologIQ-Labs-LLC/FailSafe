// FailSafe Command Center — Voice Controller
// Manages voice toggle, PTT coordination, model progress, wake word UI wiring,
// and (per v4.10.1a B127) multi-subscriber state + analyser fan-out with cache
// and replay so late subscribers (Voice status badge, Prep Bay modal visualizer)
// see the most recent value on attach instead of waiting for the next event.
// FX896 (#236): transitions serialize through one gate; state derives from
// the awaited engine state with rollback.
import { DEFAULT_STT_LANGUAGE, LANGUAGE_TO_DEFAULT_VOICE, ALLOWED_WHISPER_MODELS } from './voice-catalog.js';
import { applyVoiceSettings, createTransitionGate } from './voice-controller-support.js';
import { presentModelProgress } from './voice-capability-presenter.js';
import {
  createVoiceSession, transitionVoiceSession, isVoiceActive, isPttActive,
} from './voice-session-state.js';
export class VoiceController {
  constructor(stt, tts, store) {
    this.stt = stt;
    this.tts = tts;
    this.store = store;
    this._session = createVoiceSession();
    // Legacy single-slot UI callbacks (kept for back-compat with existing wiring).
    this.onMicButton = null; this.onStatus = null; this.onAnalyser = null;
    // Multi-subscriber fan-out (B127 keystone).
    this._state = 'idle';
    this._stateListeners = new Set();
    this._lastAnalyser = null;
    this._analyserListeners = new Set();
    // FX896: transition gate + auto-stop composition hook (LD6) + LD8 flag.
    this._gate = createTransitionGate();
    this._onAutoStopSettings = null; this._destroyed = false;
    this._wireStateEmit();
  }
  // -- Public API --------------------------------------------------------------
  get voiceActive() { return isVoiceActive(this._session); }
  get pttActive() { return isPttActive(this._session); }

  /** Probe the operator-installed voice pack. Returns `installed` when ready;
   *  any other state means voice features are disabled and the UI should
   *  surface an Install Voice Pack affordance. Engine error path
   *  (`error:piper_not_vendored`) remains the runtime safety net; this is the
   *  UI-side gate. Phase 3 of voice-substrate-extraction. */
  async probeVoicePack() {
    try {
      const res = await fetch('/api/integrations/voice-pack/status');
      if (!res.ok) return 'absent';
      const status = await res.json();
      return (status && status.state) || 'absent';
    } catch {
      return 'absent';
    }
  }

  addStateListener(fn) {
    if (typeof fn !== 'function') return () => {};
    this._stateListeners.add(fn);
    try { fn(this._state); } catch { /* listener error swallowed */ }
    return () => this._stateListeners.delete(fn);
  }

  addAnalyserListener(fn) {
    if (typeof fn !== 'function') return () => {};
    this._analyserListeners.add(fn);
    if (this._lastAnalyser) {
      try { fn(this._lastAnalyser); } catch { /* listener error swallowed */ }
    }
    return () => this._analyserListeners.delete(fn);
  }

  setLanguage(lang) {
    const next = lang || DEFAULT_STT_LANGUAGE;
    this.stt.language = next;
    this.store?.set?.('stt-language', next);
    const auto = this.store?.get?.('voice-auto-match');
    if (auto === 'true' || auto === true) {
      const voiceId = LANGUAGE_TO_DEFAULT_VOICE[next];
      if (voiceId) {
        this.store?.set?.('tts-voice', voiceId);
        if (this.tts) this.tts.voiceId = voiceId;
      }
    }
  }

  async swapWhisperModel(newModelId) {
    if (!newModelId || !ALLOWED_WHISPER_MODELS.has(newModelId)) return;
    if (this._swapping) return; // swap-specific re-entry fast-path
    this._swapping = true;
    return this._gate.run(async () => {
      try {
        if (this._destroyed) return;
        this.store?.set?.('whisper-model', newModelId);
        if (this.stt.setModelId) this.stt.setModelId(newModelId);
        if (this.stt.teardownPipeline) this.stt.teardownPipeline();
        this._setSession({ type: 'stopped' });
        this._emitState('idle');
        this._lastAnalyser = null;
        await this.stt.init?.();
      } finally {
        this._swapping = false;
      }
    });
  }

  wireModelProgress() {
    this.stt.onModelProgress = (status, msg) => {
      const p = presentModelProgress(status, msg, this.stt.modelId); // #237 LD1 presenter delegate
      if (!p) return; // statuses the UI doesn't present (parity: no-op)
      this._setMicContent(p.micHtml, p.disabled, p.title);
      if (p.statusMsg) this.onStatus?.(p.statusMsg, p.statusColor);
    };
  }

  loadSettings() {
    applyVoiceSettings(this, this.stt, this.store);
  }

  async toggle() {
    if (this.pttActive) return;
    if (!this.stt.modelReady) {
      const msg = this.stt.loadingStatus === 'downloading' || this.stt.loadingStatus === 'loading'
        ? 'Security model is still preparing — please wait...'
        : 'Voice model not available — type your ideas instead';
      this.onStatus?.(msg, 'var(--accent-gold)');
      return;
    }
    return this._gate.run(async () => {
      if (this._destroyed) return;
      if (this.voiceActive) {
        this._setSession({ type: 'stop_requested' });
        this._emitState('stopping');
        await this.stt.stopListening();
        if (this._destroyed) return;
        this._completeStop('Processing...');
      } else {
        await this._startRecording('Recording...', 'voice');
      }
    });
  }

  async startPtt() {
    if (this.voiceActive || this.pttActive || !this.stt.modelReady) return false;
    return this._gate.run(async () => {
      if (this._destroyed || this.voiceActive || this.pttActive) return false;
      return this._startRecording('Recording (PTT)...', 'ptt');
    });
  }

  async stopPtt() {
    if (!this.pttActive) return;
    return this._gate.run(async () => {
      if (this._destroyed || !this.pttActive) return;
      this._setSession({ type: 'stop_requested' });
      await this.stt.stopListening();
      if (this._destroyed) return;
      this._completeStop('Processing...');
    });
  }

  destroy() {
    // LD8: flag set synchronously, teardown immediate (never gate-queued).
    if (this._destroyed) return;
    this._destroyed = true;
    this._setSession({ type: 'destroyed' });
    this._swapping = false;
    this.stt.destroy();
    this.tts.destroy();
    this._stateListeners.clear();
    this._analyserListeners.clear();
    this._lastAnalyser = null;
  }

  // -- Private helpers ---------------------------------------------------------

  // Gate-internal start: derive success from stt.state, roll back otherwise.
  async _startRecording(recordingStatus, mode) {
    this._setSession({ type: 'start_requested', mode });
    this._emitState('requesting_permission');
    await this.stt.startListening();
    if (this._destroyed) return false;
    if (this.stt.state !== 'listening') {
      this._setSession({ type: 'start_failed' });
      this.onMicButton?.('🎙️ LISTEN', false);
      return false;
    }
    this._setSession({ type: 'started' });
    this.onMicButton?.('⏹️ STOP', true);
    this.onStatus?.(recordingStatus, 'var(--accent-red)');
    return true;
  }

  // LD7 single wake owner: engine emits the trigger; the start happens here.
  _onWakeTriggered() {
    return this._gate.run(async () => {
      if (this._destroyed || this.voiceActive || this.pttActive) return;
      await this._startRecording('Wake word detected — recording...', 'voice');
    });
  }

  _setSession(event) {
    this._session = transitionVoiceSession(this._session, event);
  }

  _completeStop(status) {
    this._setSession({ type: 'stopped' });
    this.onMicButton?.('🎙️ LISTEN', false);
    this.onStatus?.(status, 'var(--accent-cyan)');
  }

  _completeAutoStop() {
    this._completeStop('Auto-stopped (silence)');
  }

  _wireStateEmit() {
    // Translation table: 4 underlying signals → unified state stream.
    this.stt.onStateChange = (s) => this._emitState(s);
    this.tts.onStateChange = (s) => {
      if (s === 'speaking') this._emitState('speaking');
      else if (s === 'idle' && this._state === 'speaking') this._emitState('idle');
      else if (typeof s === 'string' && s.startsWith('error')) this._emitState(s);
    };
    this.stt.onAnalyserCreated = (analyser) => {
      this._lastAnalyser = analyser;
      this.onAnalyser?.(analyser);
      for (const fn of [...this._analyserListeners]) {
        try { fn(analyser); } catch { /* swallow */ }
      }
    };
    const origAutoStop = this.stt.onAutoStop;
    this.stt.onAutoStop = () => {
      this._lastAnalyser = null;
      origAutoStop?.();
      this._onAutoStopSettings?.(); // LD6 composition: settings half, post-cache-clear
    };
  }

  _emitState(next) {
    if (next === this._state) return;
    this._state = next;
    if (next === 'idle' || next === 'processing') this._lastAnalyser = null;
    for (const fn of [...this._stateListeners]) {
      try { fn(next); } catch { /* swallow */ }
    }
  }

  _setMicDisabled(disabled, title) {
    this.onMicButton?.(null, false, disabled, title);
  }

  _setMicContent(html, disabled, title) {
    this.onMicButton?.(html, !disabled, disabled, title);
  }
}
