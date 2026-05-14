// Phase 4 — Preview Changes button + diff renderer for the install modal.
// POSTs { hosts, scope, skillFilter } to /api/actions/scaffold-skills/preview
// and renders per-host wouldWrite collapsibles inside the modal body.

import { collectSkillFilter } from './install-skills-picker.js';

function esc(value) {
  if (value === null || value === undefined) return '';
  const d = document.createElement('div');
  d.textContent = String(value);
  return d.innerHTML;
}

export function renderPreviewButton(running) {
  const disabled = running ? 'disabled' : '';
  return `<button class="cc-btn cc-modal-preview" data-action="preview" ${disabled}
    style="font-size:0.8rem;padding:6px 14px">Preview Changes</button>`;
}

function readSelectedHosts(modal) {
  const boxes = modal.querySelectorAll('.cc-modal-host:checked');
  return [...boxes].map((cb) => cb.value);
}

function readScope(modal) {
  const radio = modal.querySelector('input[name="cc-modal-scope"]:checked');
  return radio?.value || 'repo';
}

function readSkillFilter(modal) {
  // collectSkillFilter is an ES module export from install-skills-picker.js;
  // it returns Record<host, string[]>. Empty object means "install all".
  try {
    const out = collectSkillFilter(modal);
    return (out && typeof out === 'object' && !Array.isArray(out)) ? out : undefined;
  } catch {
    return undefined;
  }
}

function inferDestLabel(entries) {
  if (!entries || entries.length === 0) return '';
  const first = entries[0].path || '';
  const m = first.match(/(\.[a-z][a-z0-9_-]*(?:[\\/][a-z]+)?)/i);
  return m ? m[1].replace(/\\/g, '/') : '';
}

function renderFileList(entries) {
  const items = entries.map((e) => `<li style="font-family:monospace;font-size:0.75rem">${esc(e.path)}</li>`);
  return `<ul style="margin:4px 0 0 16px;padding:0;list-style:none">${items.join('')}</ul>`;
}

function renderHostBlock(host, payload) {
  if (payload?.degraded) {
    return `<div class="cc-preview-host" data-host="${esc(host)}" style="margin:6px 0">
      <strong>${esc(host)}</strong>:
      <em style="color:var(--text-muted)">Preview not supported by this qor-logic version</em>
    </div>`;
  }
  const writes = Array.isArray(payload?.wouldWrite) ? payload.wouldWrite : [];
  const dest = inferDestLabel(writes);
  return `<details class="cc-preview-host" data-host="${esc(host)}" style="margin:6px 0">
    <summary style="cursor:pointer">+ ${writes.length} file${writes.length === 1 ? '' : 's'}
      would be written to <code>${esc(dest)}</code></summary>
    ${renderFileList(writes)}
  </details>`;
}

function findBody(container) {
  return container.querySelector('.cc-modal-body')
    || container.querySelector('.cc-modal-progress')
    || container;
}

function renderPreviewInto(container, byHost) {
  const body = findBody(container);
  let pane = body.querySelector('.cc-preview-pane');
  if (!pane) {
    pane = document.createElement('div');
    pane.className = 'cc-preview-pane';
    pane.style.cssText = 'max-height:240px;overflow-y:auto;border-top:1px solid var(--border);padding:8px;margin-top:8px';
    body.appendChild(pane);
  }
  const hosts = Object.keys(byHost || {});
  if (hosts.length === 0) {
    pane.innerHTML = '<em style="color:var(--text-muted)">No hosts selected.</em>';
    return;
  }
  pane.innerHTML = hosts.map((h) => renderHostBlock(h, byHost[h])).join('');
}

function anyDegraded(byHost) {
  const vals = Object.values(byHost || {});
  return vals.some((v) => v && v.degraded === true);
}

async function postPreview(payload) {
  const res = await fetch('/api/actions/scaffold-skills/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function applyDegradedState(btn, byHost) {
  if (!btn) return;
  if (anyDegraded(byHost)) {
    btn.title = 'Preview not supported by some hosts';
  } else {
    btn.removeAttribute('title');
  }
}

async function handlePreviewClick(container, btn, setStatus) {
  const modal = container.querySelector('.cc-modal') || container;
  const hosts = readSelectedHosts(modal);
  const scope = readScope(modal);
  const skillFilter = readSkillFilter(modal);
  if (hosts.length === 0) {
    setStatus?.({ ok: false, error: 'no-hosts-selected' });
    return;
  }
  btn.disabled = true;
  try {
    const { ok, data } = await postPreview({ hosts, scope, skillFilter });
    if (!ok || data?.degraded) {
      btn.disabled = true;
      btn.title = data?.reason || 'Preview not supported';
      setStatus?.({ ok: false, error: data?.reason || 'preview-failed' });
      return;
    }
    renderPreviewInto(container, data.byHost || {});
    applyDegradedState(btn, data.byHost || {});
  } finally {
    if (btn.title !== 'Preview not supported') btn.disabled = false;
  }
}

export function bindPreviewEvents(container, _options, setStatus) {
  const btn = container.querySelector('[data-action="preview"]');
  if (!btn) return;
  btn.addEventListener('click', () => {
    handlePreviewClick(container, btn, setStatus).catch((err) => {
      setStatus?.({ ok: false, error: String(err?.message || err) });
    });
  });
}
