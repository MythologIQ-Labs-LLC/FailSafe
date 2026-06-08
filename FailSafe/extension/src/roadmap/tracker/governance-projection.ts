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

export interface FeatureRow {
  id: string;
  feature: string;
  code: string;
  test: string;
  status: string;
}

/** Parse the `| ID | Feature | Doc | Code | Test | Status | Notes |` table. */
export function parseFeatureIndex(featureIndex: string): FeatureRow[] {
  const out: FeatureRow[] = [];
  for (const line of (featureIndex || '').split('\n')) {
    const m = /^\|\s*(FX\d+)\s*\|(.+)$/.exec(line.trim());
    if (!m) continue;
    const cells = line.split('|').map((c) => c.trim());
    // cells: ['', ID, Feature, Doc, Code, Test, Status, Notes, '']
    if (cells.length < 7) continue;
    out.push({ id: cells[1], feature: cells[2], code: cells[4], test: cells[5], status: cells[6] });
  }
  return out;
}

/** Coarse capability area = the top-level segment of the first code path, after
 *  normalizing build-prefix noise. */
function areaOf(code: string): string {
  const firstPath = (code || '').trim().split(/[\s(,;]/)[0];
  let segs = firstPath.split('/').filter(Boolean);
  // Normalize the occasional fully-qualified `FailSafe/extension/src/...` build
  // prefix, then a leading `src/` (#198 — was leaking a stray `FailSafe` vertical).
  // Only strip `extension` as part of the `FailSafe/extension` pair — never on its
  // own, since `extension/` is itself a real capability area.
  if (segs[0] === 'FailSafe' && segs[1] === 'extension') segs = segs.slice(2);
  if (segs[0] === 'src') segs = segs.slice(1);
  // Top-level capability area (e.g. integrations / roadmap / qorelogic). This is
  // a coarse DEFAULT taxonomy; FX859 operator categorization refines it on top.
  return segs[0] || 'other';
}

// #198 — areas that are infrastructure, not product capabilities. Skipped so they
// don't surface as verticals on the tracker (the operator never wants a "tests" or
// "CI" vertical). `scripts` is intentionally NOT here — it is substantive tooling.
const NON_CAPABILITY_AREAS = new Set(['test', 'tests', '.github', 'github', 'node_modules', 'out', 'dist']);

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
 *  program; anchored to the plan's Target Version rc when it declares one. */
function phasesFromPlans(plans: PlanDoc[], programs: TrackerProgram[]): TrackerPhase[] {
  const known = new Set(programs.map((p) => p.key));
  const phases: TrackerPhase[] = plans.map((p) => ({
    prog: known.has(p.theme) ? p.theme : 'other',
    key: p.slug,
    rc: p.targetVersion ?? '',
    w: 1,
    title: p.title,
  }));
  const perProg = new Map<string, number>();
  for (const ph of phases) perProg.set(ph.prog, (perProg.get(ph.prog) ?? 0) + 1);
  for (const ph of phases) ph.w = Math.max(1, Math.round(100 / (perProg.get(ph.prog) || 1)));
  return phases;
}

function verticalsFromFeatureIndex(rows: FeatureRow[]): TrackerVertical[] {
  const groups = new Map<string, FeatureRow[]>();
  for (const r of rows) {
    // The FEATURE_INDEX Code column is mixed: modern rows carry real file paths,
    // legacy rows carry component-IDs (e.g. "C001"). Only path-coded rows map to
    // a meaningful capability area — skip the legacy component-ID rows so each
    // doesn't become its own vertical.
    const firstPath = (r.code || '').trim().split(/[\s(,;]/)[0];
    if (!firstPath.includes('/')) continue;
    const area = areaOf(r.code);
    // #198 — skip infra areas + any area that is actually a leaked filename
    // (ends in a file extension, e.g. a root `package.json` row → `package.json`).
    if (NON_CAPABILITY_AREAS.has(area) || /\.[a-z0-9]+$/i.test(area)) continue;
    (groups.get(area) ?? groups.set(area, []).get(area)!).push(r);
  }
  let i = 0;
  const out: TrackerVertical[] = [];
  for (const [area, members] of groups) {
    out.push({
      key: area.replace(/[/]/g, '-'),
      name: humanizeArea(area),
      accent: ACCENTS[i++ % ACCENTS.length],
      summary: `${members.length} feature(s) — projected from the governance feature index.`,
      functionality: members.map((m) => m.feature),
      backend: members.map((m) => '`' + (m.code.split(/[\s(]/)[0]) + '`'),
    });
  }
  return out;
}

export interface GovernanceSources {
  metaLedger: string;
  featureIndex: string;
  repo?: string;
  /** Plan docs (`.failsafe/governance/plans/*.md`) → programs/phases (A.1b, #195).
   *  Optional + degrade-safe: absent -> programs/phases stay empty. */
  plans?: Array<{ slug: string; content: string }>;
}

/** Project a TrackerManifest from the governance artifacts. */
export function projectTrackerManifest(sources: GovernanceSources): TrackerManifest {
  const entries = parseLedgerEntries(sources.metaLedger);
  const rcs = rcsFromLedger(entries);
  const decisions = decisionsFromLedger(entries);
  const verticals = verticalsFromFeatureIndex(parseFeatureIndex(sources.featureIndex));
  const planDocs = parsePlans(sources.plans ?? []);
  const programs = programsFromPlans(planDocs);
  const phases = phasesFromPlans(planDocs, programs);

  return {
    repo: sources.repo,
    meta: {
      eyebrow: 'Governance ledger · development tracker',
      title: 'Governed tracker',
      titleEm: sources.repo ? `for ${sources.repo}` : 'from the governance ledger',
      sub: 'Projected from the SHIELD governance ledger (META_LEDGER + FEATURE_INDEX + plans). A view of governance, not a PR scrape.',
      metaRow: [
        { label: 'Source', value: 'Governance ledger' },
        { label: 'Releases', value: String(rcs.length) },
        { label: 'Programs', value: String(programs.length) },
        { label: 'Verticals', value: String(verticals.length) },
        { label: 'Decisions', value: String(decisions.length) },
      ],
      footer: 'Projected by FailSafe from docs/META_LEDGER.md + docs/FEATURE_INDEX.md + .failsafe/governance/plans/ (governed-repo authoritative source).',
      decisions,
    },
    programs,
    phases,
    rcs,
    verticals,
  };
}
