// FailSafe Command Center — Voice Settings Renderer
// Organized: Audio Hardware, Speech Input, Speech Output, Controls.

import { renderMultilingualRows, bindMultilingualRows } from './voice-settings-multilingual.js';
import { escapeHtml } from './brainstorm-templates.js';

const SL = `font-size:0.65rem;color:var(--accent-cyan);text-transform:uppercase;letter-spacing:0.06em;padding:6px 0 2px;margin-top:4px`;
const ROW = `display:flex;align-items:center;gap:8px;padding:4px 0`;
const SEL = `flex:1;padding:4px 8px;border-radius:6px;background:var(--bg-mid);border:1px solid var(--border-rim);color:var(--text-main);font-size:0.85rem`;
const DIV = `border-bottom:1px solid var(--border-rim)`;

export function renderVoiceSettings(store) {
  return `
    <div class="cc-card" style="margin-top:16px">
      <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;
        letter-spacing:0.08em;margin-bottom:12px">Voice &amp; Audio <span class="beta-badge">Beta</span></div>
      <div style="font-size:0.85rem;display:flex;flex-direction:column;gap:4px">
        ${renderAudioHardware(store)}
        ${renderSpeechInput(store)}
        ${renderSpeechOutput(store)}
        ${renderControls(store)}
      </div>
    </div>`;
}

function renderAudioHardware(store) {
  const savedMic = store?.get('audio-input-device') || '';
  const savedSpk = store?.get('audio-output-device') || '';
  return `
    <div style="${SL}">Audio Hardware</div>
    <div style="${ROW};${DIV}">
      <span style="min-width:120px">Microphone:</span>
      <select class="cc-settings-mic-device" data-saved="${escapeHtml(savedMic)}" style="${SEL}">
        <option value="">System Default</option>
      </select>
    </div>
    <div style="${ROW};${DIV}">
      <span style="min-width:120px">Speaker:</span>
      <select class="cc-settings-spk-device" data-saved="${escapeHtml(savedSpk)}" style="${SEL}">
        <option value="">System Default</option>
      </select>
    </div>`;
}

function renderSpeechInput(store) {
  const wakeVal = store?.get('wake-word-enabled');
  const wakeEnabled = wakeVal === 'true' || wakeVal === true;
  const wakePhrase = store?.get('wake-word-phrase') || 'Hey FailSafe';
  const timeout = Number(store?.get('stt-silence-timeout') || 5000);
  const timeoutSec = Math.round(timeout / 1000);
  return `
    <div style="${SL}">Speech Input</div>
    <div style="${ROW};${DIV}">
      <span style="min-width:120px">STT Engine:</span>
      <span style="color:var(--text-main)">Whisper (local)</span>
      <span class="cc-settings-whisper-model-status" style="font-size:0.75rem;color:var(--text-muted)"></span>
    </div>
    ${renderMultilingualRows(store)}
    <div style="${ROW};${DIV}">
      <span style="min-width:120px">Wake Word:</span>
      <label style="display:flex;align-items:center;gap:4px;cursor:pointer">
        <input type="checkbox" class="cc-settings-wake-toggle"${wakeEnabled ? ' checked' : ''} />
        <span style="font-size:0.75rem">${wakeEnabled ? 'On' : 'Off'}</span>
      </label>
      <input type="text" class="cc-settings-wake-phrase" value="${escapeHtml(wakePhrase)}"
        placeholder="Hey FailSafe" maxlength="60"
        style="${SEL}" />
    </div>
    <div style="${ROW};${DIV}">
      <span style="min-width:120px">Silence Timeout:</span>
      <input type="range" class="cc-settings-silence-range" min="1" max="15" value="${timeoutSec}" style="flex:1" />
      <span class="cc-settings-silence-value" style="min-width:30px;text-align:right;font-size:0.85rem">${timeoutSec}s</span>
    </div>`;
}

