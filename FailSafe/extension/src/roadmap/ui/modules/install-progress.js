// Shared install-progress component (GH #166). Extracted from
// bicameral-card-render.js so every integration that runs a multi-step install
// (Bicameral today; MCP Catalog + others as they adopt it) renders an identical
// step-list with per-step status icons + inline error text. Pure HTML string
// builders, JSDOM-friendly — no DOM mutation, no fetch.
//
// A "step" is `{ phase: string, status: 'running'|'success'|'error', error?: string }`.
// A "progress" is `{ mode?: string, steps?: Step[], done?: boolean, ok?: boolean }`.

function esc(value) {
  if (value === null || value === undefined) return '';
  const d = (typeof document !== 'undefined') ? document.createElement('div') : null;
  if (d) { d.textContent = String(value); return d.innerHTML; }
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** One install step as an `<li>` with a status icon (+ inline error). */
export function renderInstallStep(step) {
  const icon = step.status === 'success' ? '✓'
    : step.status === 'error' ? '✗'
      : '⏳';
  const errorSpan = step.error
    ? ` <span style="color:var(--accent-red)">${esc(step.error)}</span>`
    : '';
  return `<li style="font-size:0.78rem;color:var(--text-muted)">${icon} ${esc(step.phase)}${errorSpan}</li>`;
}

/**
 * The full step list. `opts.className` adds an integration-specific wrapper class
 * (so existing CSS/test hooks like `cc-bicameral-install-progress` keep working);
 * `opts.label` overrides the "Install" heading prefix.
 */
export function renderInstallProgress(progress, opts = {}) {
  const cls = opts.className ? ` ${opts.className}` : '';
  const label = opts.label || 'Install';
  if (!progress || !progress.steps || progress.steps.length === 0) {
    return `<div style="font-size:0.78rem;color:var(--text-muted);margin-top:8px">Starting ${esc(progress?.mode || '')} install…</div>`;
  }
  const rows = progress.steps.map(renderInstallStep).join('');
  return `
    <div class="cc-install-progress${cls}" style="margin-top:10px;padding:8px 10px;background:rgba(255,255,255,0.03);border-radius:4px">
      <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px">${esc(label)} — ${esc(progress.mode)} mode</div>
      <ul style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:2px">${rows}</ul>
    </div>
  `;
}
