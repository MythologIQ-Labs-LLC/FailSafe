// Bicameral MCP Settings card — status display + autoConnect toggle.
// Extracted from settings.js to keep that file under the Section 4 razor limit.
// Read-mostly UI: hits the same /api/integrations/bicameral/status route the
// Integrations tab uses, plus a single POST for the autoConnect toggle.

import { escapeHtml } from './brainstorm-templates.js';

const LBL = 'font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.08em';
const STATE_LABEL = {
  'unknown': 'Unknown',
  'not-installed': 'Not installed',
  'installed-not-configured': 'Installed (not configured)',
  'configured-not-running': 'Configured',
  'running': 'Connected',
};

/**
 * Render the Bicameral settings card into the supplied slot element.
 * Removes the slot when the status endpoint is unavailable (e.g., extension
 * built without bicameral integration). `bindOnce` matches the same idempotent
 * binding helper settings.js uses elsewhere.
 */
export async function renderBicameralSettingsCard(slot, { bindOnce }) {
  if (!slot) return;
  let status;
  try {
    const res = await fetch('/api/integrations/bicameral/status');
    if (!res.ok) { slot.remove(); return; }
    status = await res.json();
  } catch {
    slot.remove();
    return;
  }
  const stateLabel = STATE_LABEL[status.state || 'unknown'] || 'Unknown';
  const versionLine = status.version
    ? `<div style="padding:4px 0;border-bottom:1px solid var(--border-rim)">Version: <strong>${escapeHtml(status.version)}</strong></div>`
    : '';
  const autoConnect = status.autoConnect === true;
  slot.innerHTML = `
    <div style="${LBL};margin-bottom:8px">Bicameral MCP</div>
    <div style="font-size:0.85rem;margin-bottom:10px">
      <div style="padding:4px 0;border-bottom:1px solid var(--border-rim)">Status: <strong>${escapeHtml(stateLabel)}</strong></div>
      ${versionLine}
    </div>
    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:0.85rem;margin-bottom:10px">
      <input type="checkbox" class="cc-bicameral-autoconnect" ${autoConnect ? 'checked' : ''} />
      <span>Auto-connect at activation when configured</span>
    </label>
    <button class="cc-btn" data-action="bicameral-open-integrations" style="font-size:0.8rem;padding:6px 12px">Re-install / Re-setup…</button>`;
  bindOnce(slot.querySelector('.cc-bicameral-autoconnect'), 'change', (e) => toggleAutoConnect(e.target));
  bindOnce(slot.querySelector('[data-action="bicameral-open-integrations"]'), 'click', () => {
    const tab = document.querySelector('[data-cc-tab="integrations"]');
    if (tab) tab.click();
  });
}

async function toggleAutoConnect(checkbox) {
  try {
    const r = await fetch('/api/integrations/bicameral/auto-connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: checkbox.checked }),
    });
    if (!r.ok) throw new Error(`${r.status}`);
  } catch {
    checkbox.checked = !checkbox.checked;
  }
}
