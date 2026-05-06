// FailSafe Command Center — Voice Catalog
// Static BCP-47 language → Piper voice ID map used by voice-controller.setLanguage
// when auto-match-voice is enabled. Bundled at build time; no runtime fetch.
// Source plan: v4.10.1a (B127). The ja-JP entry uses a placeholder voice id
// pending curation of a Japanese Piper model.

export const DEFAULT_STT_LANGUAGE = 'en-US';

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
