// Tracker manifest generator (GH #174) — PURE core. Turns gathered repo signal
// (merged PRs + CHANGELOG + repo slug) into a TrackerManifest draft: programs
// from conventional-commit scopes, phases from substantive PRs, verticals from
// the CHANGELOG's latest section, decisions from ADR references.
//
// PURE: no git/fs/network/gh — the caller (manifest-sources.ts) gathers the
// inputs and passes plain data, so this is fully deterministic + unit-testable.
// Output is a DRAFT for operator review, never a final authored manifest.

import type {
  TrackerManifest, TrackerProgram, TrackerPhase, TrackerVertical, TrackerAgent,
} from './tracker-model';

/** One merged PR, as gathered from `gh pr list` (or git log). */
export interface GeneratorPr {
  number: number;
  title: string;
  mergedAt?: string;
}

export interface ManifestSources {
  /** owner/repo slug (e.g. "BicameralAI/bicameral-integrations"). */
  repo: string;
  prs: GeneratorPr[];
  /** Raw CHANGELOG.md text (may be empty). */
  changelog: string;
}

// A small, stable accent palette (same hues the FailSafe manifest uses).
const ACCENTS = ['#38d6c8', '#e7b04b', '#f0728f', '#7aa2f7', '#9ece6a', '#bb9af7', '#ff9e64'];
// PR types that carry product substance (become phases); the rest are noise.
const SUBSTANTIVE = new Set(['feat', 'fix', 'perf', 'refactor']);

interface ConventionalCommit { type: string; scope?: string; subject: string }

/** Parse `type(scope): subject` / `type: subject`; falls back to the raw title. */
export function parseConventional(title: string): ConventionalCommit {
  const m = /^([a-z]+)(?:\(([a-z0-9-]+)\))?(?:!)?:\s*(.+)$/i.exec(title.trim());
  if (!m) return { type: 'other', subject: title.trim() };
  return { type: m[1].toLowerCase(), scope: m[2]?.toLowerCase(), subject: m[3].trim() };
}

/** A program key for a PR: its commit SCOPE, else the "other" bucket. (A bare
 *  type like "feat" is not a meaningful program name, so scope-less PRs fold.) */
function programKeyOf(c: ConventionalCommit): string {
  return c.scope ?? 'other';
}