function renderSpeechOutput(store) {
  const currentVoice = store?.get('tts-voice') || 'en_US-hfc_female-medium';
  const voices = [
    { id: 'en_US-hfc_female-medium', label: 'Female (US) — Medium' },
    { id: 'en_US-hfc_male-medium', label: 'Male (US) — Medium' },
    { id: 'en_US-lessac-medium', label: 'Lessac (US) — Medium' },
    { id: 'en_US-lessac-high', label: 'Lessac (US) — High' },
    { id: 'en_US-ljspeech-medium', label: 'LJSpeech (US) — Medium' },
    { id: 'en_US-ljspeech-high', label: 'LJSpeech (US) — High' },
    { id: 'en_US-amy-medium', label: 'Amy (US) — Medium' },
    { id: 'en_GB-alba-medium', label: 'Alba (GB) — Medium' },
    { id: 'en_GB-jenny_dioco-medium', label: 'Jenny (GB) — Medium' },
    { id: 'en_GB-cori-medium', label: 'Cori (GB) — Medium' },
  ];
  const piperOpts = voices.map(v =>
    `<option value="${escapeHtml(v.id)}"${v.id === currentVoice ? ' selected' : ''}>${escapeHtml(v.label)}</option>`
  ).join('');
  const webVoices = getWebSpeechVoices();
  const webOpts = webVoices.map(v =>
    `<option value="web:${escapeHtml(v.name)}"${'web:' + v.name === currentVoice ? ' selected' : ''}>${escapeHtml(v.name)} (Browser)</option>`
  ).join('');
  const separator = webOpts ? '<option disabled>── Browser Voices ──</option>' : '';
  return `
    <div style="${SL}">Speech Output</div>
    <div style="${ROW};${DIV}">
      <span style="min-width:120px">TTS Voice:</span>
      <select class="cc-settings-tts-voice" style="${SEL}">
        ${piperOpts}${separator}${webOpts}
      </select>
      <span class="cc-settings-tts-status" style="font-size:0.75rem;color:var(--text-muted)"></span>
    </div>`;
}

function getWebSpeechVoices() {
  if (typeof speechSynthesis === 'undefined') return [];
  const voices = speechSynthesis.getVoices();
  return voices.length ? voices.filter(v => v.lang.startsWith('en')) : [];
}

function renderControls(store) {
  const pttKey = store?.get('ptt-key') || 'Space';
  return `
    <div style="${SL}">Controls</div>
    <div style="${ROW}">
      <span style="min-width:120px">Push-to-Talk Key:</span>
      <code class="cc-settings-ptt-display" style="padding:2px 10px;border-radius:4px;
        background:var(--bg-deep);border:1px solid var(--border-rim);font-size:0.85rem">${pttKey}</code>
      <button class="cc-btn cc-settings-ptt-record" style="font-size:0.75rem">Record New Key</button>
    </div>`;
}

export async function bindVoiceSettings(container, store, controller) {
  await bindAudioDevices(container, store);
  checkWhisperModel(container.querySelector('.cc-settings-whisper-model-status'));
  bindTtsVoice(container, store);
  bindPttRecorder(container, store);
  bindWakeWord(container, store);
  bindSilenceSlider(container, store);
  bindMultilingualRows(container, store, controller);
}

async function bindAudioDevices(container, store) {
  const micSel = container.querySelector('.cc-settings-mic-device');
  const spkSel = container.querySelector('.cc-settings-spk-device');
  if (!micSel && !spkSel) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(t => t.stop());
    const devices = await navigator.mediaDevices.enumerateDevices();
    const savedMic = micSel?.dataset.saved || '';
    const savedSpk = spkSel?.dataset.saved || '';
    populateDeviceSelect(micSel, devices.filter(d => d.kind === 'audioinput'), savedMic, 'Microphone');
    populateDeviceSelect(spkSel, devices.filter(d => d.kind === 'audiooutput'), savedSpk, 'Speaker');
  } catch { /* no permission or no devices */ }
  micSel?.addEventListener('change', () => {
    store?.set('audio-input-device', micSel.value);
    window.dispatchEvent(new CustomEvent('failsafe:audio-device-changed', { detail: { type: 'input', deviceId: micSel.value } }));
  });
  spkSel?.addEventListener('change', () => {
    store?.set('audio-output-device', spkSel.value);
    window.dispatchEvent(new CustomEvent('failsafe:audio-device-changed', { detail: { type: 'output', deviceId: spkSel.value } }));
  });
}

