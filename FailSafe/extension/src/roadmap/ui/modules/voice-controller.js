// FailSafe Command Center — Voice Controller
// Manages voice toggle, PTT coordination, model progress, wake word UI wiring,
// and (per v4.10.1a B127) multi-subscriber state + analyser fan-out with cache
// and replay so late subscribers (Voice status badge, Prep Bay modal visualizer)
// see the most recent value on attach instead of waiting for the next event.

import { DEFAULT_STT_LANGUAGE, LANGUAGE_TO_DEFAULT_VOICE, ALLOWED_WHISPER_MODELS } from './voice-catalog.js';

export class VoiceController {
  constructor(stt, tts, store) {
    this.stt = stt;
    this.tts = tts;
    this.store = store;
    this.voiceActive = false;
    this.pttActive = false;

    // Legacy single-slot UI callbacks (kept for back-compat with existing wiring).
    this.onMicButton = null;
    this.onStatus = null;
    this.onAnalyser = null;

    // Multi-subscriber fan-out (B127 keystone).
    this._state = 'idle';
    this._stateListeners = new Set();
    this._lastAnalyser = null;
    this._analyserListeners = new Set();

    this._wireStateEmit();
  }

  // -- Public API --------------------------------------------------------------

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
    if (this._swapping) return;
    this._swapping = true;
    try {
      this.store?.set?.('whisper-model', newModelId);
      if (this.stt.setModelId) this.stt.setModelId(newModelId);
      if (this.stt.teardownPipeline) this.stt.teardownPipeline();
      this._emitState('idle');
      this._lastAnalyser = null;
      await this.stt.init?.();
    } finally {
      this._swapping = false;
    }
  }

  wireModelProgress() {
    this.stt.onModelProgress = (status, msg) => {
      if (status === 'downloading') {
        this._setMicContent('🎙️ PREPARING', true, 'Preparing security model...');
      } else if (status === 'loading') {
        this._setMicContent('⏳ LOADING', true, 'Loading Whisper model...');
      } else if (status === 'ready') {
        this._setMicContent('🎙️ LISTEN', false, 'Click to speak');
      } else if (status === 'error' || (typeof status === 'string' && status.startsWith('error'))) {
        const title = msg || 'Whisper unavailable — check permissions';
        this._setMicContent('❌ NO MIC', true, title);
        this.onStatus?.(title, 'var(--accent-red)');
      }
    };
  }

  loadSettings() {
    const timeout = this.store?.get('stt-silence-timeout');
    if (timeout) this.stt.setSilenceTimeout(Number(timeout));

    this.stt.onAutoStop = () => {
      this.voiceActive = false;
      this.pttActive = false;
      this.onMicButton?.('🎙️ LISTEN', false);
      this.onStatus?.('Auto-stopped (silence)', 'var(--accent-cyan)');
    };

    this.stt.onWakeWordTriggered = () => {
      this.voiceActive = true;
      this.onMicButton?.('⏹️ STOP', true);
      this.onStatus?.('Wake word detected — recording...', 'var(--accent-red)');
    };

    const wakeEnabled = this.store?.get('wake-word-enabled');
    if (wakeEnabled === 'true' || wakeEnabled === true) {
      this.stt.startWakeWordListener();
    }
  }

  async toggle() {
    if (this.pttActive || this._toggling) return;
    if (!this.stt.modelReady) {
      const msg = this.stt.loadingStatus === 'downloading' || this.stt.loadingStatus === 'loading'
        ? 'Security model is still preparing — please wait...'
        : 'Voice model not available — type your ideas instead';
      this.onStatus?.(msg, 'var(--accent-gold)');
      return;
    }
    this._toggling = true;
    try {
      if (this.voiceActive) {
        this.voiceActive = false;
        this.onMicButton?.('🎙️ LISTEN', false);
        this.onStatus?.('Processing...', 'var(--accent-cyan)');
        await this.stt.stopListening();
      } else {
        this.voiceActive = true;
        this.onMicButton?.('⏹️ STOP', true);
        this.onStatus?.('Recording...', 'var(--accent-red)');
        this.stt.startListening();
      }
    } finally {
      this._toggling = false;
    }
  }

  startPtt() {
    if (this.voiceActive || this.pttActive || !this.stt.modelReady) return false;
    this.pttActive = true;
    this.voiceActive = true;
    this.onMicButton?.('⏹️ STOP', true);
    this.onStatus?.('Recording (PTT)...', 'var(--accent-red)');
    this.stt.startListening();
    return true;
  }

  async stopPtt() {
    if (!this.pttActive) return;
    this.pttActive = false;
    this.voiceActive = false;
    this.onMicButton?.('🎙️ LISTEN', false);
    this.onStatus?.('Processing...', 'var(--accent-cyan)');
    this.stt.stopListening();
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    this._swapping = false;
    this.stt.destroy();
    this.tts.destroy();
    this._stateListeners.clear();
    this._analyserListeners.clear();
    this._lastAnalyser = null;
  }

  // -- Private helpers ---------------------------------------------------------

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
