// FailSafe Command Center — Voice Catalog
// Static BCP-47 language → Piper voice ID map used by voice-controller.setLanguage
// when auto-match-voice is enabled. Bundled at build time; no runtime fetch.
// Source plan: v4.10.1a (B127). The ja-JP entry uses a placeholder voice id
// pending curation of a Japanese Piper model.

export const DEFAULT_STT_LANGUAGE = 'en-US';

// Whisper model allowlist — the 3 multilingual variants the extension ships and
// validates against. Per qor-debug D-5: any localStorage XSS could pivot to
// arbitrary HuggingFace model load via swapWhisperModel; allowlist closes the
// supply-chain pivot.
export const ALLOWED_WHISPER_MODELS = new Set([
  'Xenova/whisper-tiny',
  'Xenova/whisper-base',
  'Xenova/whisper-small',
]);

// Piper voice allowlist — symmetrical to ALLOWED_WHISPER_MODELS (R-9). The 10
// catalog voices the extension ships, plus the auto-match defaults from
// LANGUAGE_TO_DEFAULT_VOICE. `web:*` prefixed ids route to the browser's Web
// Speech API instead of Piper and are validated separately at use time.
export const ALLOWED_PIPER_VOICES = new Set([
  'en_US-hfc_female-medium',
  'en_US-hfc_male-medium',
  'en_US-lessac-medium',
  'en_US-lessac-high',
  'en_US-ljspeech-medium',
  'en_US-ljspeech-high',
  'en_US-amy-medium',
  'en_GB-alba-medium',
  'en_GB-jenny_dioco-medium',
  'en_GB-cori-medium',
  'fr_FR-siwis-medium',
  'de_DE-thorsten-medium',
  'es_ES-davefx-medium',
  'it_IT-riccardo-x_low',
  'nl_NL-mls-medium',
  'pt_BR-faber-medium',
  'pl_PL-mc_speech-medium',
  'sv_SE-nst-medium',
  'ja_JP-placeholder-medium',
  'zh_CN-huayan-medium',
]);

export function isWebSpeechVoice(id) {
  return typeof id === 'string' && id.startsWith('web:');
}

export function isAllowedPiperVoice(id) {
  return ALLOWED_PIPER_VOICES.has(id);
}

export const LANGUAGE_TO_DEFAULT_VOICE = {
  'en-US': 'en_US-hfc_female-medium',
  'en-GB': 'en_GB-alba-medium',
  'fr-FR': 'fr_FR-siwis-medium',
  'de-DE': 'de_DE-thorsten-medium',
  'es-ES': 'es_ES-davefx-medium',
  'it-IT': 'it_IT-riccardo-x_low',
  'nl-NL': 'nl_NL-mls-medium',
  'pt-BR': 'pt_BR-faber-medium',
  'pl-PL': 'pl_PL-mc_speech-medium',
  'sv-SE': 'sv_SE-nst-medium',
  'ja-JP': 'ja_JP-placeholder-medium', // placeholder pending curated Piper model
  'zh-CN': 'zh_CN-huayan-medium',
};