function populateDeviceSelect(select, devices, savedId, fallbackLabel) {
  if (!select) return;
  devices.forEach(d => {
    const opt = document.createElement('option');
    opt.value = d.deviceId;
    opt.textContent = d.label || `${fallbackLabel} ${d.deviceId.slice(0, 8)}`;
    if (d.deviceId === savedId) opt.selected = true;
    select.appendChild(opt);
  });
}

function bindTtsVoice(container, store) {
  const select = container.querySelector('.cc-settings-tts-voice');
  const status = container.querySelector('.cc-settings-tts-status');
  checkPiperAvailable(status);
  select?.addEventListener('change', () => store?.set('tts-voice', select.value));
}

async function checkPiperAvailable(statusEl) {
  if (!statusEl) return;
  statusEl.textContent = 'Ready';
}

function bindPttRecorder(container, store) {
  const pttDisplay = container.querySelector('.cc-settings-ptt-display');
  const pttRecordBtn = container.querySelector('.cc-settings-ptt-record');
  pttRecordBtn?.addEventListener('click', () => {
    pttRecordBtn.textContent = 'Press a key...';
    pttRecordBtn.disabled = true;
    const handler = (e) => {
      e.preventDefault(); e.stopPropagation();
      document.removeEventListener('keydown', handler, true);
      pttDisplay.textContent = e.code;
      pttRecordBtn.textContent = 'Record New Key';
      pttRecordBtn.disabled = false;
      store?.set('ptt-key', e.code);
    };
    document.addEventListener('keydown', handler, true);
  });
}

function bindWakeWord(container, store) {
  const wakeToggle = container.querySelector('.cc-settings-wake-toggle');
  const wakeLabel = wakeToggle?.nextElementSibling;
  const wakePhrase = container.querySelector('.cc-settings-wake-phrase');
  wakeToggle?.addEventListener('change', () => {
    const enabled = wakeToggle.checked;
    store?.set('wake-word-enabled', enabled);
    if (wakeLabel) wakeLabel.textContent = enabled ? 'On' : 'Off';
    window.dispatchEvent(new CustomEvent('failsafe:wake-word-changed', { detail: { enabled } }));
  });
  window.addEventListener('failsafe:wake-word-changed', (e) => {
    if (wakeToggle && wakeToggle.checked !== e.detail.enabled) {
      wakeToggle.checked = e.detail.enabled;
      if (wakeLabel) wakeLabel.textContent = e.detail.enabled ? 'On' : 'Off';
    }
  });
  let phraseTimer = null;
  wakePhrase?.addEventListener('input', () => {
    clearTimeout(phraseTimer);
    phraseTimer = setTimeout(() => {
      store?.set('wake-word-phrase', wakePhrase.value.trim().toLowerCase());
    }, 500);
  });
}

function bindSilenceSlider(container, store) {
  const silenceRange = container.querySelector('.cc-settings-silence-range');
  const silenceValue = container.querySelector('.cc-settings-silence-value');
  silenceRange?.addEventListener('input', () => {
    const sec = Number(silenceRange.value);
    silenceValue.textContent = `${sec}s`;
    store?.set('stt-silence-timeout', sec * 1000);
  });
}

async function checkWhisperModel(statusEl) {
  if (!statusEl) return;
  statusEl.textContent = 'Ready';
}
