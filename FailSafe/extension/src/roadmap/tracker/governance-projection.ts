/**
 * governance-projection — project a Development Tracker manifest from the repo's
 * SHIELD governance artifacts (A.1, the tracker-as-sidecar direction). This is
 * the GOVERNED-repo authoritative source: the tracker is a VIEW of the governance
 * ledger, not a PR scraper. The FX857 PR/CHANGELOG generator stays as the
 * UNGOVERNED-repo fallback; FX859 operator categorization sits on top of either.
 *
 * First slice (most-structured sources): `docs/META_LEDGER.md` → release axis
 * (rcs, from DELIVER entries) + decisions (meta.decisions, from every sealed
 * entry); `docs/FEATURE_INDEX.md` → verticals (FX rows grouped by code area).
 * Plans (.failsafe/governance/plans/* → phases/programs) are a noted follow-up.
 *
 * PURE — string in, TrackerManifest out. No I/O (the caller reads the files), so
 * the projection is deterministically testable. Degrade-safe: empty/garbage in →
 * a valid (empty) manifest, never a throw.
 */

import type { TrackerManifest, TrackerRc, TrackerVertical, TrackerProgram, TrackerPhase } from './tracker-model';

const ACCENTS = ['#38d6c8', '#e7b04b', '#f0728f', '#7aa2f7', '#9ece6a', '#bb9af7', '#ff9e64'];

export interface LedgerEntry {
  n: number;
  phase: string;
  title: string;
  version?: string;
  tag?: string;
  date?: string;
  decision?: string;
}

/** Parse `### Entry #N: <title>` blocks → structured entries (markers are stable
 *  across the Merkle ledger: `**Phase**`, `**Version**`, `**Tag**`, `## Decision`). */
