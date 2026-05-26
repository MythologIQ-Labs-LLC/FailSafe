// FailSafe Console - Learn glossary filtering and sorting helpers.

const INTEGRATION_ANCHORS = new Set(['glossary.bicameral-integration']);

export const GLOSSARY_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'swe', label: 'Software craft' },
  { key: 'fs', label: 'FailSafe' },
  { key: 'integration', label: 'Integrations' },
];

export function glossaryTag(lesson) {
  if (typeof lesson.anchor === 'string' && lesson.anchor.startsWith('glossary.swe.')) return 'swe';
  if (INTEGRATION_ANCHORS.has(lesson.anchor)) return 'integration';
  return 'fs';
}

export function glossaryTagLabel(key) {
  return GLOSSARY_FILTERS.find((tag) => tag.key === key)?.label || 'FailSafe';
}

export function sortGlossaryLessons(lessons, direction) {
  const sign = direction === 'za' ? -1 : 1;
  return [...lessons].sort((a, b) => sign * String(a.term || '').localeCompare(
    String(b.term || ''),
    undefined,
    { sensitivity: 'base' },
  ));
}

export function filterGlossaryLessons(lessons, tag) {
  if (!tag || tag === 'all') return lessons;
  return lessons.filter((lesson) => glossaryTag(lesson) === tag);
}
