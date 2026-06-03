/**
 * AgtRenderer — Integrations-tab sub-view for the Microsoft Agent Governance
 * Toolkit (AGT) installer (B-INT-16). Auto-detects the workspace language and
 * surfaces the matching, verified install command first ("Recommended"), then
 * the remaining language SDKs + agent-host plugins. Runnable modules get a
 * "Run in terminal" button (pre-fills an integrated terminal — the operator
 * presses enter; no silent install); copy-only modules (Claude Code slash
 * commands) get a "Copy" button.
 *
 * Matches the console dark theme + the MCP catalog card layout. Visual surface
 * verified in Chrome per feedback_design_reference_required.
 */

const STYLE_ID = 'cc-agt-style';
const STYLE = `
.cc-agt { display:flex; flex-direction:column; gap:12px; }
.cc-agt h3 { margin:0 0 4px; font-size:1.05rem; }
.cc-agt-sub { color:#9aa5b4; margin:0 0 4px; font-size:.9rem; }
.cc-agt-preview { color:#f6ad55; font-size:.8rem; margin:0 0 6px; }
.cc-agt-group { font-size:.78rem; text-transform:uppercase; letter-spacing:.04em; color:#7f8aa0; margin:6px 0 2px; }
.cc-agt-card { background:linear-gradient(180deg,#141a22,#10161e); border:1px solid #202938; border-radius:10px; padding:14px; }
.cc-agt-card.cc-agt-reco { border-color:#2f5e44; }
.cc-agt-head { display:flex; align-items:center; gap:10px; margin-bottom:6px; flex-wrap:wrap; }
.cc-agt-head strong { font-size:1rem; }
.cc-agt-env { color:#9aa5b4; font-size:.82rem; }
.cc-agt-badge { font-size:.7rem; padding:2px 8px; border-radius:999px; border:1px solid #273140; color:#9aa5b4; }
.cc-agt-badge-reco { color:#68d391; border-color:#2f5e44; }
.cc-agt-badge-src { color:#f6ad55; border-color:#6b4f2a; }
.cc-agt-card p { color:#9aa5b4; margin:0 0 8px; font-size:.88rem; }
.cc-agt-cmd { display:block; white-space:pre-wrap; font-family:ui-monospace,Consolas,monospace; font-size:.8rem; color:#f8e7a1;
  background:#0b1118; border:1px solid #202938; border-radius:6px; padding:6px 8px; margin-bottom:10px; overflow-x:auto; }
.cc-agt-actions { display:flex; align-items:center; gap:10px; }
.cc-agt-btn { background:#141a22; color:#f1efe7; border:1px solid #2f5e44; border-radius:8px; padding:6px 14px; cursor:pointer; font:inherit; }
.cc-agt-btn:hover { border-color:#68d391; }
.cc-agt-btn-copy { border-color:#3a4658; }
.cc-agt-btn-copy:hover { border-color:#6a7790; }
.cc-agt-status { color:#9aa5b4; font-size:.82rem; }
`;

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function card(m) {
  const reco = m.recommended ? ' cc-agt-reco' : '';
  const badges = [
    m.recommended ? '<span class="cc-agt-badge cc-agt-badge-reco">recommended</span>' : '',
    m.status === 'source-only' ? '<span class="cc-agt-badge cc-agt-badge-src">source-only (no release)</span>' : '',
  ].join('');
  const action = m.runnable
    ? `<button class="cc-agt-btn cc-agt-run" data-id="${esc(m.id)}">Run in terminal</button>`
    : `<button class="cc-agt-btn cc-agt-btn-copy cc-agt-copy" data-id="${esc(m.id)}">Copy command</button>`;
  return `
    <div class="cc-agt-card${reco}" data-id="${esc(m.id)}">
      <div class="cc-agt-head"><strong>${esc(m.label)}</strong>
        <span class="cc-agt-env">${esc(m.env)}</span>${badges}</div>
      <p>${esc(m.note)}</p>
      <code class="cc-agt-cmd">${esc(m.command)}</code>
      <div class="cc-agt-actions">${action}<span class="cc-agt-status"></span></div>
    </div>`;
}

export class AgtRenderer {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
  }

  ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = STYLE;
    document.head.appendChild(el);
  }

  async render() {
    if (!this.container) return;
    this.ensureStyle();
    this.container.innerHTML = '<div class="cc-agt"><h3>Agent Governance Toolkit</h3><p class="cc-agt-sub">Loading…</p></div>';
    let data;
    try {
      const res = await fetch('/api/v1/agt/modules');
      data = await res.json();
    } catch (err) {
      this.container.innerHTML = `<div class="cc-agt"><h3>Agent Governance Toolkit</h3><p class="cc-agt-sub">Could not load AGT modules: ${esc(err)}</p></div>`;
      return;
    }
    const modules = (data && data.modules) || [];
    const detected = (data && data.detected) || [];
    const reco = modules.filter((m) => m.recommended);
    const langs = modules.filter((m) => m.kind === 'language' && !m.recommended);
    const hosts = modules.filter((m) => m.kind === 'agent-host' && !m.recommended);
    const detectLine = detected.length
      ? `Detected ${detected.length === 1 ? 'environment' : 'environments'} in this workspace — the matching installer is recommended below.`
      : 'No language manifest detected at the workspace root — pick the environment that matches your project or agent.';
    const section = (title, list) => (list.length ? `<div class="cc-agt-group">${esc(title)}</div>${list.map(card).join('')}` : '');
    this.container.innerHTML =
      `<div class="cc-agt"><h3>Agent Governance Toolkit</h3>` +
      `<p class="cc-agt-preview">${esc((data && data.preview) || '')}</p>` +
      `<p class="cc-agt-sub">${esc(detectLine)} Commands are verified against the upstream registries; the install command is pre-filled into a terminal for you to review and run.</p>` +
      section('Recommended for your workspace', reco) +
      section('Language SDKs', langs) +
      section('Agent hosts', hosts) +
      (modules.length ? '' : '<p class="cc-agt-sub">No AGT modules available.</p>') +
      `</div>`;
    this.wire();
  }

  wire() {
    this.container.querySelectorAll('.cc-agt-run').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const status = btn.closest('.cc-agt-card').querySelector('.cc-agt-status');
        const id = btn.getAttribute('data-id');
        btn.disabled = true;
        if (status) status.textContent = 'Opening terminal…';
        try {
          const res = await fetch('/api/actions/agt-install', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id }),
          });
          const json = await res.json().catch(() => ({}));
          if (status) status.textContent = res.ok ? 'Command pre-filled in the terminal — press enter to install.' : (json.error || `Error ${res.status}`);
        } catch (err) {
          if (status) status.textContent = String(err);
        } finally {
          btn.disabled = false;
        }
      });
    });
    this.container.querySelectorAll('.cc-agt-copy').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const card = btn.closest('.cc-agt-card');
        const status = card.querySelector('.cc-agt-status');
        const cmd = card.querySelector('.cc-agt-cmd');
        const text = cmd ? cmd.textContent : '';
        try {
          await navigator.clipboard.writeText(text);
          if (status) status.textContent = 'Copied — run these inside the agent.';
        } catch {
          if (status) status.textContent = 'Copy failed — select the command above manually.';
        }
      });
    });
  }

  // No WS event stream for the AGT installer — accept + ignore for TabGroup parity.
  onEvent() {}
}
