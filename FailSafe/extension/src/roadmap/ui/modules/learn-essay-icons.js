// FailSafe Command Center — Learn-tab essay icon registry (Section 4 razor split).
//
// Leaf data module — no DOM, no imports. Extracted from `learn-essay-list.js`
// to keep that renderer under the 250L razor. Each icon is an inline SVG
// string using `currentColor` so the icon inherits color from the surrounding
// CSS palette (theme-aware in both light + dark VS Code themes).
//
// Phase 1 of plan-learn-tab-multimode-redesign — 5 icons, one per SWE-craft
// essay (operator may reassign at implement gate per plan Open Question #1):
//   clock     → slow-down-to-speed-up
//   target    → scope-before-prompt
//   checklist → acceptance-criteria
//   fork      → choose-agent-option
//   magnifier → verify-output
//
// `viewBox="0 0 24 24"`, `stroke="currentColor" fill="none"`. Single-path or
// small composed-path icons (no external font, no asset bundle).

const ICONS = {
  clock:
    '<svg class="cc-learn-essay-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>',
  target:
    '<svg class="cc-learn-essay-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>',
  checklist:
    '<svg class="cc-learn-essay-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<polyline points="4 7 6 9 10 5"/><polyline points="4 14 6 16 10 12"/><line x1="13" y1="7" x2="20" y2="7"/><line x1="13" y1="14" x2="20" y2="14"/><line x1="4" y1="21" x2="20" y2="21"/></svg>',
  fork:
    '<svg class="cc-learn-essay-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<circle cx="6" cy="5" r="2"/><circle cx="18" cy="5" r="2"/><circle cx="12" cy="19" r="2"/><path d="M6 7 L6 12 Q6 14 8 14 L16 14 Q18 14 18 12 L18 7"/><line x1="12" y1="14" x2="12" y2="17"/></svg>',
  magnifier:
    '<svg class="cc-learn-essay-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<circle cx="10" cy="10" r="6"/><line x1="14.5" y1="14.5" x2="20" y2="20"/></svg>',
};

/**
 * Return the SVG HTML string for an icon key, or '' when the key is missing
 * or unrecognized. Lesson literals MAY omit `icon`; rendering must still work.
 *
 * @param {string|undefined} iconKey  one of clock | target | checklist | fork | magnifier
 * @returns {string} inline SVG HTML, or '' for unknown / missing keys.
 */
export function iconHtml(iconKey) {
  if (typeof iconKey !== 'string') return '';
  return Object.prototype.hasOwnProperty.call(ICONS, iconKey) ? ICONS[iconKey] : '';
}

/** Exported for tests — the set of recognized icon keys (frozen at module load). */
export const ICON_KEYS = Object.freeze(Object.keys(ICONS));
