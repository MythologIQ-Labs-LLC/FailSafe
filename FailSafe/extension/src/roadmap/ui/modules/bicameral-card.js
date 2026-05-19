// FailSafe Command Center — Bicameral MCP integration card.
// Renders one of four install states + an optional decision feed.
// Pure HTML + JSDOM-friendly. CSS tokens are FailSafe's; we do not clone
// Bicameral's palette.

export const INITIAL_BICAMERAL_STATE = {
  installState: 'unknown',
  version: undefined,
  features: [],   // [{ feature: string, decisions: Decision[] }]
  driftByFile: {},
  error: null,
  requesting: false,
  /** Active install progress (when user triggered install from card). */
  installProgress: null, // { mode: 'solo'|'team', steps: InstallStep[], done: boolean, ok: boolean, error?: string }
};

function esc(value) {
  if (value === null || value === undefined) return '';
  const d = (typeof document !== 'undefined') ? document.createElement('div') : null;
  if (d) { d.textContent = String(value); return d.innerHTML; }
  return String(value).replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
}

// Status color tokens — sourced from command-center.css theme variables.
// Per FailSafe UI standard (voice-pack-settings-card.js exemplar):
// reference declared theme tokens only, no fabricated tokens, no hex fallbacks
// that diverge from the canonical token value. `--accent-cyan` substitutes
// for the previously fabricated `--accent-teal`; an `open-question` status
// inherits `--primary` (no purple in the theme).
const STATUS_COLOR = {
  'in-sync':       'var(--accent-green)',
  'drifted':       'var(--accent-gold)',
  'open-question': 'var(--primary)',
  'unratified':    'var(--text-muted)',
};

function statusBadge(status) {
  const color = STATUS_COLOR[status] || STATUS_COLOR.unratified;
  return `<span class="cc-bicameral-status" style="font-size:0.7rem;color:${color};text-transform:uppercase;letter-spacing:0.06em">${esc(status)}</span>`;
}

function renderHeader(state) {
  const versionTag = state.version
    ? `<span style="font-size:0.7rem;color:var(--text-muted)">v${esc(state.version)}</span>`
    : '';
  return `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <div style="display:flex;align-items:center;gap:10px">
        <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.08em">Bicameral MCP</div>
        ${versionTag}
      </div>
      <button class="cc-btn" data-action="bicameral-detect" style="font-size:0.75rem;padding:4px 10px">Detect again</button>
    </div>
  `;
}

function renderInstallStep(step) {
  const icon = step.status === 'success' ? '✓'
    : step.status === 'error' ? '✗'
    : '⏳';
  const errorSpan = step.error
    ? ` <span style="color:var(--accent-red)">${esc(step.error)}</span>`
    : '';
  return `<li style="font-size:0.78rem;color:var(--text-muted)">${icon} ${esc(step.phase)}${errorSpan}</li>`;
}

function renderInstallProgress(progress) {
  if (!progress || !progress.steps || progress.steps.length === 0) {
    return `<div style="font-size:0.78rem;color:var(--text-muted);margin-top:8px">Starting ${esc(progress?.mode || '')} install…</div>`;
  }
  const rows = progress.steps.map(renderInstallStep).join('');
  return `
    <div class="cc-bicameral-install-progress" style="margin-top:10px;padding:8px 10px;background:rgba(255,255,255,0.03);border-radius:4px">
      <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px">Install — ${esc(progress.mode)} mode</div>
      <ul style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:2px">${rows}</ul>
    </div>
  `;
}

