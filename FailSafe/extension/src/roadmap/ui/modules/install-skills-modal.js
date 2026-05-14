// FailSafe Command Center — Install Skills modal (Phase 1 V2 Path A split).
// Owns modal lifecycle + WS-driven live progress + Retry/Dismiss/Close flow.
// Pure reducer lives in install-skills-progress.js; picker (Phase 3) and
// preview (Phase 4) are forward-referenced sibling modules.

import { applyProgressUpdate, applyCompletion, applyError } from './install-skills-progress.js';
import { renderPickerSection, collectSkillFilter } from './install-skills-picker.js';
import { renderPreviewButton, bindPreviewEvents } from './install-skills-preview.js';

const HOST_LABELS = { claude: 'Claude', codex: 'Codex', 'kilo-code': 'Kilo', gemini: 'Gemini' };
const PHASE_LABELS = {
  'python-probe': 'Resolve Python interpreter',
  'pip-install': 'Install qor-logic package',
  'qorlogic-install': 'Install skills',
  'provenance': 'Verify install records',
  'refresh': 'Refresh hub',
};

function esc(value) {
  if (value === null || value === undefined) return '';
  const d = document.createElement('div');
  d.textContent = String(value);
  return d.innerHTML;
}

function lineIcon(status) {
  if (status === 'success') return '✓';
  if (status === 'error') return '✗';
  if (status === 'running') return '⏳';
  return '·';
}

function renderProgressLines(state) {
  const lines = (state && state.lines) || [];
  if (!lines.length) {
    return '<div style="font-size:0.8rem;color:var(--text-muted)">Waiting for install to start…</div>';
  }
  const rows = lines.map((l) => {
    const detail = l.detail ? ` — <code>${esc(l.detail)}</code>` : '';
    const errSpan = l.error ? ` <span style="color:var(--accent-red,#ef4444)">${esc(l.error)}</span>` : '';
    const label = PHASE_LABELS[l.phase] || l.phase;
    return `<li>${lineIcon(l.status)} ${esc(label)}${detail}${errSpan}</li>`;
  }).join('');
  return `<ul class="cc-modal-progress-lines" style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:4px;font-size:0.82rem">${rows}</ul>`;
}

function renderErrorBlock(state) {
  const msg = state.err && state.err.error ? state.err.error : 'Install failed';
  return `<div class="cc-modal-error" style="margin-top:8px;padding:8px;background:rgba(239,68,68,0.1);border-radius:4px"><div style="color:var(--accent-red,#ef4444);font-size:0.85rem;margin-bottom:6px">${esc(msg)}</div><div style="display:flex;gap:6px"><button class="cc-btn cc-btn--primary" data-action="retry" style="font-size:0.75rem;padding:4px 10px">Retry</button><button class="cc-btn" data-action="dismiss" style="font-size:0.75rem;padding:4px 10px">Dismiss</button></div></div>`;
}

function renderDoneBlock(state) {
  const dests = (state.destinations || []).map(esc).join(', ');
  const total = state.totalInstalled;
  const summary = total !== undefined
    ? `Installed ${total} skill${total === 1 ? '' : 's'}${dests ? ` at ${dests}` : ''}.`
    : 'Install complete.';
  return `<div class="cc-modal-done" style="margin-top:8px"><div style="color:var(--accent-teal,#2dd4bf);font-size:0.85rem;margin-bottom:6px">${esc(summary)}</div><button class="cc-btn cc-btn--primary" data-action="close" style="font-size:0.78rem;padding:4px 12px">Close</button></div>`;
}

function renderHostCheckboxes(hosts) {
  return hosts.map((h) => {
    const label = HOST_LABELS[h.host] || h.host;
    const checked = h.installed || !hosts.some((x) => x.installed) ? 'checked' : '';
    const tag = h.installed ? '<span style="font-size:0.65rem;color:var(--accent-green)">(installed)</span>' : '';
    return `<label style="display:flex;align-items:center;gap:8px;padding:6px 0;cursor:pointer"><input type="checkbox" class="cc-modal-host" value="${esc(h.host)}" ${checked}><span style="font-size:0.85rem">${esc(label)}</span>${tag}</label>`;
  }).join('');
}

function renderScopeRadios() {
  return `<div style="display:flex;gap:12px"><label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="radio" name="cc-modal-scope" value="repo" checked><span style="font-size:0.85rem">Workspace</span><span style="font-size:0.7rem;color:var(--text-muted)">(./)</span></label><label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="radio" name="cc-modal-scope" value="global"><span style="font-size:0.85rem">Global</span><span style="font-size:0.7rem;color:var(--text-muted)">(~/)</span></label></div>`;
}

export function renderInstallModal(hosts, running) {
  return `<div class="cc-skill-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:1000;justify-content:center;align-items:center"><div class="cc-card" style="max-width:520px;width:90%;padding:20px;max-height:90vh;overflow-y:auto"><h3 style="margin:0 0 16px 0;font-size:1rem;color:var(--text-main)">Install QorLogic Skills</h3><div style="margin-bottom:16px"><div style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;margin-bottom:8px;letter-spacing:0.06em">Target Hosts</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:2px">${renderHostCheckboxes(hosts)}</div></div><div style="margin-bottom:16px"><div style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;margin-bottom:8px;letter-spacing:0.06em">Scope</div>${renderScopeRadios()}</div>${renderPickerSection(hosts, running)}<div class="cc-modal-progress" style="display:none;margin-bottom:12px"></div><div class="cc-modal-terminal" style="display:none"></div><div class="cc-modal-footer" style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">${renderPreviewButton(running)}<button class="cc-btn cc-modal-cancel">Cancel</button><button class="cc-btn cc-btn--primary cc-modal-confirm" ${running ? 'disabled' : ''}>${running ? 'Installing…' : 'Install'}</button></div></div></div>`;
}

