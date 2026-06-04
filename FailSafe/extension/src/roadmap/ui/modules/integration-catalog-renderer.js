/**
 * IntegrationCatalogRenderer — Integrations-tab "Catalog" sub-view (GH #167).
 * Gives the command/config integrations that lack a dedicated sub-view
 * (Continue, Aider, OpenHands, Cline/Roo/Kilo, Linear, Jira, GitHub Checks,
 * Sentry, Teams, Slack) a single home: one card each, grouped by category, with
 * a live enabled/configured status pill + a "Configure" affordance that jumps to
 * the matching Settings section. Data comes from /api/v1/integrations/catalog,
 * which is secret-safe (booleans only — no token/key/webhook value crosses the
 * wire).
 *
 * Visual language matches the AGT sub-view (the Chrome-verified card exemplar in
 * this same tab) + the Bicameral status-pill vocabulary, per
 * feedback_design_reference_required.
 */

const STYLE_ID = 'cc-intcat-style';
const STYLE = `
.cc-intcat { display:flex; flex-direction:column; gap:12px; }
.cc-intcat h3 { margin:0 0 4px; font-size:1.05rem; }
.cc-intcat-sub { color:#9aa5b4; margin:0 0 6px; font-size:.9rem; }
.cc-intcat-group { font-size:.78rem; text-transform:uppercase; letter-spacing:.04em; color:#7f8aa0; margin:6px 0 2px; }
.cc-intcat-card { background:linear-gradient(180deg,#141a22,#10161e); border:1px solid #202938; border-radius:10px; padding:14px; }
.cc-intcat-card.cc-intcat-active { border-color:#2f5e44; }
.cc-intcat-card.cc-intcat-needs { border-color:#6b4f2a; }
.cc-intcat-head { display:flex; align-items:center; gap:10px; margin-bottom:6px; flex-wrap:wrap; }
.cc-intcat-head strong { font-size:1rem; }
.cc-intcat-pill { font-size:.7rem; padding:2px 8px; border-radius:999px; border:1px solid #273140; color:#9aa5b4; text-transform:uppercase; letter-spacing:.05em; }
.cc-intcat-pill-active { color:#68d391; border-color:#2f5e44; }
.cc-intcat-pill-needs { color:#f6ad55; border-color:#6b4f2a; }
.cc-intcat-pill-disabled { color:#7f8aa0; border-color:#273140; }
.cc-intcat-card p { color:#9aa5b4; margin:0 0 8px; font-size:.88rem; }
.cc-intcat-hint { color:#7f8aa0; font-size:.8rem; margin:0 0 10px; }
.cc-intcat-missing { color:#f6ad55; font-size:.78rem; margin:0 0 8px; }
.cc-intcat-actions { display:flex; align-items:center; gap:10px; }
.cc-intcat-btn { background:#141a22; color:#f1efe7; border:1px solid #2f5e44; border-radius:8px; padding:6px 14px; cursor:pointer; font:inherit; }
.cc-intcat-btn:hover { border-color:#68d391; }
.cc-intcat-docs { color:#5fb0d8; font-size:.82rem; text-decoration:none; }
.cc-intcat-docs:hover { text-decoration:underline; }
`;

const PILL = {
  active: { cls: 'cc-intcat-pill-active', label: 'Active' },
  'needs-config': { cls: 'cc-intcat-pill-needs', label: 'Needs config' },
  disabled: { cls: 'cc-intcat-pill-disabled', label: 'Disabled' },
};

// Per-integration documentation anchor (per-integration READMEs live under
// src/integrations/<docsId>/README.md; INTEGRATION_DOCS_INDEX.md is the index).
const DOCS_BASE = 'https://github.com/MythologIQ-Labs-LLC/FailSafe/blob/main/FailSafe/extension/src/integrations';
const DOCS_PATH = {
  continue: 'agent-cli/README.md',
  aider: 'agent-cli/README.md',
  openhands: 'agent-observe/README.md',
  'agent-observe': 'agent-observe/README.md',
  linear: 'linear/README.md',
  jira: 'jira/README.md',
  'github-checks': 'github-checks/README.md',
  sentry: 'sentry/README.md',
  teams: 'teams/README.md',
  slack: 'slack/README.md',
};

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function pill(state) {
  const p = PILL[state] || PILL.disabled;
  return `<span class="cc-intcat-pill ${p.cls}">${p.label}</span>`;
}