function renderNotInstalled(state) {
  // If an install is in-flight (state.installProgress set + !done), suppress
  // the picker and show the live progress block instead.
  if (state.installProgress && !state.installProgress.done) {
    return `
      <div class="cc-bicameral-installing" style="padding:16px 0;font-size:0.85rem;line-height:1.6">
        <div style="color:var(--text-main);margin-bottom:6px">Installing Bicameral MCP (${esc(state.installProgress.mode)}-mode)…</div>
        ${renderInstallProgress(state.installProgress)}
      </div>
    `;
  }
  const installError = state.installProgress?.done && !state.installProgress?.ok
    ? `<div class="cc-bicameral-install-error" style="margin-bottom:8px;padding:6px 8px;background:rgba(239,68,68,0.1);border-radius:4px;color:var(--accent-red);font-size:0.78rem">Install failed: ${esc(state.installProgress.error || 'unknown error')}</div>`
    : '';
  return `
    <div class="cc-bicameral-empty" style="padding:16px 0;font-size:0.85rem;line-height:1.6">
      <div style="color:var(--text-main);margin-bottom:8px">
        Bicameral MCP is not installed in this workspace.
      </div>
      <div style="color:var(--text-muted);margin-bottom:12px">
        Install via FailSafe — pick your mode below. FailSafe runs <code style="background:var(--bg-dark);padding:1px 5px;border-radius:3px">pip install bicameral-mcp</code> + <code style="background:var(--bg-dark);padding:1px 5px;border-radius:3px">bicameral-mcp setup</code> on your machine; nothing is bundled inside FailSafe.
      </div>
      ${installError}
      <div style="display:flex;gap:8px;margin-bottom:10px">
        <button class="cc-btn cc-btn--primary" data-action="bicameral-install" data-mode="solo"
          style="font-size:0.85rem;padding:8px 14px">Install (Solo)</button>
        <button class="cc-btn" data-action="bicameral-install" data-mode="team"
          style="font-size:0.85rem;padding:8px 14px">Install (Team)</button>
      </div>
      <a href="https://github.com/BicameralAI/bicameral-mcp" target="_blank" rel="noopener" style="font-size:0.8rem;color:var(--accent-cyan)">Bicameral MCP documentation →</a>
    </div>
  `;
}

function renderInstalledNotConfigured(state) {
  if (state.installProgress && !state.installProgress.done) {
    return `
      <div class="cc-bicameral-installing" style="padding:16px 0;font-size:0.85rem;line-height:1.6">
        <div style="color:var(--text-main);margin-bottom:6px">Running setup (${esc(state.installProgress.mode)}-mode)…</div>
        ${renderInstallProgress(state.installProgress)}
      </div>
    `;
  }
  return `
    <div class="cc-bicameral-empty" style="padding:16px 0;font-size:0.85rem;line-height:1.6">
      <div style="color:var(--text-main);margin-bottom:8px">Bicameral CLI is installed but not configured for this workspace.</div>
      <div style="color:var(--text-muted);margin-bottom:12px">Pick a mode to run <code style="background:var(--bg-dark);padding:1px 5px;border-radius:3px">bicameral-mcp setup</code>:</div>
      <div style="display:flex;gap:8px">
        <button class="cc-btn cc-btn--primary" data-action="bicameral-setup" data-mode="solo"
          style="font-size:0.85rem;padding:8px 14px">Setup (Solo)</button>
        <button class="cc-btn" data-action="bicameral-setup" data-mode="team"
          style="font-size:0.85rem;padding:8px 14px">Setup (Team)</button>
      </div>
    </div>
  `;
}

function renderConfiguredNotRunning(state) {
  const disabled = state.requesting ? 'disabled' : '';
  return `
    <div style="padding:16px 0">
      <div style="color:var(--text-main);font-size:0.85rem;margin-bottom:12px">
        Bicameral is configured. Connect to surface decision history + drift status.
      </div>
      <button class="cc-btn cc-btn--primary" data-action="bicameral-connect" ${disabled}
        style="font-size:0.85rem;padding:8px 16px">${state.requesting ? 'Connecting…' : 'Connect'}</button>
    </div>
  `;
}

function renderDecisionRow(decision, driftByFile) {
  const binding = (decision.bindings || [])[0];
  const bindingText = binding
    ? `<code style="font-size:0.72rem;color:var(--text-muted)">${esc(binding.filePath)}${binding.symbol ? ':' + esc(binding.symbol) : ''}</code>`
    : '';
  const driftEntry = binding ? (driftByFile[binding.filePath] || []).find((d) => d.decisionId === decision.id) : null;
  const effectiveStatus = driftEntry ? driftEntry.status : decision.status;
  return `
    <div class="cc-bicameral-decision" data-decision-id="${esc(decision.id)}"
      style="padding:8px 10px;border:1px solid var(--border-rim);border-radius:4px;display:flex;justify-content:space-between;align-items:center;gap:12px">
      <div style="flex:1;min-width:0">
        <div style="font-size:0.85rem;color:var(--text-main);margin-bottom:2px">${esc(decision.title)}</div>
        ${bindingText}
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        ${statusBadge(effectiveStatus)}
        <button class="cc-btn" data-action="bicameral-ratify" data-decision-id="${esc(decision.id)}" data-verdict="ratify"
          style="font-size:0.7rem;padding:3px 8px">Ratify</button>
      </div>
    </div>
  `;
}

