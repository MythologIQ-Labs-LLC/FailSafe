// FailSafe Command Center — Voice Settings (Multilingual sub-renderer)
// Renders + binds the Whisper model picker, STT language picker, and auto-match
// toggle. Extracted from voice-settings.js to keep the parent module under the
// 250-line cap (per v4.10.1a B127 file-size budget).

import { LANGUAGE_TO_DEFAULT_VOICE, DEFAULT_STT_LANGUAGE } from './voice-catalog.js';
import { escapeHtml } from './brainstorm-templates.js';

const ROW = `display:flex;align-items:center;gap:8px;padding:4px 0`;
const SEL = `flex:1;padding:4px 8px;border-radius:6px;background:var(--bg-mid);border:1px solid var(--border-rim);color:var(--text-main);font-size:0.85rem`;
const DIV = `border-bottom:1px solid var(--border-rim)`;

export const WHISPER_MODELS = [
  { id: 'Xenova/whisper-tiny',  label: 'Tiny — multilingual (39MB)' },
  { id: 'Xenova/whisper-base',  label: 'Base — multilingual (74MB)' },
  { id: 'Xenova/whisper-small', label: 'Small — multilingual (244MB)' },
];

export function renderMultilingualRows(store) {
  const currentModel = store?.get('whisper-model') || 'Xenova/whisper-tiny';
  const currentLang = store?.get('stt-language') || DEFAULT_STT_LANGUAGE;
  const autoMatchVal = store?.get('voice-auto-match');
  const autoMatch = autoMatchVal === 'true' || autoMatchVal === true;
  const modelOpts = WHISPER_MODELS.map(m =>
    `<option value="${escapeHtml(m.id)}"${m.id === currentModel ? ' selected' : ''}>${escapeHtml(m.label)}</option>`
  ).join('');
  const langOpts = Object.keys(LANGUAGE_TO_DEFAULT_VOICE).map(lang =>
    `<option value="${escapeHtml(lang)}"${lang === currentLang ? ' selected' : ''}>${escapeHtml(lang)}</option>`
  ).join('');
  return `
    <div style="${ROW};${DIV}">
      <span style="min-width:120px">Whisper Model:</span>
      <select class="cc-settings-whisper-model" style="${SEL}">${modelOpts}</select>
    </div>
    <div style="${ROW};${DIV}">
      <span style="min-width:120px">Language:</span>
      <select class="cc-settings-stt-language" style="${SEL}">${langOpts}</select>
    </div>
    <div style="${ROW};${DIV}">
      <span style="min-width:120px">Auto-match Voice:</span>
      <label style="display:flex;align-items:center;gap:4px;cursor:pointer">
        <input type="checkbox" class="cc-settings-voice-auto-match"${autoMatch ? ' checked' : ''} />
        <span style="font-size:0.75rem">${autoMatch ? 'On' : 'Off'}</span>
      </label>
    </div>`;
}

export function bindMultilingualRows(container, store, controller) {
  const modelSel = container.querySelector('.cc-settings-whisper-model');
  modelSel?.addEventListener('change', () => {
    store?.set('whisper-model', modelSel.value);
    if (controller?.swapWhisperModel) controller.swapWhisperModel(modelSel.value);
    else window.dispatchEvent(new CustomEvent('failsafe:whisper-model-changed', { detail: { modelId: modelSel.value } }));
  });
  const langSel = container.querySelector('.cc-settings-stt-language');
  langSel?.addEventListener('change', () => {
    if (controller?.setLanguage) controller.setLanguage(langSel.value);
    else {
      store?.set('stt-language', langSel.value);
      window.dispatchEvent(new CustomEvent('failsafe:stt-language-changed', { detail: { language: langSel.value } }));
    }
  });
  const toggle = container.querySelector('.cc-settings-voice-auto-match');
  const label = toggle?.nextElementSibling;
  toggle?.addEventListener('change', () => {
    store?.set('voice-auto-match', toggle.checked);
    if (label) label.textContent = toggle.checked ? 'On' : 'Off';
  });
}
