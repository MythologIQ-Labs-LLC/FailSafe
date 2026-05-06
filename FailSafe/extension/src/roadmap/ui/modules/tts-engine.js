// FailSafe Command Center — Text-to-Speech Engine
// Piper TTS via vendored WASM for neural-quality voice synthesis.

import { isAllowedPiperVoice, isWebSpeechVoice } from './voice-catalog.js';

const PIPER_MODULE = '../vendor/piper/piper.min.js';
const DEFAULT_VOICE_ID = 'en_US-hfc_female-medium';

export class TtsEngine {
  constructor(store) {
    this.store = store || null;
    this.tts = null;
    this.audio = null;
    this.onStateChange = null;
    const stored = store?.get?.('tts-voice');
    this.voiceId = (isAllowedPiperVoice(stored) || isWebSpeechVoice(stored))
      ? stored
      : DEFAULT_VOICE_ID;
    this._blobUrl = null;
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
      const mod = await import(PIPER_MODULE);
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

    try {
      const wav = await this.tts.predict({ text, voiceId: this.voiceId });
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
    if (!this.audio) return;
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
