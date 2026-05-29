// FailSafe Command Center — Bicameral card state renderers (B-INT-7 split).
// Extracted from bicameral-card.js to keep each module under the Section-4
// razor. Pure HTML string builders, JSDOM-friendly; the orchestrator
// (bicameral-card.js renderBicameralCard) composes these by install state.

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

export function renderHeader(state) {
  const versionTag = state.version
    ? `<span style="font-size:0.7rem;color:var(--text-muted)">v${esc(state.version)}</span>`
    : '';
  // B-BIC-14: when connected (running), the header button performs a composite
  // status+history+drift refresh — relabel it "Sync" to reflect that.
  const detectLabel = state.installState === 'running' ? 'Sync' : 'Detect again';
  return `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <div style="display:flex;align-items:center;gap:10px">
        <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.08em">Bicameral MCP</div>
        ${versionTag}
      </div>
      <button class="cc-btn" data-action="bicameral-detect" style="font-size:0.75rem;padding:4px 10px">${detectLabel}</button>
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

export function renderNotInstalled(state) {
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

export function renderInstalledNotConfigured(state) {
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

export function renderConfiguredNotRunning(state) {
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

// B-BIC-15: clamp the binding `<code>` to its container so a long file path
// ellipsizes instead of pushing the Ratify control past the card's edge.
const BINDING_OVERFLOW = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block';

function renderDecisionRow(decision, driftByFile) {
  const binding = (decision.bindings || [])[0];
  const bindingText = binding
    ? `<code style="font-size:0.72rem;color:var(--text-muted);${BINDING_OVERFLOW}">${esc(binding.filePath)}${binding.symbol ? ':' + esc(binding.symbol) : ''}</code>`
    : '';
  const driftEntry = binding ? (driftByFile[binding.filePath] || []).find((d) => d.decisionId === decision.id) : null;
  const effectiveStatus = driftEntry ? driftEntry.status : decision.status;
  // B-BIC-12: an "Open" affordance opens the bound source file in the editor.
  const openBtn = binding
    ? `<button class="cc-btn" data-action="bicameral-open-binding"
        data-file-path="${esc(binding.filePath)}" data-start-line="${esc(binding.startLine ?? 1)}"
        style="font-size:0.7rem;padding:3px 8px">Open</button>`
    : '';
  // B-BIC-15: `min-width:0` on the row lets it shrink below its content width
  // so the inner `flex:1;min-width:0` div — and therefore the binding `<code>`
  // — clamps and ellipsizes instead of the row widening past the card.
  return `
    <div class="cc-bicameral-decision" data-decision-id="${esc(decision.id)}"
      style="padding:8px 10px;border:1px solid var(--border-rim);border-radius:4px;display:flex;justify-content:space-between;align-items:center;gap:12px;min-width:0">
      <div style="flex:1;min-width:0">
        <div style="font-size:0.85rem;color:var(--text-main);margin-bottom:2px">${esc(decision.title)}</div>
        ${bindingText}
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        ${statusBadge(effectiveStatus)}
        ${openBtn}
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

export function renderRunning(state) {
  const refreshDisabled = state.requesting ? 'disabled' : '';
  if (state.features.length === 0) {
    // B-BIC-13: only suggest /bicameral-ingest when the connected client
    // actually reports the `ingest` capability. Otherwise show capability-
    // neutral copy so the empty-state never advertises an absent tool.
    const canIngest = Array.isArray(state.capabilities) && state.capabilities.includes('ingest');
    const emptyCopy = canIngest
      ? `Connected. No decisions yet — paste a transcript or PRD to <code style="background:var(--bg-dark);padding:1px 5px;border-radius:3px">/bicameral-ingest</code>.`
      : `Connected. No decisions yet — record decisions in Bicameral to populate this feed.`;
    return `
      <div style="padding:16px 0;font-size:0.85rem;color:var(--text-muted)">
        ${emptyCopy}
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

export function renderErrorBlock(state) {
  if (!state.error) return '';
  return `
    <div class="cc-bicameral-error" style="margin-top:8px;padding:8px;background:rgba(239,68,68,0.1);border-radius:4px;color:var(--accent-red);font-size:0.78rem">
      ${esc(state.error)}
    </div>
  `;
}
