// FailSafe Command Center — Brainstorm Voice Wiring (FX895, #238 LD5 split)
// Voice-callback wiring relocated verbatim from BrainstormRenderer._wireVoice
// (brainstorm.js:104-117), plus the FX895 onTranscriptError hop so typed STT
// failures reach the Prep Bay recovery UX instead of the transcript path.
// #237 (FX898): consumes probeVoicePack's RETURNED state through the pure
// capability presenter (single channel — the controller no longer emits
// 'voicePackAbsent') and recomputes the LD4 capability summary on probe
// completion AND on every controller state change.

import { VoiceStatusBadge } from './voice-status-badge.js';
import { presentVoicePackState, deriveCapabilitySummary } from './voice-capability-presenter.js';

// TTS-class states on the unified stream (tts-engine.js:38/:43/:51 + LD3).
const TTS_ERROR = /^error:(piper_not_vendored|wrong_mime|init_failed|tts_init_rejected)/;

function deriveTtsState(voice, ttsErrorSeen) {
  if (voice.tts?.tts) return 'ready';
  if (ttsErrorSeen) return 'error';
  return 'unknown';
}

export function wireVoiceCallbacks(renderer) {
  const badgeEl = renderer._getEl('.cc-bs-voice-status');
  if (badgeEl) {
    renderer.voiceStatusBadge = new VoiceStatusBadge(badgeEl, renderer.voice);
    renderer.voiceStatusBadge.attach();
  }
  wireCapabilitySignals(renderer, badgeEl);
  renderer.voice.wireModelProgress();
  renderer.voice.stt.onTranscript = (t, f) => renderer.prepBay.onTranscript(t, f);
  renderer.voice.stt.onTranscriptError = (r) => renderer.prepBay.onTranscriptError(r);
  renderer.voice.stt.onAudioCaptured = (blob) => {
    fetch('/api/v1/brainstorm/audio', { method: 'POST', headers: { 'Content-Type': 'audio/webm' }, body: blob })
      .then(res => { if (!res.ok) renderer.showStatus('Audio save failed', 'var(--accent-red)'); })
      .catch(err => { console.warn('[brainstorm] audio POST failed:', err.message); renderer.showStatus('Audio capture not saved', 'var(--accent-gold)'); });
  };
  renderer.keyboard.onPttStart = () => renderer.voice.startPtt();
  renderer.keyboard.onPttStop = () => renderer.voice.stopPtt();
}

// #237 LD2/LD4: the probe's returned state feeds the badge via the presenter
// (setCapabilityNote(null) no-ops for 'installed'); the capability summary
// routes 'text-only' to showStatus and non-full summaries to the badge title.
function wireCapabilitySignals(renderer, badgeEl) {
  let packState = null; // last probe result; null until the probe resolves
  let ttsErrorSeen = false;
  const recompute = () => {
    const v = renderer.voice;
    const ttsState = deriveTtsState(v, ttsErrorSeen);
    const summary = deriveCapabilitySummary({ sttLoadingStatus: v.stt?.loadingStatus, sttState: v.stt?.state, ttsState, packState });
    // Guard: never flash 'voice off' before the pack probe has resolved.
    if (summary === 'text-only' && packState !== null) renderer.showStatus('voice off — text brainstorming available', 'var(--text-muted)');
    if (badgeEl) badgeEl.title = summary === 'full' ? '' : `voice: ${summary}`;
  };
  renderer.applyVoicePackState = (s) => {
    packState = s;
    renderer.voiceStatusBadge?.setCapabilityNote(presentVoicePackState(s));
    recompute();
  };
  renderer.voice.addStateListener((s) => {
    if (TTS_ERROR.test(String(s))) ttsErrorSeen = true;
    recompute();
  });
  renderer.voice.probeVoicePack?.().then((s) => renderer.applyVoicePackState(s));
}
