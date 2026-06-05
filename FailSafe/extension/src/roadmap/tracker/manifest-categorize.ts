// Tracker manifest categorization — the PURE half of the operator-decision step
// (GH #174). Programs and verticals are a TAXONOMY, not discovered facts: how an
// operator slices their work is a human judgment the machine can only guess at
// (from commit scopes / CHANGELOG bullets). The VS Code shell collects the
// operator's keep/drop/rename/fold decisions; THIS module applies them to the
// generated draft deterministically. Phases (discovered facts) are preserved —
// only their program assignment is remapped when a program is dropped/folded.

import type {
  TrackerManifest, TrackerProgram, TrackerVertical,
} from './tracker-model';

/** The fallback program a dropped category's phases fold into when the operator
 *  picks "Other". Mirrors the generator's own uncategorized bucket. */
const OTHER: TrackerProgram = { key: 'other', name: 'Other', accent: '#7aa2f7' };

/**
 * The operator's category decisions, collected by the interactive VS Code shell.
 * Keys are ORIGINAL generated keys (renames change only the display `name`).
 */
export interface CategoryDecisions {
  /** Programs the operator kept, in display order; `name` may be a rename. */
  programs: Array<{ key: string; name: string }>;
  /** For each DROPPED program, the program key its phases fold into ('other' ok). */
  folds: Array<{ from: string; into: string }>;
  /** Verticals the operator kept, in display order; `name` may be a rename. */
  verticals: Array<{ key: string; name: string }>;
}

/**
 * Apply the operator's category decisions to a generated manifest. Pure — returns
 * a new manifest; never mutates `base`. Dropped programs' phases are reassigned to
 * their fold target (or a synthesized "Other"); kept programs/verticals carry
 * their renames while preserving accent and all other vertical fields.
 */
export function applyCategoryDecisions(base: TrackerManifest, d: CategoryDecisions): TrackerManifest {
  const basePrograms = base.programs ?? [];
  const basePhases = base.phases ?? [];
  const baseVerticals = base.verticals ?? [];

  const accentOf = (key: string): string =>
    basePrograms.find((p) => p.key === key)?.accent ?? OTHER.accent;

  const keptKeys = new Set(d.programs.map((p) => p.key));
  const foldMap = new Map(d.folds.map((f) => [f.from, f.into]));

  // Kept programs, renamed, accent preserved from the generated draft.
  const programs: TrackerProgram[] = d.programs.map((p) => ({
    key: p.key, name: p.name, accent: accentOf(p.key),
  }));

  // Reassign phases whose program was dropped. A fold target that was itself
  // dropped degrades to "Other" so no phase is ever orphaned to a dead key.
  let needOther = false;
  const phases = basePhases.map((ph) => {
    if (keptKeys.has(ph.prog)) return ph;
    let into = foldMap.get(ph.prog) ?? 'other';
    if (into !== 'other' && !keptKeys.has(into)) into = 'other';
    if (into === 'other' && !keptKeys.has('other')) needOther = true;
    return { ...ph, prog: into };
  });
  if (needOther && !programs.some((p) => p.key === 'other')) programs.push({ ...OTHER });

  // Verticals: keep the operator's selection, apply renames, preserve everything
  // else (summary / functionality / backend / accent).
  const vRename = new Map(d.verticals.map((v) => [v.key, v.name]));
  const verticals: TrackerVertical[] = baseVerticals
    .filter((v) => vRename.has(v.key))
    .map((v) => ({ ...v, name: vRename.get(v.key) ?? v.name }));

  // Refresh a "Programs" count metaRow if the generator emitted one.
  const meta = base.meta ? { ...base.meta } : undefined;
  if (meta?.metaRow) {
    meta.metaRow = meta.metaRow.map((r) =>
      r.label === 'Programs' ? { ...r, value: String(programs.length) } : r);
  }

  return { ...base, meta, programs, phases, verticals };
}
