// FailSafe Command Center — Learn-tab essay list (Phase 3 of FailSafe Learn v2).
//
// RD: leaf webview module. Filters the lesson registry to `learn.essay.*`
// anchors and renders ALL of them as cards on the Learn tab. The acceptance-
// criteria and option-evaluation templates are embedded per-anchor —
// operator-binding per the research-brief addendum. Returns an HTML STRING.
// Returns '' when education is disabled (gate parallel to renderGlossary).
//
// **The essay list is the curriculum directory — every essay always renders**
// (regardless of any per-anchor nudge dismissal). The "Mark as read" control
// on each card suppresses ONLY the contextual relevant-now badge, not the
// card itself. The relevant-now badge is driven by the lesson trigger engine
// (see lessonTriggers.ts + learn.js); dismissing the nudge for an anchor
// writes a session-scoped flag that the trigger gate respects, but the
// curriculum stays browsable.

import { LESSONS } from '../../../education/lessons.js';

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function resolveBody(lesson, proficiency) {
  const order = [proficiency, 'beginner', 'intermediate', 'advanced'];
  for (const level of order) {
    const body = lesson && lesson.body ? lesson.body[level] : undefined;
    if (typeof body === 'string' && body.trim().length > 0) return body;
  }
  return '';
}

// Operator-binding templates per the research-brief Codex addendum.
const ACCEPTANCE_TEMPLATE =
  'I am changing [specific behavior] for [user/context] so that [outcome].\n' +
  'It is done when [observable condition 1], [observable condition 2], and ' +
  '[non-goal/risk boundary].\n' +
  'I will verify it by [command/manual check] and by checking [edge case].';

const OPTION_TABLE_ROWS = [
  ['Which option is smallest?', 'Smaller changes are easier to understand, test, and undo.'],
  ['Which option changes the fewest files?', 'More touched files usually means more blast radius.'],
  ['Which option adds dependencies or config?', 'Dependencies and config changes create maintenance and security risk.'],
  ['Which option can I verify clearly?', 'If the check is unclear, the option is not ready.'],
  ['Which option can I explain back?', 'If you cannot explain it, ask the agent for a smaller or clearer option.'],
  ['Which option is easiest to reverse?', 'Reversibility matters when the agent is wrong.'],
];

function renderTemplate(anchor) {
  if (anchor === 'learn.essay.acceptance-criteria') {
    return [
      '<details class="cc-learn-essay-template">',
      '<summary>Acceptance-criteria template (copy and fill in)</summary>',
      `<pre><code>${escapeHtml(ACCEPTANCE_TEMPLATE)}</code></pre>`,
      '</details>',
    ].join('');
  }
  if (anchor === 'learn.essay.choose-agent-option') {
    const rows = OPTION_TABLE_ROWS.map(
      ([q, why]) =>
        `<tr><td>${escapeHtml(q)}</td><td>${escapeHtml(why)}</td></tr>`,
    ).join('');
    return [
      '<details class="cc-learn-essay-template">',
      '<summary>Option-evaluation table</summary>',
      '<table class="cc-learn-option-table"><thead><tr><th>Question</th><th>Why it matters</th></tr></thead>',
      `<tbody>${rows}</tbody></table>`,
      '</details>',
    ].join('');
  }
  return '';
}

function renderEssayCard(lesson, proficiency, isRelevantNow) {
  const safeAnchor = escapeHtml(lesson.anchor);
  const safeTerm = escapeHtml(lesson.term);
  const safeBody = escapeHtml(resolveBody(lesson, proficiency));
  const relevantBadge = isRelevantNow
    ? '<span class="cc-learn-essay-relevant-now" data-relevant-now="true">Relevant for what you are doing now</span>'
    : '';
  const ackButton = isRelevantNow
    ? `<button type="button" class="cc-learn-essay-ack" data-learn-essay-ack="${safeAnchor}">Mark as read</button>`
    : '';
  const cls = `cc-learn-essay-card${isRelevantNow ? ' cc-learn-essay-card--relevant' : ''}`;
  return [
    `<article class="${cls}" data-essay-anchor="${safeAnchor}" data-relevant-now="${isRelevantNow ? 'true' : 'false'}">`,
    '<header class="cc-learn-essay-card-head">',
    `<h3 class="cc-learn-essay-title">${safeTerm}</h3>`,
    relevantBadge,
    '</header>',
    `<p class="cc-learn-essay-body">${safeBody}</p>`,
    renderTemplate(lesson.anchor),
    ackButton,
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

  // Sort: anchors with a firing trigger come first (relevant-now), rest in
  // their registry order. Dismissed-for-nudge anchors are NOT removed here —
  // their badge is suppressed via the trigger engine's dismissed gate
  // (applyCaps), which prevents them from appearing in `triggerResults` at all.
  const sorted = [
    ...lessons.filter((l) => fired.has(l.anchor)),
    ...lessons.filter((l) => !fired.has(l.anchor)),
  ];

  const cards = sorted
    .map((l) => renderEssayCard(l, proficiency, fired.has(l.anchor)))
    .join('');

  return [
    '<section class="cc-card cc-learn-essay-list" id="cc-learn-essay-list">',
    '<header class="cc-learn-essay-list-head">',
    '<h2 class="cc-learn-essay-list-title">Software development craft</h2>',
    '<p class="cc-learn-essay-list-intro">Slow down to speed up. Short essays you can read at your own pace; the ones most relevant to what you are doing now appear first.</p>',
    '</header>',
    cards,
    '</section>',
  ].join('');
}

const ACK_PREFIX = 'fs-learn-nudge-dismissed:';

/**
 * Wire the "Mark as read" controls. Clicking sets a session-scoped flag
 * (sessionStorage) so the trigger engine's dismissed gate suppresses the
 * relevant-now badge for that anchor for the rest of the session. The essay
 * card itself stays — only the badge + this button disappear on the next
 * render. Falls back to a no-op if sessionStorage is unavailable.
 */
export function bindEssayAck(root) {
  const scope = root || (typeof document !== 'undefined' ? document : null);
  if (!scope || typeof scope.querySelectorAll !== 'function') return;

  scope.querySelectorAll('[data-learn-essay-ack]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const anchor = btn.getAttribute('data-learn-essay-ack') || '';
      try {
        if (typeof sessionStorage !== 'undefined' && sessionStorage) {
          sessionStorage.setItem(ACK_PREFIX + anchor, '1');
        }
      } catch (_e) { /* ignore */ }
      // Strip the badge + this button from the card immediately so the
      // operator sees feedback without waiting for the next hub render.
      const card = btn.closest ? btn.closest('article.cc-learn-essay-card') : null;
      if (card) {
        card.setAttribute('data-relevant-now', 'false');
        card.classList.remove('cc-learn-essay-card--relevant');
        const badge = card.querySelector('.cc-learn-essay-relevant-now');
        if (badge && badge.parentNode) badge.parentNode.removeChild(badge);
        if (btn.parentNode) btn.parentNode.removeChild(btn);
      }
    });
  });
}
