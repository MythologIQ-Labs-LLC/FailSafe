// FailSafe Console - Learn-tab Glossary sub-view.

import { LESSONS, lessonKind } from '../../../education/lessons.js';
import {
  GLOSSARY_FILTERS,
  filterGlossaryLessons,
  glossaryTag,
  glossaryTagLabel,
  sortGlossaryLessons,
} from './learn-glossary-sort.js';

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function matchesQuery(lesson, query) {
  if (!query) return true;
  const beg = lesson.body && lesson.body.beginner;
  const haystack = (lesson.term + ' ' + (typeof beg === 'string' ? beg : '')).toLowerCase();
  for (const token of query.split(/\s+/).filter(Boolean)) {
    if (haystack.indexOf(token) === -1) return false;
  }
  return true;
}

function educationEnabled(hubData) {
  const education = (hubData && hubData.education) || {};
  return education.enabled !== false;
}

function renderRow(lesson, proficiency, expanded) {
  const safeAnchor = escapeHtml(lesson.anchor);
  const safeTerm = escapeHtml(lesson.term);
  const tag = glossaryTag(lesson);
  const safeTag = escapeHtml(glossaryTagLabel(tag));
  const beg = lesson.body && typeof lesson.body.beginner === 'string' ? lesson.body.beginner : '';
  const hasMoreTier =
    (proficiency === 'intermediate' || proficiency === 'advanced') &&
    typeof lesson.body[proficiency] === 'string' &&
    lesson.body[proficiency].length > 0 &&
    lesson.body[proficiency] !== beg;
  const isOpen = expanded.has(lesson.anchor);
  const extraBody = hasMoreTier && isOpen
    ? `<p class="cc-learn-glossary-row-extra">${escapeHtml(lesson.body[proficiency])}</p>`
    : '';
  const toggle = hasMoreTier
    ? `<button type="button" class="cc-learn-glossary-row-expand" data-learn-glossary-expand="${safeAnchor}" aria-expanded="${isOpen ? 'true' : 'false'}">${isOpen ? 'Show less' : `Show ${escapeHtml(proficiency)}`}</button>`
    : '';
  return [
    `<li class="cc-learn-glossary-row" data-anchor="${safeAnchor}">`,
    '<div class="cc-learn-glossary-row-head">',
    `<div class="cc-learn-glossary-row-term">${safeTerm}</div>`,
    `<span class="cc-learn-glossary-tag cc-learn-glossary-tag--${tag}">${safeTag}</span>`,
    '</div>',
    `<p class="cc-learn-glossary-row-body">${escapeHtml(beg)}</p>`,
    extraBody,
    toggle,
    '</li>',
  ].join('');
}

function renderList(label, rows, query, proficiency, expanded) {
  if (rows.length === 0) {
    return [
      '<section class="cc-learn-glossary-section cc-learn-glossary-section--all">',
      `<h3 class="cc-learn-glossary-section-head"><span>${escapeHtml(label)}</span><span class="cc-learn-glossary-section-count">0 matches</span></h3>`,
      `<p class="cc-learn-glossary-section-zero">${query ? 'No matching terms.' : 'No terms available.'}</p>`,
      '</section>',
    ].join('');
  }
  const items = rows.map((l) => renderRow(l, proficiency, expanded)).join('');
  return [
    '<section class="cc-learn-glossary-section cc-learn-glossary-section--all">',
    `<h3 class="cc-learn-glossary-section-head"><span>${escapeHtml(label)}</span><span class="cc-learn-glossary-section-count">${rows.length} term${rows.length === 1 ? '' : 's'}</span></h3>`,
    '<ul class="cc-learn-glossary-list" role="list">',
    items,
    '</ul>',
    '</section>',
  ].join('');
}

export class LearnGlossary {
  constructor() {
    this.container = null;
    this._query = '';
    this._expanded = new Set();
    this._tag = 'all';
    this._sort = 'az';
  }

  render(hubData) {
    if (!this.container) return;
    if (!educationEnabled(hubData)) {
      this.container.innerHTML = '';
      return;
    }
    const education = (hubData && hubData.education) || {};
    const proficiency = education.proficiency || 'beginner';
    this.container.innerHTML = this._build(proficiency);
    this._wire(proficiency);
  }

