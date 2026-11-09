// Mind Map recording management (#465): no implicit upload, rendering of
// server-derived recording IDs are rendered exclusively with textContent.
const AUDIO_ID = /^[0-9a-f]{64}$/;

function appendMessage(panel, text) {
  const line = document.createElement('p');
  line.textContent = text;
  panel.appendChild(line);
}

function recordingRow(renderer, item, reload) {
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;gap:8px;justify-content:space-between;padding:5px 0;';
  const detail = document.createElement('span');
  detail.textContent = `${item.id.slice(0, 12)}… | ${Number(item.bytes) || 0} bytes | ${String(item.modifiedAt || '')}`;
  detail.title = item.id;
  const remove = document.createElement('button');
  remove.className = 'cc-btn';
  remove.type = 'button';
  remove.textContent = 'DELETE';
  remove.setAttribute('aria-label', `Delete saved recording ${item.id.slice(0, 12)}`);
  remove.addEventListener('click', () => deleteRecording(renderer, item.id, remove, reload));
  row.append(detail, remove);
  return row;
}

async function deleteRecording(renderer, id, remove, reload) {
  remove.disabled = true;
  try {
    // Every deletion opens a separate native VS Code confirmation.
    const res = await fetch(`/api/v1/brainstorm/audio/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Not deleted. Review the VS Code confirmation and retry.');
    await reload();
  } catch {
    remove.disabled = false;
    renderer.showStatus('Recording was not deleted', 'var(--accent-red)');
  }
}

function renderRecordings(renderer, panel, data, reload) {
  panel.replaceChildren();
  const records = Array.isArray(data.recordings) ? data.recordings : [];
  if (records.length === 0) { appendMessage(panel, 'No saved recordings in this workspace.'); return; }
  for (const item of records) {
    if (typeof item.id !== 'string' || !AUDIO_ID.test(item.id)) continue;
    panel.appendChild(recordingRow(renderer, item, reload));
  }
  if (data.limited === true) appendMessage(panel, 'Showing up to 100 recordings. Delete items and refresh to see more.');
}

export function wireSavedAudioManager(renderer) {
  const button = renderer._getEl('.cc-bs-audio-manage');
  const panel = renderer._getEl('.cc-bs-audio-recordings');
  if (!button || !panel) return;

  const reload = async () => {
    panel.replaceChildren();
    appendMessage(panel, 'Loading saved recordings…');
    try {
      const response = await fetch('/api/v1/brainstorm/audio', { cache: 'no-store' });
      if (!response.ok) throw new Error('Audio inventory unavailable');
      renderRecordings(renderer, panel, await response.json(), reload);
    } catch {
      panel.replaceChildren();
      appendMessage(panel, 'Saved recordings could not be loaded.');
    }
  };

  renderer.reloadSavedAudio = async () => {
    if (!panel.hidden) await reload();
  };
  button.addEventListener('click', async () => {
    panel.hidden = !panel.hidden;
    button.setAttribute('aria-expanded', String(!panel.hidden));
    if (!panel.hidden) await reload();
  });
}
