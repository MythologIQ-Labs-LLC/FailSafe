// Tracker manifest — Bicameral-MCP enrichment (GH #174, Layer 3). PURE.
//
// When the Bicameral MCP integration is connected, its decision graph gives the
// tracker a far deeper understanding than git/CHANGELOG alone: feature areas
// (→ verticals) and governed architecture decisions with status + code bindings
// (→ the decisions ledger + each vertical's functionality/backend).
//
// PURE: takes already-gathered `BicameralFeatureBrief[]` (the caller runs
// `ingest` + `history`) and AUGMENTS a base manifest. Deterministic; no I/O.

import type { TrackerManifest, TrackerVertical } from './tracker-model';
import type { BicameralFeatureBrief, BicameralDecision } from '../../integrations/bicameral';

const ACCENTS = ['#38d6c8', '#e7b04b', '#f0728f', '#7aa2f7', '#9ece6a', '#bb9af7', '#ff9e64'];

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 32) || 'area';
}

/** A short human label for a decision's sync status. */
function statusLabel(status: BicameralDecision['status']): string {
  switch (status) {
    case 'in-sync': return 'In sync';
    case 'drifted': return 'Drifted';
    case 'open-question': return 'Open question';
    case 'unratified': return 'Unratified';
    default: return String(status);
  }
}

/** Unique code-binding file paths across a feature's decisions. */
function bindingPaths(decisions: BicameralDecision[]): string[] {
  const seen = new Set<string>();
  for (const d of decisions) for (const b of d.bindings ?? []) if (b.filePath) seen.add(b.filePath);
  return [...seen];
}

/** Feature areas → decision-aware verticals (functionality = decision titles with
 *  status; backend = the code files those decisions bind to). */
export function verticalsFromBriefs(briefs: BicameralFeatureBrief[]): TrackerVertical[] {
  return briefs
    .filter((b) => b.feature && b.decisions.length)
    .slice(0, 8)
    .map((b, i) => ({
      key: slug(b.feature),
      name: b.feature,
      accent: ACCENTS[i % ACCENTS.length],
      summary: `${b.decisions.length} governed architecture decision${b.decisions.length === 1 ? '' : 's'}.`,
      functionality: b.decisions.slice(0, 6).map((d) => `**${statusLabel(d.status)}** ${d.title}`),
      backend: bindingPaths(b.decisions).slice(0, 5).map((f) => `\`${f}\``),
    } as TrackerVertical));
}

/** All decisions across briefs (deduped by id) → the §06 decisions ledger. */
export function decisionsFromBriefs(
  briefs: BicameralFeatureBrief[],
): Array<{ decision: string; drivenBy: string; evidence: string }> {
  const seen = new Set<string>();
  const byFeature = new Map<string, string>();
  for (const b of briefs) for (const d of b.decisions) if (!byFeature.has(d.id)) byFeature.set(d.id, b.feature);
  const out: Array<{ decision: string; drivenBy: string; evidence: string }> = [];
  for (const b of briefs) {
    for (const d of b.decisions) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      out.push({
        decision: d.title,
        drivenBy: `${byFeature.get(d.id) ?? b.feature} · ${statusLabel(d.status)}`,
        evidence: d.source || 'Bicameral decision record',
      });
      if (out.length >= 10) return out;
    }
  }
  return out;
}

/**
 * Augment a generated manifest with Bicameral decision data. Verticals + the
 * decisions ledger are REPLACED with the decision-aware versions when Bicameral
 * provides them; otherwise the base manifest is returned unchanged (degrade-safe).
 */
export function enrichManifestWithBicameral(
  manifest: TrackerManifest,
  briefs: BicameralFeatureBrief[],
): TrackerManifest {
  if (!briefs.length) return manifest;
  const verticals = verticalsFromBriefs(briefs);
  const decisions = decisionsFromBriefs(briefs);
  return {
    ...manifest,
    ...(verticals.length ? { verticals } : {}),
    meta: {
      ...manifest.meta,
      ...(decisions.length ? { decisions } : {}),
      ...(manifest.meta?.metaRow
        ? { metaRow: upsertMetaRow(manifest.meta.metaRow, 'Decisions', String(new Set(briefs.flatMap((b) => b.decisions.map((d) => d.id))).size)) }
        : {}),
    },
  };
}

function upsertMetaRow(rows: Array<{ label: string; value: string }>, label: string, value: string): Array<{ label: string; value: string }> {
  const next = rows.filter((r) => r.label !== label);
  next.push({ label, value });
  return next;
}
