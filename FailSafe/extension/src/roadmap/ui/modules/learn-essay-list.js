// FailSafe Command Center — Learn-tab essay list renderer (FX609).
//
// Phase 1 of plan-learn-tab-multimode-redesign: sectioned-essay anatomy.
// Each card renders:
//   header  : inline-SVG icon + title + `~Nm read` chip + optional relevant-now badge
//   body    : per-level `SectionBlock[]` → pull-quote (first section only) + N H4 sections;
//             legacy `string` body falls back to a single-section render.
//   template: acceptance-criteria + option-evaluation rendered as inline callouts
//             (dropped the v1 `<details>` wrapper — it hid the templates behind a tiny
//             summary, part of the log-file feel).
//   ack     : `Mark as read` only on relevant-now cards.
//
// Renderer dispatches on body shape via `isSectionBlockBody` (re-exported by
// `lessons.js` from `lesson-types.js`). Returns an HTML STRING; returns ''
// when education is disabled (gate parallel to renderGlossary).
//
// **The essay list is the curriculum directory — every essay always renders**
// (regardless of any per-anchor nudge dismissal). The "Mark as read" control
// suppresses ONLY the contextual relevant-now badge, not the card itself.

import { LESSONS, isSectionBlockBody } from '../../../education/lessons.js';
import { iconHtml } from './learn-essay-icons.js';
import { renderTemplate } from './learn-essay-templates.js';
import { renderEssayJumpStrip, slugForAnchor } from './learn-essay-jump.js';
export { bindEssayAck } from './learn-essay-bindings.js';

// Per-essay accent token mapping (plan-learn-tab-visual-rebuild Phase 2).
// Maps essay anchor → existing CC accent token (no new tokens). The mapping
// lives at the renderer, not in lesson data, so visual identity can change
// independently of content. Tokens defined in command-center.css L11-15 and
// across every theme block (L42-45, L68-71, L85-88, L105-107).
const ESSAY_ACCENT_MAP = {
  'learn.essay.slow-down-to-speed-up': 'green',
  'learn.essay.scope-before-prompt': 'cyan',
  'learn.essay.acceptance-criteria': 'gold',
  'learn.essay.choose-agent-option': 'orange',
  'learn.essay.verify-output': 'red',
};

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Resolve the body value for the requested proficiency, falling back along
// the same chain as `getLesson`. Returns either a string, a SectionBlock[],
// or '' (when no body is authored at any level).
function resolveBody(lesson, proficiency) {
  const order = [proficiency, 'beginner', 'intermediate', 'advanced'];
  for (const level of order) {
    const body = lesson && lesson.body ? lesson.body[level] : undefined;
    if (typeof body === 'string' && body.trim().length > 0) return body;
    if (isSectionBlockBody(body)) return body;
  }
  return '';
}

// Word-count for read-time chip. Counts words across all paragraphs in a
// sectioned body OR across a single-string body. Structural-only — no read-
// state tracking (compliance: no scoring/grading).
function bodyWordCount(body) {
  if (typeof body === 'string') {
    return body.split(/\s+/).filter(Boolean).length;
  }
  if (isSectionBlockBody(body)) {
    let count = 0;
    for (const section of body) {
      for (const p of section.paragraphs) {
        count += p.split(/\s+/).filter(Boolean).length;
      }
    }
    return count;
  }
  return 0;
}

function readTimeMinutes(body) {
  const words = bodyWordCount(body);
  if (words <= 0) return 0;
  return Math.max(1, Math.ceil(words / 200));
}

function renderSectionBlocks(sections) {
  // First section may carry a pull-quote rendered above its paragraphs.
  return sections
    .map((section, idx) => {
      const pull =
        idx === 0 && typeof section.pullQuote === 'string' && section.pullQuote.trim().length > 0
          ? `<blockquote class="cc-learn-essay-pullquote">${escapeHtml(section.pullQuote)}</blockquote>`
          : '';
      const paragraphs = section.paragraphs
        .map((p) => `<p class="cc-learn-essay-paragraph">${escapeHtml(p)}</p>`)
        .join('');
      return [
        '<section class="cc-learn-essay-section">',
        pull,
        `<h4 class="cc-learn-essay-section-heading">${escapeHtml(section.heading)}</h4>`,
        paragraphs,
        '</section>',
      ].join('');
    })
    .join('');
}

function renderBody(body) {
  if (isSectionBlockBody(body)) return renderSectionBlocks(body);
  // Legacy single-string fallback: wrap as a single paragraph (preserves the
  // pre-Phase-1 render contract for any lesson that hasn't been sectioned and
  // for the hostile-fixture test that mutates a body to a string).
  return `<p class="cc-learn-essay-body">${escapeHtml(String(body))}</p>`;
}