export function parseLedgerEntries(metaLedger: string): LedgerEntry[] {
  const text = metaLedger || '';
  const out: LedgerEntry[] = [];
  // Split on the entry header; keep the header with its block.
  const parts = text.split(/(?=^### Entry #\d+:)/m);
  for (const block of parts) {
    const head = /^### Entry #(\d+):\s*(.+)$/m.exec(block);
    if (!head) continue;
    const n = parseInt(head[1], 10);
    const title = head[2].trim();
    const phase = (/^\*\*Phase\*\*:\s*(.+)$/m.exec(block)?.[1] || '').trim().split(/\s+/)[0];
    const version = /^\*\*Version\*\*:\s*(.+)$/m.exec(block)?.[1]?.trim();
    const tag = /^\*\*Tag\*\*:\s*(.+)$/m.exec(block)?.[1]?.trim();
    const date = /^\*\*Date\*\*:\s*(.+)$/m.exec(block)?.[1]?.trim();
    // First non-empty paragraph under `## Decision` (stop at the next `##`).
    let decision: string | undefined;
    const dec = /^## Decision\s*$([\s\S]*?)(?=^## |$(?![\s\S]))/m.exec(block);
    if (dec) {
      const para = dec[1].split(/\n\s*\n/).map((s) => s.trim()).find(Boolean);
      if (para) decision = para.replace(/\s+/g, ' ').trim().slice(0, 300);
    }
    out.push({ n, phase, title, version, tag, date, decision });
  }
  return out;
}

// --- Verticals = the product's 7 Console surfaces (the AUTHORITATIVE taxonomy) ---
// Verticals are NOT code directories. They are the user-facing product surfaces, and
// the SOURCE OF TRUTH is the Console Center tab nav + renderer wiring:
//   src/roadmap/ui/command-center.html  (tab nav, data-target keys)
//   src/roadmap/ui/command-center.js    (`renderers` map: each tab → its sub-views)
// The projection is pure (no DOM), so these are pinned here as a constant and a
// DRIFT-GUARD test (governance-projection.test.ts) parses command-center.js and fails
// if this list diverges from the real Console. Summaries are from docs/COMPONENT_HELP.md.
// (Supersedes the earlier FEATURE_INDEX path-grouping, which grouped IMPLEMENTATION
//  directories — sentinel/genesis/qorelogic/… — and so misrepresented the product.)

export interface ConsoleVerticalSpec {
  /** Vertical identity (product slug). */
  key: string;
  /** The command-center `renderers` key / tab `data-target` (drift-guard anchor). */
  tab: string;
  /** Product label. */
  name: string;
  summary: string;
  /** Sub-view labels (the TabGroup labels) — the real "functionality" of the surface. */
  subviews: string[];
  /** Config is a dependency of every other surface, not a peer feature area. */
  secondary?: boolean;
}

export const CONSOLE_VERTICALS: ConsoleVerticalSpec[] = [
  { key: 'monitor', tab: 'overview', name: 'Monitor',
    summary: 'Live status + trust posture at a glance — the sidebar Monitor and Console Overview (trust snapshot, operation stream, threat & chain status).',
    subviews: ['Overview'] },
  { key: 'learn', tab: 'learn', name: 'Learn',
    summary: 'Onboarding & education — governance concepts, lessons, and glossary.',
    subviews: ['Learn'] },
  { key: 'agents', tab: 'agents', name: 'Agents',
    summary: 'Agent observability — what agents did and how governance responded.',
    subviews: ['Operations', 'Timeline', 'Genome', 'Replay'] },
  { key: 'governance', tab: 'governance', name: 'Governance',
    summary: 'Audit & compliance — the Merkle audit log, risk register, policies and the L3 approval queue.',
    subviews: ['Audit Log', 'Risks', 'Compliance'] },
  { key: 'workspace', tab: 'workspace', name: 'Workspace',
    summary: 'Workspace tools — skills, the ideation mindmap, and the development tracker.',
    subviews: ['Skills', 'Mindmap', 'Tracker'] },
  { key: 'integrations', tab: 'integrations', name: 'Integrations',
    summary: 'Third-party integrations — the catalog plus governed connectors.',
    subviews: ['Catalog', 'Bicameral', 'Open Design', 'MCP Catalog', 'Agent Governance'] },
  { key: 'config', tab: 'settings', name: 'Config',
    summary: 'System config — theme and local console preferences; a dependency of every other surface.',
    subviews: ['Settings'], secondary: true },
];

/** Project the 7 fixed Console verticals (with their real sub-views as functionality). */
function verticalsFromConsole(): TrackerVertical[] {
  return CONSOLE_VERTICALS.map((v, i) => ({
    key: v.key,
    name: v.name,
    accent: ACCENTS[i % ACCENTS.length],
    summary: v.summary,
    functionality: v.subviews,
  }));
}

function humanizeArea(area: string): string {
  return area.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function rcsFromLedger(entries: LedgerEntry[]): TrackerRc[] {
  const byId = new Map<string, TrackerRc>();
  for (const e of entries) {
    if (e.phase !== 'DELIVER' || !e.version) continue;
    const id = (e.tag || `v${e.version}`).trim();
    if (byId.has(id)) continue;
    byId.set(id, { id, state: 'prod', tag: e.tag, note: e.date, summary: e.decision });
  }
  return [...byId.values()];
}

type MetaDecision = { decision: string; drivenBy: string; evidence: string };

function decisionsFromLedger(entries: LedgerEntry[]): MetaDecision[] {
  return entries
    .filter((e) => e.decision)
    .map((e) => ({
      decision: e.decision!.slice(0, 160),
      drivenBy: e.phase || 'GATE',
      evidence: `Entry #${e.n}`,
    }));
}

// --- A.1b (#195): plans → programs (theme buckets) + phases (one per plan) ---
// Plans are the least-structured governance source: 56/61 carry no Target Version,
// so a plan IS the unit of planned work → one PHASE each. PROGRAMS are theme buckets
// derived from the plan slug's leading token (e.g. plan-qor-* → "qor", plan-v5-* →
// "v5"); singleton themes fold into "Other" (mirrors FX857 programsFromPrs, no
// fragmentation). This keeps the programs axis to ~8-10 buckets, not 61.

export interface PlanDoc {
  slug: string;
  title: string;
  theme: string;
  targetVersion?: string;
}

/** Parse plan docs (slug + raw markdown) → structured PlanDoc. Pure. */
export function parsePlans(plans: Array<{ slug: string; content: string }>): PlanDoc[] {
  return plans.map(({ slug, content }) => {
    const titleM = /^#\s*Plan:\s*(.+?)\s*$/m.exec(content || '');
    const verM = /\*\*Target Version\*\*[:\s]*v?([0-9]+\.[0-9]+(?:\.[0-9]+)?)/.exec(content || '');
    const cleanSlug = slug.replace(/\.md$/i, '').replace(/^plan-/i, '');
    return {
      slug: cleanSlug,
      title: titleM ? titleM[1] : cleanSlug,
      theme: themeOf(cleanSlug),
      targetVersion: verM ? `v${verM[1]}` : undefined,
    };
  });
}

/** Theme = leading slug token, with versioned prefixes (v5, v4.10.1) collapsed to
 *  their major family (v5, v4) so round/cleanup plans group together. */
function themeOf(cleanSlug: string): string {
  const head = cleanSlug.split('-')[0] || 'other';
  const vm = /^v(\d+)/.exec(head);
  return vm ? `v${vm[1]}` : head;
}

function programsFromPlans(plans: PlanDoc[]): TrackerProgram[] {
  const counts = new Map<string, number>();
  for (const p of plans) counts.set(p.theme, (counts.get(p.theme) ?? 0) + 1);
  // A theme becomes a program at >= 2 plans; singletons fold into "Other".
  const keys = [...counts.entries()].filter(([, n]) => n >= 2).map(([k]) => k).sort();
  const foldCount = [...counts.entries()].filter(([, n]) => n < 2).reduce((s, [, n]) => s + n, 0);
  const programs: TrackerProgram[] = keys.map((k, i) => ({
    key: k, name: humanizeArea(k), accent: ACCENTS[i % ACCENTS.length],
  }));
  if (foldCount > 0) programs.push({ key: 'other', name: 'Other', accent: ACCENTS[programs.length % ACCENTS.length] });
  return programs;
}

/** One phase per plan, mapped to its theme program (or "other"); even weight per
 *  program. Anchored to the plan's Target Version ONLY when that version is a real
 *  release (in `knownReleaseIds`); otherwise unanchored (rc='') — a Target Version
 *  is a plan's intent, not a ship record, and may name a release that never shipped
 *  (e.g. v4.9.3). Unanchored phases count toward their program but aren't pinned to
 *  the timeline (validated as `phase-unanchored` WARN, never a `phase-unknown-rc`
 *  abort). */
function phasesFromPlans(
  plans: PlanDoc[],
  programs: TrackerProgram[],
  knownReleaseIds?: string[],
): TrackerPhase[] {
  const known = new Set(programs.map((p) => p.key));
  const axis = knownReleaseIds ? new Set(knownReleaseIds) : null;
  const phases: TrackerPhase[] = plans.map((p) => ({
    prog: known.has(p.theme) ? p.theme : 'other',
    key: p.slug,
    rc: p.targetVersion && axis?.has(p.targetVersion) ? p.targetVersion : '',
    w: 1,
    title: p.title,
  }));
  const perProg = new Map<string, number>();
  for (const ph of phases) perProg.set(ph.prog, (perProg.get(ph.prog) ?? 0) + 1);
  for (const ph of phases) ph.w = Math.max(1, Math.round(100 / (perProg.get(ph.prog) || 1)));
  return phases;
}

export interface GovernanceSources {
  metaLedger: string;
  /** Reserved: feature-level mapping of FEATURE_INDEX rows INTO the 7 Console
   *  verticals is a follow-up. No longer used to DERIVE verticals (that produced an
   *  implementation-directory taxonomy, not the product surfaces). Optional. */
  featureIndex?: string;
  repo?: string;
  /** Plan docs (`.failsafe/governance/plans/*.md`) → programs/phases (A.1b, #195).
   *  Optional + degrade-safe: absent -> programs/phases stay empty. */
  plans?: Array<{ slug: string; content: string }>;
  /** The resolved release axis (rc ids). When supplied, plan phases anchor to a
   *  Target Version only if it's a real release here; otherwise unanchored (A.2b,
   *  #202). Absent -> every plan phase is unanchored. */
  knownReleaseIds?: string[];
}

/** Project a TrackerManifest from the governance artifacts. */
export function projectTrackerManifest(sources: GovernanceSources): TrackerManifest {
  const entries = parseLedgerEntries(sources.metaLedger);
  const rcs = rcsFromLedger(entries);
  const decisions = decisionsFromLedger(entries);
  const verticals = verticalsFromConsole();
  const planDocs = parsePlans(sources.plans ?? []);
  const programs = programsFromPlans(planDocs);
  const phases = phasesFromPlans(planDocs, programs, sources.knownReleaseIds);

  return {
    repo: sources.repo,
    meta: {
      eyebrow: 'Governance ledger · development tracker',
      title: 'Governed tracker',
      titleEm: sources.repo ? `for ${sources.repo}` : 'from the governance ledger',
      sub: "Projected from the SHIELD governance ledger (META_LEDGER + plans) across the product's Console surfaces. A view of governance, not a PR scrape.",
      metaRow: [
        { label: 'Source', value: 'Governance ledger' },
        { label: 'Releases', value: String(rcs.length) },
        { label: 'Programs', value: String(programs.length) },
        { label: 'Verticals', value: String(verticals.length) },
        { label: 'Decisions', value: String(decisions.length) },
      ],
      footer: 'Projected by FailSafe from docs/META_LEDGER.md + .failsafe/governance/plans/ + the Console surface taxonomy (governed-repo authoritative source).',
      decisions,
    },
    programs,
    phases,
    rcs,
    verticals,
  };
}
