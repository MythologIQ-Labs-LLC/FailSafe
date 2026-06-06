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

import type { TrackerManifest, TrackerRc, TrackerVertical } from './tracker-model';

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

/** Coarse capability area = the first two path segments of the first code path. */
function areaOf(code: string): string {
  const firstPath = (code || '').trim().split(/[\s(]/)[0];
  let segs = firstPath.split('/').filter(Boolean);
  if (segs[0] === 'src') segs = segs.slice(1); // normalize the mixed src/ prefix
  // Top-level capability area (e.g. integrations / roadmap / qorelogic). This is
  // a coarse DEFAULT taxonomy; FX859 operator categorization refines it on top.
  return segs[0] || 'other';
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

function verticalsFromFeatureIndex(rows: FeatureRow[]): TrackerVertical[] {
  const groups = new Map<string, FeatureRow[]>();
  for (const r of rows) {
    // The FEATURE_INDEX Code column is mixed: modern rows carry real file paths,
    // legacy rows carry component-IDs (e.g. "C001"). Only path-coded rows map to
    // a meaningful capability area — skip the legacy component-ID rows so each
    // doesn't become its own vertical.
    const firstPath = (r.code || '').trim().split(/[\s(]/)[0];
    if (!firstPath.includes('/')) continue;
    const area = areaOf(r.code);
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
}

/** Project a TrackerManifest from the governance artifacts. */
export function projectTrackerManifest(sources: GovernanceSources): TrackerManifest {
  const entries = parseLedgerEntries(sources.metaLedger);
  const rcs = rcsFromLedger(entries);
  const decisions = decisionsFromLedger(entries);
  const verticals = verticalsFromFeatureIndex(parseFeatureIndex(sources.featureIndex));

  return {
    repo: sources.repo,
    meta: {
      eyebrow: 'Governance ledger · development tracker',
      title: 'Governed tracker',
      titleEm: sources.repo ? `for ${sources.repo}` : 'from the governance ledger',
      sub: 'Projected from the SHIELD governance ledger (META_LEDGER + FEATURE_INDEX). A view of governance, not a PR scrape.',
      metaRow: [
        { label: 'Source', value: 'Governance ledger' },
        { label: 'Releases', value: String(rcs.length) },
        { label: 'Verticals', value: String(verticals.length) },
        { label: 'Decisions', value: String(decisions.length) },
      ],
      footer: 'Projected by FailSafe from docs/META_LEDGER.md + docs/FEATURE_INDEX.md (governed-repo authoritative source).',
      decisions,
    },
    programs: [],
    phases: [],
    rcs,
    verticals,
  };
}