function renderEssayCard(lesson, proficiency, isRelevantNow) {
  const safeAnchor = escapeHtml(lesson.anchor);
  const safeTerm = escapeHtml(lesson.term);
  const slug = escapeHtml(slugForAnchor(lesson.anchor));
  const body = resolveBody(lesson, proficiency);
  const minutes = readTimeMinutes(body);
  const readChip =
    minutes > 0
      ? `<span class="cc-learn-essay-readtime" aria-label="${minutes} minute read">~${minutes}m read</span>`
      : '';
  const icon = iconHtml(lesson.icon);
  // A3: badge container always renders (even when no badge); aria-live="polite"
  // so SR users hear the badge when the contextual trigger fires asynchronously.
  const badgeInner = isRelevantNow
    ? '<span class="cc-learn-essay-relevant-now" data-relevant-now="true">Now relevant</span>'
    : '';
  const ackButton = isRelevantNow
    ? `<button type="button" class="cc-learn-essay-ack" data-learn-essay-ack="${safeAnchor}">Mark as read</button>`
    : '';
  const accent = ESSAY_ACCENT_MAP[lesson.anchor];
  const accentCls = accent ? ` cc-learn-essay-card--accent-${accent}` : '';
  const cls = `cc-learn-essay-card${isRelevantNow ? ' cc-learn-essay-card--relevant' : ''}${accentCls}`;
  return [
    `<article class="${cls}" id="cc-learn-essay-${slug}" data-essay-anchor="${safeAnchor}" data-relevant-now="${isRelevantNow ? 'true' : 'false'}">`,
    '<header class="cc-learn-essay-card-head">',
    `<div class="cc-learn-essay-card-head-lead">${icon}<h3 class="cc-learn-essay-title">${safeTerm}</h3></div>`,
    '<div class="cc-learn-essay-card-head-trail">',
    `<span class="cc-learn-essay-relevant-now-region" aria-live="polite" aria-atomic="true">${badgeInner}</span>`,
    readChip,
    '</div>',
    '</header>',
    renderBody(body),
    renderTemplate(lesson.anchor),
    ackButton ? `<footer class="cc-learn-essay-card-foot">${ackButton}</footer>` : '',
    '</article>',
  ].join('');
}

function essayLessons() {
  return Object.values(LESSONS).filter(
    (l) => typeof l.anchor === 'string' && l.anchor.startsWith('learn.essay.'),
  );
}

/**
 * Render the Learn-tab essay list as an HTML string. ALL `learn.essay.*`
 * lessons render — the essay list is the curriculum directory, not a
 * dismissible notification.
 *
 * @param {{enabled?:boolean, proficiency?:string, triggerResults?:Array<{anchor:string,fire:boolean}>}} cfg
 * @returns {string} essay-list markup, or '' when education is disabled.
 */
export function renderEssayList(cfg) {
  const enabled = !!(cfg && cfg.enabled);
  if (!enabled) return '';

  const proficiency = (cfg && cfg.proficiency) || 'beginner';
  const fired = new Set(
    ((cfg && cfg.triggerResults) || [])
      .filter((r) => r && r.fire)
      .map((r) => r.anchor),
  );

  const lessons = essayLessons();
  if (lessons.length === 0) return '';

  const sorted = [
    ...lessons.filter((l) => fired.has(l.anchor)),
    ...lessons.filter((l) => !fired.has(l.anchor)),
  ];

  const cards = sorted
    .map((l) => renderEssayCard(l, proficiency, fired.has(l.anchor)))
    .join('');

  // FX619 Direction-B graft: sticky horizontal jump-strip at top of list.
  // Embeds the same essay set in the same caller-supplied order.
  const jumpEssays = sorted.map((l) => ({
    anchor: l.anchor,
    term: l.term,
    accent: ESSAY_ACCENT_MAP[l.anchor],
  }));
  const jumpStrip = renderEssayJumpStrip(jumpEssays, fired);

  return [
    '<section class="cc-card cc-learn-essay-list" id="cc-learn-essay-list">',
    '<header class="cc-learn-essay-list-head">',
    '<h2 class="cc-learn-essay-list-title">Software development craft</h2>',
    '<p class="cc-learn-essay-list-intro">Slow down to speed up. Short essays you can read at your own pace; the ones most relevant to what you are doing now appear first.</p>',
    '</header>',
    jumpStrip,
    cards,
    '</section>',
  ].join('');
}