function getState(container) {
  if (!container.__installSkillsModalState) {
    container.__installSkillsModalState = { lines: [], terminal: 'idle' };
  }
  return container.__installSkillsModalState;
}

function renderState(container) {
  const modal = container.querySelector('.cc-skill-modal');
  if (!modal) return;
  const state = getState(container);
  const progress = modal.querySelector('.cc-modal-progress');
  if (progress) {
    progress.style.display = state.lines.length ? 'block' : 'none';
    progress.innerHTML = renderProgressLines(state);
  }
  const term = modal.querySelector('.cc-modal-terminal');
  if (!term) return;
  if (state.terminal === 'error') { term.style.display = 'block'; term.innerHTML = renderErrorBlock(state); }
  else if (state.terminal === 'done') { term.style.display = 'block'; term.innerHTML = renderDoneBlock(state); }
  else { term.style.display = 'none'; term.innerHTML = ''; }
}

function setState(container, state) {
  container.__installSkillsModalState = state;
  renderState(container);
}

function tryNewWebSocket() {
  try { return new WebSocket('ws://localhost:9376'); } catch { return null; }
}

function openSubscription(container) {
  if (container.__installSkillsWsHandler) return;
  const existing = (typeof window !== 'undefined' && window.__failsafeWebSocket) || null;
  const ws = existing && existing.readyState === 1 ? existing : tryNewWebSocket();
  if (!ws) return;
  const handler = (ev) => onMessage(container, ev);
  ws.addEventListener('message', handler);
  container.__installSkillsWsHandler = { ws, handler, owned: ws !== existing };
}

function closeSubscription(container) {
  const sub = container.__installSkillsWsHandler;
  if (!sub) return;
  try { sub.ws.removeEventListener('message', sub.handler); } catch {}
  if (sub.owned) { try { sub.ws.close(); } catch {} }
  container.__installSkillsWsHandler = null;
}

function onMessage(container, ev) {
  let parsed;
  try { parsed = JSON.parse(ev.data); } catch { return; }
  if (!parsed || typeof parsed !== 'object') return;
  const state = getState(container);
  if (parsed.type === 'skills.install.progress' && parsed.invocation) {
    setState(container, applyProgressUpdate(state, parsed.invocation));
  } else if (parsed.type === 'skills.install.complete' && parsed.report) {
    setState(container, applyCompletion(state, parsed.report));
  }
}

export function showInstallModal(container) {
  const modal = container.querySelector('.cc-skill-modal');
  if (!modal) return;
  modal.style.display = 'flex';
  setState(container, { lines: [], terminal: 'idle' });
  const confirmBtn = modal.querySelector('.cc-modal-confirm');
  if (confirmBtn) confirmBtn.disabled = false;
  openSubscription(container);
}

export function hideInstallModal(container) {
  const modal = container.querySelector('.cc-skill-modal');
  if (modal) modal.style.display = 'none';
  closeSubscription(container);
}

function safeCollectFilter(modal) {
  try { return collectSkillFilter(modal); } catch { return undefined; }
}

function bindTerminalActions(container, options, setStatus) {
  const modal = container.querySelector('.cc-skill-modal');
  if (!modal) return;
  modal.addEventListener('click', (e) => {
    const action = e.target && e.target.getAttribute && e.target.getAttribute('data-action');
    if (action === 'close' || action === 'dismiss') {
      hideInstallModal(container);
    } else if (action === 'retry') {
      const last = container.__installSkillsLastArgs;
      if (!last) return;
      setState(container, { lines: [], terminal: 'idle' });
      performWebInstall(container, last.hosts, last.scope, options, setStatus, last.skillFilter);
    }
  });
}

export function bindModalEvents(container, options, setStatus) {
  const modal = container.querySelector('.cc-skill-modal');
  if (!modal) return;
  modal.querySelector('.cc-modal-cancel')?.addEventListener('click', () => hideInstallModal(container));
  modal.addEventListener('click', (e) => { if (e.target === modal) hideInstallModal(container); });
  modal.querySelector('.cc-modal-confirm')?.addEventListener('click', async () => {
    const checked = [...modal.querySelectorAll('.cc-modal-host:checked')].map((cb) => cb.value);
    if (checked.length === 0) { setStatus('Select at least one host.', 'var(--accent-gold)'); return; }
    const scope = modal.querySelector('input[name="cc-modal-scope"]:checked')?.value || 'repo';
    const skillFilter = safeCollectFilter(modal);
    await performWebInstall(container, checked, scope, options, setStatus, skillFilter);
  });
  bindTerminalActions(container, options, setStatus);
  try { bindPreviewEvents(container, options, setStatus); } catch {}
}

export async function performWebInstall(container, hosts, scope, options, setStatus, skillFilter) {
  const modal = container.querySelector('.cc-skill-modal');
  const confirmBtn = modal?.querySelector('.cc-modal-confirm');
  container.__installSkillsLastArgs = { hosts, scope, skillFilter };
  setState(container, { lines: [], terminal: 'running' });
  if (confirmBtn) confirmBtn.disabled = true;
  options.onStart?.();
  const body = skillFilter ? { hosts, scope, skillFilter } : { hosts, scope };
  try {
    const res = await fetch('/api/actions/scaffold-skills', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok || json.ok === false) {
      setState(container, applyError(getState(container), { error: json.error || res.statusText }));
      options.onError?.(json);
      return;
    }
    options.onFinishFetch?.(json);
  } catch (err) {
    setState(container, applyError(getState(container), { error: String(err) }));
    options.onError?.(err);
  } finally {
    if (confirmBtn) confirmBtn.disabled = false;
  }
}
