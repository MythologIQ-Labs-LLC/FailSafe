// FailSafe Command Center — Learn-tab essay jump-strip (plan-learn-tab-
// visual-rebuild Phase 2, FX619). Direction-B graft per ui-designer
// 2026-05-24 dispatch: a compact sticky horizontal anchor strip at the top
// of the Read sub-view. Buys TOC discoverability + at-a-glance relevant-now
// overview without sacrificing Direction A's card-stack robustness.
//
// Leaf data + pure-render module — no DOM, no state. Returns HTML string.
// Consumer (learn-essay-list.js) embeds the output at the top of the
// essay-list section AND adds matching `id="cc-learn-essay-<slug>"` to each
// essay card so the anchor hrefs resolve via browser-native scroll.
//
// Compliance: no scoring, no progress. The relevant-now dot is structural
// (mirrors the per-card badge), not a measurement.

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Derive a URL-hash-safe slug from a lesson anchor. */
export function slugForAnchor(anchor) {
  return String(anchor || '').replace(/^learn\.essay\./, '');
}

/**
 * Render the sticky horizontal jump-strip for the Read sub-view.
 *
 * @param {Array<{anchor: string, term: string, accent?: string}>} essays
 *        ordered list of essays (sort already applied by the caller — the
 *        relevant-now anchors come first in the essay-list render but the
 *        strip preserves the same caller-supplied order). `accent` is the CC
 *        token name (green/cyan/gold/orange/red) used for the hover-color
 *        modifier class — derived from ESSAY_ACCENT_MAP at the caller.
 * @param {Set<string>|Array<string>} relevantAnchors
 *        set of essay anchors that have a firing contextual trigger; the
 *        adjacent anchor in the strip gets a relevant-now dot.
 * @returns {string} HTML for an `<aside role="navigation">` containing N
 *        anchor links; '' when essays is empty.
 */
export function renderEssayJumpStrip(essays, relevantAnchors) {
  const list = Array.isArray(essays) ? essays : [];
  if (list.length === 0) return '';
  const relevant = relevantAnchors instanceof Set
    ? relevantAnchors
    : new Set(Array.isArray(relevantAnchors) ? relevantAnchors : []);

  const items = list.map((e, idx) => {
    const safeAnchor = escapeHtml(e.anchor);
    const safeTerm = escapeHtml(e.term);
    const slug = escapeHtml(slugForAnchor(e.anchor));
    const isRelevant = relevant.has(e.anchor);
    const accentCls = e.accent ? ` cc-learn-essay-jump-anchor--accent-${escapeHtml(e.accent)}` : '';
    const dot = isRelevant
      ? '<span class="cc-learn-essay-jump-dot" aria-label="Relevant now" title="Relevant now">●</span>'
      : '';
    return [
      `<a class="cc-learn-essay-jump-anchor${accentCls}" `
        + `data-jump-anchor="${safeAnchor}" `
        + `href="#cc-learn-essay-${slug}">`,
      `<span class="cc-learn-essay-jump-anchor-num">${idx + 1}.</span>`,
      ` <span class="cc-learn-essay-jump-anchor-term">${safeTerm}</span>`,
      dot,
      '</a>',
    ].join('');
  }).join('');

  return [
    '<aside class="cc-learn-essay-jump" role="navigation" aria-label="Jump to essay">',
    items,
    '</aside>',
  ].join('');
}
