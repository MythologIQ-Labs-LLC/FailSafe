// FailSafe Command Center — Wake Word Listener
// Detects wake phrase via Web Speech API to trigger recording.

import { getSpeechRecognitionCtor } from './whisper-loader.js';

export class WakeWordListener {
  constructor(store) {
    this.store = store;
    this.enabled = false;
    this.phrase = 'hey failsafe';
    this._recognition = null;
    this._retries = 0;
    this._onError = null;

    const saved = store?.get('wake-word-enabled');
    if (saved === 'true' || saved === true) this.enabled = true;
    const savedPhrase = store?.get('wake-word-phrase');
    if (savedPhrase) this.phrase = savedPhrase.toLowerCase();
  }

  setEnabled(enabled) {
    this.enabled = !!enabled;
    this.store?.set('wake-word-enabled', this.enabled);
    if (!enabled) this.stop();
  }

  setPhrase(phrase) {
    this.phrase = (phrase || 'hey failsafe').toLowerCase();
    this.store?.set('wake-word-phrase', this.phrase);
  }

  start(onTriggered, onError, getState) {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      onError?.('Voice activation unavailable in this environment');
      return false;
    }
    if (this._recognition) return true;
    this._recognition = new Ctor();
    this._recognition.continuous = true;
    this._recognition.interimResults = true;
    this._onError = onError;

    this._recognition.addEventListener('result', (e) => {
      for (let i = 0; i < e.results.length; i++) {
        const transcript = e.results[i][0].transcript.toLowerCase();
        if (transcript.includes(this.phrase)) {
          this.stop();
          onTriggered?.();
          return;
        }
      }
    });

    this._recognition.addEventListener('end', () => {
      if (this.enabled && getState?.() === 'idle' && this._recognition) {
        try { this._recognition.start(); } catch { /* already started */ }
      }
    });

    this._recognition.addEventListener('error', (ev) => {
      const permanent = ['not-allowed', 'service-not-available', 'language-not-supported'];
      if (permanent.includes(ev.error)) {
        this._onError?.('permanent', `Wake word unavailable: ${ev.error}`);
        return;
      }
      this._retries += 1;
      if (this._retries > 5) {
        this._onError?.('error', 'Wake word stopped after 5 failures');
        return;
      }
      if (this.enabled && getState?.() === 'idle') {
        const delay = Math.min(1000 * Math.pow(2, this._retries - 1), 30000);
        globalThis.setTimeout(() => this.start(onTriggered, onError, getState), delay);
      }
    });

    try { this._recognition.start(); } catch { /* already started */ }
    return true;
  }

  stop() {
    if (!this._recognition) return;
    try { this._recognition.stop(); } catch { /* already stopped */ }
    this._recognition = null;
  }

  destroy() {
    this.stop();
  }
}