  destroy() {
    if (this.container) this.container.innerHTML = '';
    this._query = '';
    this._expanded = new Set();
    this._tag = 'all';
    this._sort = 'az';
  }

  _build(proficiency) {
    const all = Object.values(LESSONS).filter((l) => lessonKind(l) === 'glossary');
    const queried = all.filter((l) => matchesQuery(l, this._query));
    const tagged = filterGlossaryLessons(queried, this._tag);
    const filtered = sortGlossaryLessons(tagged, this._sort);
    const label = this._tag === 'all' ? 'All terms' : glossaryTagLabel(this._tag);
    const tagButtons = GLOSSARY_FILTERS.map((tag) => {
      const active = tag.key === this._tag;
      return `<button type="button" class="cc-learn-glossary-filter${active ? ' active' : ''}" data-learn-glossary-filter="${tag.key}" aria-pressed="${active ? 'true' : 'false'}">${escapeHtml(tag.label)}</button>`;
    }).join('');
    return [
      '<section class="cc-card cc-learn-glossary" id="cc-learn-glossary">',
      '<header class="cc-learn-glossary-head">',
      '<h2 class="cc-learn-glossary-title">Glossary</h2>',
      '<p class="cc-learn-glossary-intro">Look up a term by name, category, or sort order.</p>',
      '</header>',
      '<div class="cc-learn-glossary-controls">',
      '<label for="cc-learn-glossary-search-input" class="visually-hidden">Search glossary</label>',
      `<input id="cc-learn-glossary-search-input" type="search" class="cc-learn-glossary-search" data-learn-glossary-search inputmode="search" spellcheck="false" autocomplete="off" placeholder="Search glossary..." value="${escapeHtml(this._query)}" />`,
      '<div class="cc-learn-glossary-filter-row" role="group" aria-label="Filter glossary by tag">',
      tagButtons,
      '<label class="visually-hidden" for="cc-learn-glossary-sort">Sort glossary</label>',
      `<select id="cc-learn-glossary-sort" class="cc-learn-glossary-sort" data-learn-glossary-sort><option value="az"${this._sort === 'az' ? ' selected' : ''}>A-Z</option><option value="za"${this._sort === 'za' ? ' selected' : ''}>Z-A</option></select>`,
      '</div>',
      '</div>',
      `<div class="cc-learn-glossary-results" role="region" aria-live="polite" aria-atomic="false" data-result-count="${filtered.length}">`,
      renderList(label, filtered, this._query, proficiency, this._expanded),
      '</div>',
      '</section>',
    ].join('');
  }

  _wire(proficiency) {
    const root = this.container;
    if (!root || typeof root.querySelector !== 'function') return;
    root.querySelector('[data-learn-glossary-search]')?.addEventListener('input', (e) => {
      this._query = String((e.target && e.target.value) || '').toLowerCase();
      this._rerender(proficiency, true);
    });
    root.querySelectorAll('[data-learn-glossary-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this._tag = btn.getAttribute('data-learn-glossary-filter') || 'all';
        this._rerender(proficiency);
      });
    });
    root.querySelector('[data-learn-glossary-sort]')?.addEventListener('change', (e) => {
      this._sort = String((e.target && e.target.value) || 'az');
      this._rerender(proficiency);
    });
    root.querySelectorAll('[data-learn-glossary-expand]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const anchor = btn.getAttribute('data-learn-glossary-expand') || '';
        if (this._expanded.has(anchor)) this._expanded.delete(anchor);
        else this._expanded.add(anchor);
        this._rerender(proficiency);
      });
    });
  }

  _rerender(proficiency, preserveFocus) {
    if (!this.container) return;
    let caret = null;
    if (preserveFocus) {
      const input = this.container.querySelector('[data-learn-glossary-search]');
      if (input && typeof input.selectionStart === 'number') caret = input.selectionStart;
    }
    this.container.innerHTML = this._build(proficiency);
    this._wire(proficiency);
    if (preserveFocus) {
      const input = this.container.querySelector('[data-learn-glossary-search]');
      if (input) {
        input.focus();
        if (caret !== null && typeof input.setSelectionRange === 'function') {
          try { input.setSelectionRange(caret, caret); } catch (_e) { /* ignore */ }
        }
      }
    }
  }
}
