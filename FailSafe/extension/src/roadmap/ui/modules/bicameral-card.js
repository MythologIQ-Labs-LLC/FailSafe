// FailSafe Command Center — Bicameral MCP integration card.
// Renders one of four install states + an optional decision feed.
// Pure HTML + JSDOM-friendly. CSS tokens are FailSafe's; we do not clone
// Bicameral's palette.
//
// B-INT-7: the per-state HTML builders live in `bicameral-card-render.js` to
// keep this module under the Section-4 razor. This module owns the public
// surface (state seed + render orchestrator + DOM binding).
import { mountAdvancedTools } from './bicameral-advanced-tools.js'; // B-INT-1
import {
  renderHeader,
  renderNotInstalled,
  renderInstalledNotConfigured,
  renderConfiguredNotRunning,
  renderRunning,
  renderErrorBlock,
} from './bicameral-card-render.js';

export const INITIAL_BICAMERAL_STATE = {
  installState: 'unknown',
  version: undefined,
  features: [],   // [{ feature: string, decisions: Decision[] }]
  driftByFile: {},
  /** B-BIC-13: tool capabilities reported by the connected MCP client. */
  capabilities: [],
  error: null,
  requesting: false,
  /** Active install progress (when user triggered install from card). */
  installProgress: null, // { mode: 'solo'|'team', steps: InstallStep[], done: boolean, ok: boolean, error?: string }
};

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
  // B-BIC-12: open a decision's bound source file in the editor.
  card.querySelectorAll('[data-action="bicameral-open-binding"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const target = e.currentTarget;
      const filePath = target.getAttribute('data-file-path') || '';
      const rawLine = target.getAttribute('data-start-line');
      const startLine = rawLine ? Number(rawLine) : undefined;
      options.onOpenBinding?.(filePath, startLine);
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
  mountAdvancedTools(card.querySelector('[data-action="bicameral-refresh"]') ? card : null, options.advancedState || {}); // B-INT-1
}
