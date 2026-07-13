// FailSafe Command Center — Voice Capability Presenter (#237, FX898)
// Pure signal → presentation mappers. Kills the single-branch NO-MIC
// conflation: mic-absent ≠ permission-denied ≠ generic voice error. No DOM,
// no fetch, no state — every export is a pure function so the at-cap
// voice-controller.js keeps only a thin delegate (plan LD1/LD4).

// Approximate download sizes keyed by the 3 ALLOWED whisper ids
// (voice-catalog.js:13-17) — the storage-impact criterion for downloads.
export const WHISPER_MODEL_SIZES = {
  'Xenova/whisper-tiny': '~41 MB',
  'Xenova/whisper-base': '~74 MB',
  'Xenova/whisper-small': '~244 MB',
};

const RED = 'var(--accent-red)';
const GOLD = 'var(--accent-gold)';

/** Map an stt onModelProgress signal to the mic-button presentation tuple
 *  { micHtml, disabled, title, statusMsg, statusColor }. Returns null for
 *  statuses the UI does not present (parity: those were no-ops before). */
export function presentModelProgress(status, msg, modelId) {
  if (status === 'downloading') {
    const size = WHISPER_MODEL_SIZES[modelId];
    const title = size ? `Preparing security model (${size} download)...` : 'Preparing security model...';
    return { micHtml: '🎙️ PREPARING', disabled: true, title, statusMsg: null, statusColor: null };
  }
  if (status === 'loading') {
    return { micHtml: '⏳ LOADING', disabled: true, title: 'Loading Whisper model...', statusMsg: null, statusColor: null };
  }
  if (status === 'ready') {
    return { micHtml: '🎙️ LISTEN', disabled: false, title: 'Click to speak', statusMsg: null, statusColor: null };
  }
  if (status === 'error' || (typeof status === 'string' && status.startsWith('error'))) {
    return presentModelError(status, msg);
  }
  return null;
}

// Error-class differentiation (LD4): denied ≠ mic-absent ≠ everything else.
function presentModelError(status, msg) {
  if (status === 'error:mic_unavailable') {
    return asError('❌ NO MIC', 'Whisper unavailable — check permissions');
  }
  if (typeof msg === 'string' && msg.includes('denied')) {
    return asError('🚫 MIC BLOCKED', `${msg} — grant microphone permission to use voice`);
  }
  if (typeof msg === 'string' && msg.includes('No microphone')) {
    return asError('❌ NO MIC', msg);
  }
  const detail = (typeof msg === 'string' && msg) || status.split(':').slice(1).join(':') || 'unknown';
  return asError('⚠️ VOICE ERROR', `Voice error: ${detail}`);
}

function asError(micHtml, title) {
  return { micHtml, disabled: true, title, statusMsg: title, statusColor: RED };
}

/** Pack-state → badge capability note. 'installed' returns null so the badge
 *  setCapabilityNote(null) no-ops; every non-installed state POINTS at the
 *  existing Settings › Voice Pack flow (no duplicate installer UI). */
export function presentVoicePackState(state) {
  if (state === 'installed') return null;
  if (state === 'stale') {
    return { text: 'Voice pack update available — update in Settings', color: GOLD, title: 'A newer voice pack is available. Settings › Voice Pack › Update.' };
  }
  if (state === 'corrupt') {
    return { text: 'Voice pack corrupt — reinstall in Settings', color: RED, title: 'Voice pack failed verification. Settings › Voice Pack › Install to repair.' };
  }
  return { text: 'Voice pack not installed — install in Settings', color: GOLD, title: 'Install the voice pack (Settings › Voice Pack) to enable TTS playback + Whisper STT.' };
}

/** Capability summary: 'full' | 'stt-only' | 'tts-only' | 'text-only'.
 *  Missing TTS never disables STT and vice versa; a non-installed pack gates
 *  TTS (Piper is pack-vendored) but never STT (Whisper models are fetched
 *  independently). ttsState 'unknown' (init pending or silently absent)
 *  counts as not-ready — pinned by its own test case. */
export function deriveCapabilitySummary({ sttLoadingStatus, sttState, ttsState, packState }) {
  const sttErr = typeof sttState === 'string' && sttState.startsWith('error');
  const sttOk = sttLoadingStatus === 'ready' && !sttErr;
  const ttsOk = ttsState === 'ready' && packState === 'installed';
  if (sttOk && ttsOk) return 'full';
  if (sttOk) return 'stt-only';
  if (ttsOk) return 'tts-only';
  return 'text-only';
}

/** Copyable diagnostics — EXACTLY these allow-listed keys, populated from the
 *  provided deps. Never a transcript, audio buffer, URL, or token: unknown
 *  keys in deps are dropped by construction (assert-listed, plan LD4). */
export function buildVoiceDiagnostics(deps = {}) {
  return {
    micDeviceLabel: deps.micDeviceLabel ?? null,
    whisperModelId: deps.whisperModelId ?? null,
    sttLoadingStatus: deps.sttLoadingStatus ?? null,
    language: deps.language ?? null,
    ttsVoice: deps.ttsVoice ?? null,
    packState: deps.packState ?? null,
    packVersion: deps.packVersion ?? null,
    lastFailure: deps.lastFailure ?? null,
  };
}
