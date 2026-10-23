// FailSafe Command Center — Skill Utilities
// Extracted utilities for skill rendering and tag handling.

import { escapeHtml } from './brainstorm-templates.js';

/** Escape HTML entities (& < > " ') for safe innerHTML and attribute insertion. */
export function escHtml(str) {
  return escapeHtml(str ?? '');
}

/**
 * Lane E: the URL when it resolves to http(s) (relative URLs resolve against the
 * page), else ''. Refuses javascript:, data:, vbscript: and their obfuscations
 * (case, leading control characters, embedded tab/newline), which the URL
 * parser normalises before the scheme is read. Escape the result before
 * interpolating it into markup.
 */
export function safeHttpUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  const base = (typeof location !== 'undefined' && location.href) || 'http://localhost/';
  try {
    const { protocol } = new URL(value, base);
    return protocol === 'http:' || protocol === 'https:' ? value : '';
  } catch {
    return '';
  }
}

/** Convert a tag slug to display format (e.g., "foo-bar" -> "Foo Bar"). */
export function displayTag(tag) {
  return String(tag || '').replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/** Extract normalized tags from a skill object. */
export function skillTags(skill) {
  const tags = Array.isArray(skill?.tags) ? skill.tags : [];
  const fallback = skill?.category ? [skill.category] : [];
  return Array.from(new Set([...tags, ...fallback]
    .map(v => String(v || '').trim().toLowerCase().replace(/\s+/g, '-'))
    .filter(v => v && v !== 'general')));
}
