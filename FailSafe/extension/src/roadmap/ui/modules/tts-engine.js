// FailSafe Command Center — Text-to-Speech Engine
// Piper TTS via vendored WASM for neural-quality voice synthesis.

import { isAllowedPiperVoice, isWebSpeechVoice } from './voice-catalog.js';

const PIPER_MODULE = '../vendor/piper/piper.min.js';
const DEFAULT_VOICE_ID = 'en_US-hfc_female-medium';

// #244 Tranche D follow-up: unlike WebLlmEngine's tiered extraction, TTS has
// no lower fallback tier — Piper is the only synthesis path. A stalled
// `tts.predict(...)` call therefore cannot be allowed to hang indefinitely;
// TTS_TIMEOUT_MS bounds it so the operator gets an honest error state instead
// of a silently stuck "nothing is happening" UI. This does not (and cannot)
// prove the underlying WASM call itself stopped running.
const TTS_TIMEOUT_MS = 15000;

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`tts predict() timed out after ${ms}ms`);
      err.isTtsTimeout = true;
      reject(err);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export class TtsEngine {
  constructor(store, options = {}) {
    this.store = store || null;
    this.tts = null;
    this.audio = null;
    this.onStateChange = null;
    const stored = store?.get?.('tts-voice');
    this.voiceId = (isAllowedPiperVoice(stored) || isWebSpeechVoice(stored))
      ? stored
      : DEFAULT_VOICE_ID;
    this._blobUrl = null;
    // #244 Tranche D: per-instance override point for tests; production default is TTS_TIMEOUT_MS.
    this.timeoutMs = TTS_TIMEOUT_MS;
    // Generation token: speak()/stop() bump this so a predict() call left
    // running past a cancel/superseding speak() can't resurrect stale audio
    // or state when it eventually settles.
    this._speakToken = 0;
    this._synthesizing = false;
    // E6 Piper module loader injection seam: production omits options;
    // default loader uses native dynamic import. Tests inject a stub
    // loader returning a minimal PiperTTS surface so the dynamic import
    // doesn't load real Piper (which causes the 2000ms async-timeout
    // flake observed at META_LEDGER #310 / #313 push hooks).
    this._loadPiperModule = options.loadPiperModule || (() => import(PIPER_MODULE));
  }

  async init(voiceId) {
    if (voiceId && (isAllowedPiperVoice(voiceId) || isWebSpeechVoice(voiceId))) {
      this.voiceId = voiceId;
    } else if (this.store) {
      const saved = this.store.get('tts-voice');
      if (isAllowedPiperVoice(saved) || isWebSpeechVoice(saved)) this.voiceId = saved;
    }
    try {
      const check = await fetch(PIPER_MODULE, { method: 'HEAD' });
      if (!check.ok) {
        this.onStateChange?.('error:piper_not_vendored');
        return;
      }
      const ct = (check.headers.get('content-type') || '').toLowerCase();
      if (!ct.includes('javascript') && !ct.includes('application/octet-stream')) {
        this.onStateChange?.('error:wrong_mime');
        return;
      }
      const mod = await this._loadPiperModule();
      this.tts = new mod.PiperTTS({ voiceId: this.voiceId });
      await this.tts.init();
    } catch (err) {
      this.tts = null;
      this.onStateChange?.(`error:init_failed:${err?.message || 'unknown'}`);
    }
  }

  async speak(text) {
    if (!this.tts) return;
    this.stop();
    const token = ++this._speakToken;
    this._synthesizing = true;

    let wav;
    try {
      wav = await withTimeout(this.tts.predict({ text, voiceId: this.voiceId }), this.timeoutMs);
    } catch (err) {
      // A superseded attempt must not touch _synthesizing here: a newer
      // speak() may already be mid-flight and legitimately holds it true.
      if (token !== this._speakToken) return; // superseded by a later stop()/speak(); already handled
      this._synthesizing = false;
      this._cleanup();
      this.onStateChange?.(err?.isTtsTimeout ? 'error:tts_timeout' : 'idle');
      return;
    }
    if (token !== this._speakToken) return; // superseded while predict() was in flight; discard stale audio
    this._synthesizing = false;

    try {
      const blob = new Blob([wav], { type: 'audio/wav' });
      this._blobUrl = URL.createObjectURL(blob);
      this.audio = new Audio(this._blobUrl);

      this.audio.addEventListener('play', () => {
        this.onStateChange?.('speaking');
      });
      this.audio.addEventListener('ended', () => {
        this._cleanup();
        this.onStateChange?.('idle');
      });
      this.audio.addEventListener('error', () => {
        this._cleanup();
        this.onStateChange?.('idle');
      });

      await this.audio.play();
    } catch {
      this._cleanup();
      this.onStateChange?.('idle');
    }
  }

  stop() {
    const wasSynthesizing = this._synthesizing;
    this._speakToken++; // invalidate any in-flight predict()/timeout race
    this._synthesizing = false;
    if (!this.audio) {
      // A speak() may still be waiting on predict()/the timeout race with no
      // Audio created yet. Emit 'idle' at this engine's own state channel so
      // any direct subscriber sees the cancellation rather than silence.
      // NOTE: this is not yet operator-visible end-to-end — VoiceController's
      // _wireStateEmit() only forwards a tts 'idle' once its unified state has
      // already reached 'speaking', which never happens during a pending-
      // synthesis cancel (that transition only fires after audio.play()).
      // Closing that gap is a separate, unbuilt affordance, not this fix.
      if (wasSynthesizing) this.onStateChange?.('idle');
      return;
    }
    this.audio.pause();
    this._cleanup();
    this.onStateChange?.('idle');
  }

  destroy() {
    this.stop();
    if (this.tts?.dispose) {
      try { this.tts.dispose(); } catch { /* best-effort */ }
    }
    this.tts = null;
  }

  _cleanup() {
    if (this._blobUrl) {
      URL.revokeObjectURL(this._blobUrl);
      this._blobUrl = null;
    }
    this.audio = null;
  }
}