function titleCase(key: string): string {
  return key.replace(/[-_]/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
}

/**
 * Programs from the substantive PRs' conventional-commit scopes. A scope is a
 * program only if it carries >= 2 substantive PRs; lighter scopes fold into a
 * single "Other" program so the tracker isn't fragmented into singletons.
 */
export function programsFromPrs(prs: GeneratorPr[]): TrackerProgram[] {
  const counts = new Map<string, number>();
  for (const pr of prs) {
    const c = parseConventional(pr.title);
    if (!SUBSTANTIVE.has(c.type)) continue;
    const k = programKeyOf(c);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  // Real scopes become programs at >= 2 PRs; the "other" bucket + singleton
  // scopes fold into a single "Other" program (no fragmentation).
  const keys = [...counts.entries()].filter(([k, n]) => k !== 'other' && n >= 2).map(([k]) => k).sort();
  const foldCount = [...counts.entries()].filter(([k, n]) => k === 'other' || n < 2).reduce((s, [, n]) => s + n, 0);
  const programs: TrackerProgram[] = keys.map((k, i) => ({
    key: k, name: titleCase(k), accent: ACCENTS[i % ACCENTS.length],
  }));
  if (foldCount > 0) programs.push({ key: 'other', name: 'Other', accent: ACCENTS[programs.length % ACCENTS.length] });
  return programs;
}

/** Phases: one per substantive PR, mapped to its program (or "other"); even
 *  weight within a program; anchored to its `pr-<N>` rc. */
export function phasesFromPrs(prs: GeneratorPr[], programs: TrackerProgram[]): TrackerPhase[] {
  const known = new Set(programs.map((p) => p.key));
  const phases: TrackerPhase[] = [];
  for (const pr of prs) {
    const c = parseConventional(pr.title);
    if (!SUBSTANTIVE.has(c.type)) continue;
    const k = programKeyOf(c);
    const prog = known.has(k) ? k : (known.has('other') ? 'other' : k);
    phases.push({
      prog, key: `PR${pr.number}`, rc: `pr-${pr.number}`, w: 1,
      title: c.subject, what: pr.title,
    } as TrackerPhase);
  }
  // Even weight per program (the dashboard normalizes; integers keep YAML clean).
  const perProg = new Map<string, number>();
  for (const ph of phases) perProg.set(ph.prog, (perProg.get(ph.prog) ?? 0) + 1);
  for (const ph of phases) (ph as { w: number }).w = Math.max(1, Math.round(100 / (perProg.get(ph.prog) || 1)));
  return phases;
}

/** Verticals from the latest CHANGELOG section's top-level bullets (each bullet
 *  → a vertical; bold lead or first clause names it). */
export function verticalsFromChangelog(changelog: string, programs: TrackerProgram[]): TrackerVertical[] {
  const section = /(^|\n)##\s+[^\n]*\n([\s\S]*?)(?=\n##\s|\n*$)/.exec(changelog);
  const body = section?.[2] ?? '';
  const bullets = body.split(/\n(?=- )/).map((b) => b.trim()).filter((b) => b.startsWith('- '));
  const verticals: TrackerVertical[] = [];
  for (let i = 0; i < bullets.length && verticals.length < 6; i++) {
    const text = bullets[i].replace(/^- /, '').replace(/\s+/g, ' ').trim();
    const bold = /\*\*([^*]+)\*\*/.exec(text);
    const name = (bold?.[1] ?? text.split(/[:.,(]/)[0]).trim().slice(0, 48);
    if (!name) continue;
    verticals.push({
      key: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 32) || `area-${i}`,
      name,
      accent: programs[i % Math.max(1, programs.length)]?.accent ?? ACCENTS[i % ACCENTS.length],
      summary: text.slice(0, 200),
    } as TrackerVertical);
  }
  return verticals;
}

/**
 * FX887 — propose one agent-discovery mapping per program (a DRAFT the operator
 * confirms via the keep/drop/rename taxonomy step). `vertical` is set only when a
 * parallel vertical key exists; `patterns` is the program/scope token; `evidence`
 * is the distinct release anchors of that program's phases. Pure + deterministic.
 */
export function agentsFromPrograms(
  programs: TrackerProgram[], verticals: TrackerVertical[], phases: TrackerPhase[],
): TrackerAgent[] {
  const vertKeys = new Set(verticals.map((v) => v.key));
  return programs.map((p) => {
    const evidence = [...new Set(phases.filter((ph) => ph.prog === p.key && ph.rc).map((ph) => ph.rc))];
    return {
      key: p.key, name: p.name, program: p.key,
      ...(vertKeys.has(p.key) ? { vertical: p.key } : {}),
      patterns: [p.key],
      ...(evidence.length ? { evidence } : {}),
    };
  });
}

/** Decisions from ADR references in the CHANGELOG (`ADR-0008 …`). */
function decisionsFromChangelog(changelog: string): Array<{ decision: string; drivenBy: string; evidence: string }> {
  const out: Array<{ decision: string; drivenBy: string; evidence: string }> = [];
  const seen = new Set<string>();
  for (const m of changelog.matchAll(/ADR-(\d{3,4})([^.\n]*)/g)) {
    const id = `ADR-${m[1]}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const desc = m[2].replace(/^[\s):,\-—]+/, '').replace(/\s+/g, ' ').trim();
    out.push({
      decision: desc ? `${id}: ${desc.slice(0, 90)}` : id,
      drivenBy: 'Recorded architecture decision',
      evidence: 'CHANGELOG',
    });
    if (out.length >= 6) break;
  }
  return out;
}

/** Build a TrackerManifest DRAFT from gathered sources. Deterministic. */
export function generateTrackerManifest(sources: ManifestSources): TrackerManifest {
  const prs = [...sources.prs].sort((a, b) => a.number - b.number);
  const programs = programsFromPrs(prs);
  const phases = phasesFromPrs(prs, programs);
  const verticals = verticalsFromChangelog(sources.changelog, programs);
  const agents = agentsFromPrograms(programs, verticals, phases);
  const decisions = decisionsFromChangelog(sources.changelog);
  const name = sources.repo.split('/').pop() ?? sources.repo;
  return {
    repo: sources.repo,
    meta: {
      eyebrow: `${titleCase(name)} · development tracker`,
      title: 'Generated tracker',
      titleEm: `for ${titleCase(name)}`,
      sub: 'Auto-generated draft from merged PRs + CHANGELOG. Refine programs, phases, and verticals in docs/roadmap/programs.yaml.',
      metaRow: [
        { label: 'Cadence', value: 'PR-incremental' },
        { label: 'Merged PRs', value: String(prs.length) },
        { label: 'Programs', value: String(programs.length) },
      ],
      footer: 'Generated by FailSafe from GitHub PR history + CHANGELOG. A draft — operator-refined.',
      ...(decisions.length ? { decisions } : {}),
    },
    programs,
    phases,
    verticals,
    agents,
  } as TrackerManifest;
}
