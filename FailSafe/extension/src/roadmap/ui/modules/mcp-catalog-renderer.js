/**
 * McpCatalogRenderer — Integrations-tab sub-view for governed MCP installs
 * (B-INT-13/14). Lists the MCP catalog (Context7, Mermaid Chart) with each
 * entry's #108 local risk badge + an Install button that writes the server entry
 * into .mcp.json after a confirm click (governed; no silent install).
 *
 * Matches the console dark theme + the existing integration-card layout. Visual
 * surface verified in Chrome per feedback_design_reference_required.
 */

const STYLE_ID = 'cc-mcp-style';
const STYLE = `
.cc-mcp { display:flex; flex-direction:column; gap:12px; }
.cc-mcp h3 { margin:0 0 4px; font-size:1.05rem; }
.cc-mcp-sub { color:#9aa5b4; margin:0 0 8px; font-size:.9rem; }
.cc-mcp-card { background:linear-gradient(180deg,#141a22,#10161e); border:1px solid #202938; border-radius:10px; padding:14px; }
.cc-mcp-head { display:flex; align-items:center; gap:10px; margin-bottom:6px; }
.cc-mcp-head strong { font-size:1rem; }
.cc-mcp-risk { font-size:.72rem; padding:2px 8px; border-radius:999px; border:1px solid #273140; }
.cc-mcp-risk-low { color:#68d391; border-color:#2f5e44; }
.cc-mcp-risk-med { color:#f6ad55; border-color:#6b4f2a; }
.cc-mcp-risk-high { color:#fc8181; border-color:#6b2f2f; }
.cc-mcp-card p { color:#9aa5b4; margin:0 0 8px; font-size:.9rem; }
.cc-mcp-cmd { display:block; font-family:ui-monospace,Consolas,monospace; font-size:.8rem; color:#f8e7a1;
  background:#0b1118; border:1px solid #202938; border-radius:6px; padding:6px 8px; margin-bottom:10px; overflow-x:auto; }
.cc-mcp-actions { display:flex; align-items:center; gap:10px; }
.cc-mcp-install { background:#141a22; color:#f1efe7; border:1px solid #2f5e44; border-radius:8px; padding:6px 14px; cursor:pointer; font:inherit; }
.cc-mcp-install:hover { border-color:#68d391; }
.cc-mcp-install[data-confirm="1"] { border-color:#f6ad55; color:#f6ad55; }
.cc-mcp-status { color:#9aa5b4; font-size:.82rem; }
`;

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

export class McpCatalogRenderer {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this._loaded = false;
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
    this.container.innerHTML = '<div class="cc-mcp"><h3>MCP Integrations</h3><p class="cc-mcp-sub">Loading catalog…</p></div>';
    let data;
    try {
      const res = await fetch('/api/v1/mcp/catalog');
      data = await res.json();
    } catch (err) {
      this.container.innerHTML = `<div class="cc-mcp"><h3>MCP Integrations</h3><p class="cc-mcp-sub">Could not load catalog: ${esc(err)}</p></div>`;
      return;
    }
    const entries = (data && data.entries) || [];
    // Future: render a search/filter bar above the cards when the catalog grows
    // past ~20 entries (small catalog today — Context7 + Mermaid Chart).
    const cards = entries.map((e) => `
      <div class="cc-mcp-card" data-id="${esc(e.id)}">
        <div class="cc-mcp-head"><strong>${esc(e.name)}</strong>
          <span class="cc-mcp-risk cc-mcp-risk-${esc(e.risk.level)}">risk: ${esc(e.risk.level)} (${esc(e.risk.score)})</span></div>
        <p>${esc(e.description)}</p>
        <code class="cc-mcp-cmd">${esc(e.install.command + ' ' + e.install.args.join(' '))}</code>
        <div class="cc-mcp-actions">
          <button class="cc-mcp-install" data-id="${esc(e.id)}">Install</button>
          <span class="cc-mcp-status"></span>
        </div>
      </div>`).join('');
    this.container.innerHTML =
      `<div class="cc-mcp"><h3>MCP Integrations</h3>` +
      `<p class="cc-mcp-sub">Governed install into <code>.mcp.json</code>. Risk is scored locally on the registry metadata; click Install, then confirm.</p>` +
      (cards || '<p class="cc-mcp-sub">No catalog entries.</p>') + `</div>`;
    this.wire();
    this._loaded = true;
  }

  wire() {
    this.container.querySelectorAll('.cc-mcp-install').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const card = btn.closest('.cc-mcp-card');
        const status = card.querySelector('.cc-mcp-status');
        const id = btn.getAttribute('data-id');
        if (btn.dataset.confirm !== '1') {
          btn.dataset.confirm = '1';
          btn.textContent = 'Confirm install';
          if (status) status.textContent = 'Writes the server entry to .mcp.json — click again to confirm.';
          return;
        }
        btn.disabled = true;
        if (status) status.textContent = 'Installing…';
        try {
          const res = await fetch('/api/actions/mcp-install', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id }),
          });
          const json = await res.json().catch(() => ({}));
          if (status) status.textContent = res.ok ? `${json.added ? 'Installed' : 'Updated'} in .mcp.json (governed).` : (json.error || `Error ${res.status}`);
        } catch (err) {
          if (status) status.textContent = String(err);
        } finally {
          btn.disabled = false;
          btn.textContent = 'Install';
          btn.dataset.confirm = '';
        }
      });
    });
  }

  // No WS event stream for the MCP catalog — accept + ignore for TabGroup parity.
  onEvent() {}
}
