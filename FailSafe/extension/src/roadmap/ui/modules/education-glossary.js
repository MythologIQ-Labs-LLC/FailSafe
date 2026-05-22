// FailSafe Command Center — Education glossary surface (Phase 6c).
//
// RD-6: leaf webview module. Depends only on the lesson registry's
// `glossaryLessons()` selector. Renders the collapsed-by-default "FailSafe
// Glossary" section as an HTML STRING so it is safe to interpolate directly
// into the Settings innerHTML template. Returns the empty string when
// education is disabled.
//
// Each glossary term is itself a collapsed <details> expander (reusing the
// .cc-edu-lesson styling/escaping conventions from education-lesson.js), so a
// PM/CX reader scans the term list and opens only what they want explained.

import { glossaryLessons } from '../../../education/lessons.js';

// HTML-escape glossary copy before interpolation. Glossary bodies are static
// today, but escaping keeps the surface safe if content ever varies and
// mirrors the education-lesson.js convention.
function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Resolve a glossary lesson body for the requested proficiency, falling back
// to the simplest authored level so a reader always sees an explanation.
function resolveBody(lesson, proficiency) {
  const order = [proficiency, 'beginner', 'intermediate', 'advanced'];
  for (const level of order) {
    const body = lesson && lesson.body ? lesson.body[level] : undefined;
    if (typeof body === 'string' && body.trim().length > 0) return body;
  }
  return '';
}

// Render a single glossary term as a collapsed expandable entry.
function renderTerm(lesson, proficiency) {
  const safeAnchor = escapeHtml(lesson.anchor);
  const safeTerm = escapeHtml(lesson.term);
  const safeBody = escapeHtml(resolveBody(lesson, proficiency));
  return [
    `<details class="cc-edu-glossary-term" data-edu-glossary-anchor="${safeAnchor}">`,
    '<summary class="cc-edu-glossary-term-summary">',
    `<span class="cc-edu-glossary-term-label">${safeTerm}</span>`,
    '</summary>',
    '<div class="cc-edu-glossary-term-body">',
    `<p class="cc-edu-glossary-term-text">${safeBody}</p>`,
    '</div>',
    '</details>',
  ].join('');
}

/**
 * Render the "FailSafe Glossary" section as an HTML string.
 *
 * A collapsed-by-default outer <details> section; inside, every
 * glossaryLessons() term is its own collapsed expander. Returns the empty
 * string when education is disabled so the Settings template stays safe.
 *
 * @param {{enabled?:boolean, proficiency?:string}} cfg  education settings.
 * @returns {string} glossary section markup, or '' when education is disabled.
 */
export function renderGlossary(cfg) {
  const enabled = !!(cfg && cfg.enabled);
  if (!enabled) return '';

  const proficiency = (cfg && cfg.proficiency) || 'beginner';
  const lessons = glossaryLessons();
  if (!lessons || lessons.length === 0) return '';

  const terms = lessons.map((l) => renderTerm(l, proficiency)).join('');

  // The section is a `cc-card` wrapper holding a collapsed <details> — the
  // <details> sits INSIDE the card padding (not as the card itself) so its
  // summary is never flush with a neighbouring card's hit box.
  return [
    '<div class="cc-card cc-edu-glossary-card">',
    '<details class="cc-edu-glossary" id="cc-edu-glossary">',
    '<summary class="cc-edu-glossary-summary">',
    '<span class="cc-edu-glossary-icon" aria-hidden="true">?</span>',
    '<span class="cc-edu-glossary-title">FailSafe Glossary</span>',
    `<span class="cc-edu-glossary-count">${lessons.length} terms</span>`,
    '</summary>',
    '<div class="cc-edu-glossary-body">',
    '<p class="cc-edu-glossary-intro">Plain-language explanations of the ',
    'FailSafe and agentic-coding vocabulary. Expand a term to read more.</p>',
    `<div class="cc-edu-glossary-list">${terms}</div>`,
    '</div>',
    '</details>',
    '</div>',
  ].join('');
}