function card(s) {
  const cardCls = s.state === 'active' ? ' cc-intcat-active' : s.state === 'needs-config' ? ' cc-intcat-needs' : '';
  const missing = (s.state === 'needs-config' && s.missingKeys && s.missingKeys.length)
    ? `<div class="cc-intcat-missing">Missing: ${s.missingKeys.map((k) => esc(k.split('.').pop())).join(', ')}</div>`
    : '';
  const docPath = DOCS_PATH[s.docsId] || DOCS_PATH[s.id];
  const docs = docPath
    ? `<a class="cc-intcat-docs" href="${DOCS_BASE}/${docPath}" target="_blank" rel="noopener">Docs →</a>`
    : '';
  const btnLabel = s.state === 'active' ? 'Settings' : 'Configure';
  return `
    <div class="cc-intcat-card${cardCls}" data-id="${esc(s.id)}">
      <div class="cc-intcat-head"><strong>${esc(s.label)}</strong>${pill(s.state)}</div>
      <p>${esc(s.summary)}</p>
      <div class="cc-intcat-hint">${esc(s.configHint)}</div>
      ${missing}
      <div class="cc-intcat-actions">
        <button class="cc-intcat-btn cc-intcat-configure" data-id="${esc(s.id)}">${btnLabel}</button>
        ${docs}
      </div>
    </div>`;
}

export class IntegrationCatalogRenderer {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
  }

  ensureStyle() {
    if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
    const el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = STYLE;
    document.head.appendChild(el);
  }

  async render() {
    if (!this.container) return;
    this.ensureStyle();
    this.container.innerHTML = '<div class="cc-intcat"><h3>Integration Catalog</h3><p class="cc-intcat-sub">Loading…</p></div>';
    let data;
    try {
      const res = await fetch('/api/v1/integrations/catalog');
      data = await res.json();
    } catch (err) {
      this.container.innerHTML = `<div class="cc-intcat"><h3>Integration Catalog</h3><p class="cc-intcat-sub">Could not load integrations: ${esc(err)}</p></div>`;
      return;
    }
    const integrations = (data && data.integrations) || [];
    // Group by category, preserving catalog order within each group.
    const groups = [];
    const byCat = new Map();
    for (const s of integrations) {
      if (!byCat.has(s.category)) { byCat.set(s.category, []); groups.push(s.category); }
      byCat.get(s.category).push(s);
    }
    const activeCount = integrations.filter((s) => s.state === 'active').length;
    const sub = integrations.length
      ? `${integrations.length} integrations — ${activeCount} active. Enable + configure each under Settings; FailSafe never stores secrets in this view.`
      : 'No catalog integrations available.';
    const sections = groups
      .map((cat) => `<div class="cc-intcat-group">${esc(cat)}</div>` + byCat.get(cat).map(card).join(''))
      .join('');
    this.container.innerHTML =
      `<div class="cc-intcat"><h3>Integration Catalog</h3>` +
      `<p class="cc-intcat-sub">${esc(sub)}</p>` +
      sections +
      `</div>`;
    this.wire();
  }

  wire() {
    this.container.querySelectorAll('.cc-intcat-configure').forEach((btn) => {
      btn.addEventListener('click', () => {
        // Jump to the Settings tab so the operator can enable/configure. The
        // settings section is keyed by data-target="settings" in the tab bar.
        const settingsTab = document.querySelector('.tab-btn[data-target="settings"]');
        if (settingsTab) settingsTab.click();
      });
    });
  }

  // No WS event stream for the catalog — re-render on hub refresh picks up
  // config changes. Accept + ignore events for TabGroup parity.
  onEvent() {}
}
