// #548 — Console taxonomy drift. Compares a declared tracker taxonomy (programs.yaml
// or the operator's tracker-config.yaml) with the Console's real navigation
// (CONSOLE_VERTICALS): per Console vertical, which sub-view labels the declared
// `functionality` is missing, which it adds, and whether the shared labels are out
// of order. PURE and TOTAL: any input (malformed rows, scalars, odd keys) yields a
// valid report and never throws, so a caller can never be pushed onto a fallback path.

import { CONSOLE_VERTICALS, type ConsoleVerticalSpec } from './governance-projection';

export interface VerticalDrift {
  key: string;
  name: string;
  /** The declared taxonomy has a vertical with this key. */
  declared: boolean;
  /** Console sub-view labels the declared functionality lacks. */
  missing: string[];
  /** Declared labels that are not this vertical's sub-views, plus repeats. */
  extra: string[];
  /** The labels both share appear in a different order. */
  outOfOrder: boolean;
}

export interface TaxonomyDrift {
  /** A majority of the Console vertical keys are declared, so the comparison is made. */
  applies: boolean;
  /** Distinct declared keys that name a Console vertical. */
  matched: number;
  consoleVerticals: number;
  /** Console verticals that are undeclared, miss or add labels, or are out of order. */
  drifted: number;
  /** One per Console vertical, in Console order; empty when `applies` is false. */
  verticals: VerticalDrift[];
  /** Declared keys naming no Console vertical, and repeated keys. */
  unmatched: string[];
}

export const NOT_A_TEXT_LABEL = '(not a text label)';

/** The label of one functionality line: the leading `**Label**`, else the whole line. */
export function functionalityLabel(entry: unknown): string {
  if (typeof entry !== 'string') return NOT_A_TEXT_LABEL;
  const line = entry.trim();
  if (!line) return NOT_A_TEXT_LABEL;
  if (line.startsWith('**')) {
    const end = line.indexOf('**', 2);
    if (end > 2) return line.slice(2, end).trim();
  }
  return line;
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  Object.prototype.toString.call(v) === '[object Object]';

/** A row key as text: strings, and numbers or booleans as written; anything else (an
 *  object, even one with an odd `toString`) has no key. Never throws. */
function keyOf(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return '';
}

/** First declared row per key (Map, so `__proto__` is an ordinary key) + repeats. */
function indexDeclared(verticals: unknown): { byKey: Map<string, unknown[]>; repeated: string[] } {
  const byKey = new Map<string, unknown[]>();
  const repeated: string[] = [];
  for (const row of Array.isArray(verticals) ? verticals : []) {
    if (!isPlainObject(row)) continue;
    const key = keyOf(row.key);
    if (!key) continue;
    if (byKey.has(key)) { repeated.push(`${key} (repeated)`); continue; }
    byKey.set(key, Array.isArray(row.functionality) ? row.functionality : []);
  }
  return { byKey, repeated };
}

function compareVertical(spec: ConsoleVerticalSpec, functionality: unknown[] | undefined): VerticalDrift {
  const want = spec.subviews.map((s) => s.label);
  if (functionality === undefined) {
    return { key: spec.key, name: spec.name, declared: false, missing: want, extra: [], outOfOrder: false };
  }
  const seen = new Set<string>();
  const extra: string[] = [];
  const shared: string[] = [];
  for (const label of functionality.map(functionalityLabel)) {
    if (!want.includes(label) || seen.has(label)) { extra.push(label); continue; }
    seen.add(label);
    shared.push(label);
  }
  const missing = want.filter((l) => !seen.has(l));
  const consoleOrder = want.filter((l) => seen.has(l));
  const outOfOrder = shared.some((l, i) => l !== consoleOrder[i]);
  return { key: spec.key, name: spec.name, declared: true, missing, extra, outOfOrder };
}

/** Drift of a declared `verticals` list against the Console navigation. Never throws. */
export function computeTaxonomyDrift(
  verticals: unknown,
  consoleVerticals: ConsoleVerticalSpec[] = CONSOLE_VERTICALS,
): TaxonomyDrift {
  const { byKey, repeated } = indexDeclared(verticals);
  const consoleKeys = new Set(consoleVerticals.map((v) => v.key));
  const matched = consoleVerticals.filter((v) => byKey.has(v.key)).length;
  const unmatched = [...[...byKey.keys()].filter((k) => !consoleKeys.has(k)), ...repeated];
  const applies = matched * 2 > consoleVerticals.length;
  const rows = applies ? consoleVerticals.map((v) => compareVertical(v, byKey.get(v.key))) : [];
  const drifted = rows.filter((r) => !r.declared || r.missing.length || r.extra.length || r.outOfOrder).length;
  return { applies, matched, consoleVerticals: consoleVerticals.length, drifted, verticals: rows, unmatched };
}
