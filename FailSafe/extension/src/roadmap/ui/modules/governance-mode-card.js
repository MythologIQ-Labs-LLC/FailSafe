// FailSafe Command Center — Governance-Mode Settings Card (Phase 4a).
//
// Extracted from settings.js per the v1 Educational-Component plan (RD-4,
// audit-mandated razor remediation): settings.js was 266 lines, over the
// Section-4 razor. Lifting the governance-mode card to this leaf brings the
// host back under 250 and gives the card a clean micro-lesson host site.
//
// This leaf renders the governance-mode card markup, binds the mode-switch
// buttons, and mounts the `governance-mode` education micro-lesson inside the
// card via renderLesson(). It depends only on escapeHtml + the education
// affordance — no other module state.

import { escapeHtml } from './brainstorm-templates.js';
import { renderLesson, bindLessonDismiss } from './education-lesson.js';

// A1: the leaf carries its own minimal `bindOnce`. settings.js keeps the
// canonical copy for its five other consumers; this is a deliberate
// self-contained redeclaration so the leaf has no settings.js back-import.
const BOUND_ATTR = 'data-cc-bound';
function bindOnce(node, evt, handler) {
  if (!node || node.getAttribute?.(BOUND_ATTR) === '1') return;
  node.addEventListener(evt, handler);
  node.setAttribute?.(BOUND_ATTR, '1');
}

// A1: minimal redeclaration of the shared uppercase-label style. LBL stays in
// settings.js (5 other consumers); the leaf carries its own copy so the
// extracted card is style-identical without importing from the host.
const LBL = 'font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.08em';

/** The three governance modes surfaced as switch buttons. */
export const MODE_OPTIONS = [
  { id: 'observe', label: 'Observe' },
  { id: 'assist', label: 'Assist' },
  { id: 'enforce', label: 'Enforce' },
];

/**
 * Render the governance-mode settings card as an HTML string.
 *
 * @param {object} hub  hub snapshot. `hub.governanceModeState` carries the
 *        current mode + defaulted flag; `hub.education` carries the
 *        {enabled, proficiency} pair threaded from readEducationConfig().
 * @returns {string} card markup including the embedded micro-lesson.
 */
export function renderGovernanceModeCard(hub) {
  const state = hub?.governanceModeState || { mode: 'observe', defaulted: true };
  const current = String(state.mode || 'observe');
  const defaulted = state.defaulted === true;
  const hint = defaulted
    ? `<p style="font-size:0.8rem;color:var(--text-muted);margin:0 0 10px">You're in Observe mode by default. Switch to Assist when ready to enable governance suggestions, or Enforce for hard gating.</p>`
    : '';
  const buttons = MODE_OPTIONS.map((m) => {
    const active = m.id === current;
    const cls = active ? 'cc-btn cc-btn--primary' : 'cc-btn';
    const aria = active ? 'aria-pressed="true"' : '';
    return `<button class="${cls}" data-governance-mode="${escapeHtml(m.id)}" style="font-size:0.8rem;padding:6px 14px" ${aria}>${escapeHtml(m.label)}</button>`;
  }).join('');
  const tag = defaulted ? ' <span style="color:var(--text-muted)">(default)</span>' : '';
  const label = escapeHtml(current.charAt(0).toUpperCase() + current.slice(1));
  // Phase 4a: mount the `governance-mode` micro-lesson inside the card.
  // renderLesson() returns '' when education is disabled / dismissed / has no
  // lesson, so the interpolation is always safe.
  const lesson = renderLesson('governance-mode', hub?.education || {});
  return `<div class="cc-card" id="cc-governance-mode" style="margin-top:16px">
      <div style="${LBL};margin-bottom:8px">Governance Mode</div>
      <div style="font-size:0.9rem;margin-bottom:10px">Mode: <strong data-governance-current>${label}</strong>${tag}</div>
      ${hint}
      <div style="display:flex;gap:8px;flex-wrap:wrap">${buttons}</div>
      ${lesson}
    </div>`;
}

/**
 * Bind the governance-mode switch buttons within `container`.
 * Each button dispatches the host `failsafe.setGovernanceMode` command with
 * its mode as an advisory pre-selection. Idempotent via bindOnce.
 *
 * @param {Element|Document} container  scope holding the rendered card.
 */
export function bindGovernanceModeCard(container) {
  const card = container?.querySelector?.('#cc-governance-mode');
  if (!card) return;
  card.querySelectorAll('[data-governance-mode]').forEach((btn) => {
    bindOnce(btn, 'click', () => {
      const mode = btn.getAttribute('data-governance-mode');
      if (!mode) return;
      // Host command opens a QuickPick; arg is advisory pre-selection only.
      try {
        window.location.href = `command:failsafe.setGovernanceMode?${encodeURIComponent(JSON.stringify([mode]))}`;
      } catch { /* host-managed */ }
    });
  });
  // Wire the embedded micro-lesson's dismiss control so clicking Dismiss
  // removes the expander and persists the dismissed state per-anchor.
  bindLessonDismiss(card);
}