function renderFeatureSection(brief, driftByFile) {
  if (!brief.decisions || brief.decisions.length === 0) {
    return `
      <div class="cc-bicameral-feature" data-feature="${esc(brief.feature)}" style="margin-bottom:10px">
        <div style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px">${esc(brief.feature)}</div>
        <div style="font-size:0.78rem;color:var(--text-muted)">No decisions recorded</div>
      </div>
    `;
  }
  const rows = brief.decisions.map((d) => renderDecisionRow(d, driftByFile)).join('');
  return `
    <div class="cc-bicameral-feature" data-feature="${esc(brief.feature)}" style="margin-bottom:14px">
      <div style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px">${esc(brief.feature)}</div>
      <div style="display:flex;flex-direction:column;gap:4px">${rows}</div>
    </div>
  `;
}

function renderRunning(state) {
  const refreshDisabled = state.requesting ? 'disabled' : '';
  if (state.features.length === 0) {
    return `
      <div style="padding:16px 0;font-size:0.85rem;color:var(--text-muted)">
        Connected. No decisions yet — paste a transcript or PRD to <code style="background:var(--bg-dark);padding:1px 5px;border-radius:3px">/bicameral-ingest</code>.
      </div>
      <button class="cc-btn" data-action="bicameral-refresh" ${refreshDisabled}
        style="font-size:0.75rem;padding:4px 10px;margin-top:8px">${state.requesting ? 'Refreshing…' : 'Refresh'}</button>
    `;
  }
  const sections = state.features.map((f) => renderFeatureSection(f, state.driftByFile || {})).join('');
  return `
    <div class="cc-bicameral-feed" style="padding:8px 0">${sections}</div>
    <div style="display:flex;justify-content:flex-end;margin-top:8px">
      <button class="cc-btn" data-action="bicameral-refresh" ${refreshDisabled}
        style="font-size:0.75rem;padding:4px 10px">${state.requesting ? 'Refreshing…' : 'Refresh'}</button>
    </div>
  `;
}

function renderErrorBlock(state) {
  if (!state.error) return '';
  return `
    <div class="cc-bicameral-error" style="margin-top:8px;padding:8px;background:rgba(239,68,68,0.1);border-radius:4px;color:var(--accent-red);font-size:0.78rem">
      ${esc(state.error)}
    </div>
  `;
}

export function renderBicameralCard(state) {
  const s = { ...INITIAL_BICAMERAL_STATE, ...state };
  let body;
  switch (s.installState) {
    case 'not-installed':            body = renderNotInstalled(s); break;
    case 'installed-not-configured': body = renderInstalledNotConfigured(s); break;
    case 'configured-not-running':   body = renderConfiguredNotRunning(s); break;
    case 'running':                  body = renderRunning(s); break;
    default:
      body = `<div style="padding:16px 0;font-size:0.85rem;color:var(--text-muted)">Detecting Bicameral MCP…</div>`;
  }
  // Inline style overrides removed — .cc-card owns glass-morphism, radius,
  // padding, backdrop-blur, and box-shadow per command-center.css standard.
  return `
    <div class="cc-card cc-bicameral-card" id="cc-bicameral">
      ${renderHeader(s)}
      ${body}
      ${renderErrorBlock(s)}
    </div>
  `;
}

export function bindBicameralCard(container, options = {}) {
  if (!container || typeof container.querySelector !== 'function') return;
  const card = container.querySelector('.cc-bicameral-card') || container;

  card.querySelector('[data-action="bicameral-detect"]')?.addEventListener('click', () => {
    options.onDetect?.();
  });
  card.querySelector('[data-action="bicameral-connect"]')?.addEventListener('click', () => {
    options.onConnect?.();
  });
  card.querySelector('[data-action="bicameral-refresh"]')?.addEventListener('click', () => {
    options.onRefresh?.();
  });
  card.querySelectorAll('[data-action="bicameral-ratify"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const target = e.currentTarget;
      const id = target.getAttribute('data-decision-id') || '';
      const verdict = target.getAttribute('data-verdict') || 'ratify';
      options.onRatify?.(id, verdict);
    });
  });
  card.querySelectorAll('[data-action="bicameral-install"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const mode = e.currentTarget.getAttribute('data-mode') || 'solo';
      options.onInstall?.(mode);
    });
  });
  card.querySelectorAll('[data-action="bicameral-setup"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const mode = e.currentTarget.getAttribute('data-mode') || 'solo';
      options.onSetup?.(mode);
    });
  });
}
