/**
 * governance-dashboard — the read-only dashboard projection over the shipped
 * FX863 shadow-genome data layer (#196 Phase 1). Pure value-in/value-out: a
 * `ShadowGenomeResult` becomes a `GovernanceDashboardResponse` derived solely
 * from the canonical causal graph (`governanceSubgraph` + `summarizeGenome`).
 * No persistence, no invented causality. Degrade-safe: a disabled/degraded
 * result yields a well-formed zeroed payload (`enabled:false`), never a throw.
 *
 * Canonical semantics (shadow-genome-client / qor-logic): node types
 * checkpoint/state/failure/governance; edge types
 * produced/occurred_during/triggered_by/applies_to. `trustTransitions` +
 * `federation` have no producer in the FX863 layer yet (spec §4 derived
 * concepts) — Phase 1 returns honest empties; real sourcing is spec Phase 5.
 */
import {
  GenomeGraph, ShadowGenomeResult, governanceSubgraph, summarizeGenome,
} from './shadow-genome-client';

export interface GovernanceChainSummary { rootId: string; failureId: string; depth: number; nodeTypes: string[] }
export interface ProjectSurfaceSummary { id: string; label: string; failureCount: number; unresolvedCount: number }
export interface TrustTransitionSummary { from: string; to: string; direction: 'promotion' | 'demotion'; governanceNodeId: string; at: string }
export interface FederationSummary { sourced: boolean; peers: never[]; note?: string }

/** Severity derived from canonical recurrence only (no remediation signal in the graph yet). */
export type IncidentSeverity = 'active' | 'repeated' | 'emerging';
export interface IncidentSummary {
  id: string;            // failure node id — the node/ledger reference
  label: string;         // failure-mode label
  recurrence: number;    // incident edges touching the failure node
  severity: IncidentSeverity;
  governanceRoots: { id: string; label: string }[]; // governance nodes applied to this failure
}

export interface GovernanceDashboardSummary {
  nodeCount: number;
  edgeCount: number;
  unresolvedCount: number;
  recurringPatternCount: number;
  trustTransitionCount: number;
}

export interface GovernanceDashboardResponse {
  generatedAt: string;
  enabled: boolean;
  degraded: boolean;
  summary: GovernanceDashboardSummary;
  typeDistribution: Record<string, number>;
  recentChains: GovernanceChainSummary[];
  projectSurfaces: ProjectSurfaceSummary[];
  incidents: IncidentSummary[];
  /** The canonical governance subgraph topology (trimmed: id/type/label + edge types) for the Genome Map. */
  graph: GenomeGraph;
  trustTransitions: TrustTransitionSummary[];
  federation: FederationSummary;
}

const FEDERATION_UNSOURCED: FederationSummary = {
  sourced: false, peers: [], note: 'Federation peer status is not yet sourced (spec Phase 5).',
};

function zeroed(generatedAt: string): GovernanceDashboardResponse {
  return {
    generatedAt, enabled: false, degraded: true,
    summary: { nodeCount: 0, edgeCount: 0, unresolvedCount: 0, recurringPatternCount: 0, trustTransitionCount: 0 },
    typeDistribution: {}, recentChains: [], projectSurfaces: [], incidents: [],
    graph: { nodes: [], edges: [] }, trustTransitions: [],
    federation: FEDERATION_UNSOURCED,
  };
}

/** Trim the subgraph to the secret-safe topology the Genome Map needs (no metadata passthrough). */
function trimGraph(sub: GenomeGraph): GenomeGraph {
  return {
    nodes: sub.nodes.map((n) => ({ id: n.id, type: n.type, label: n.label })),
    edges: sub.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, type: e.type })),
  };
}

function severityFor(recurrence: number): IncidentSeverity {
  if (recurrence >= 3) return 'active';
  if (recurrence >= 2) return 'repeated';
  return 'emerging';
}

/** One incident per failure node: recurrence (incident edges) + the governance roots applied to it. */
function deriveIncidents(sub: GenomeGraph): IncidentSummary[] {
  const govLabel = new Map(sub.nodes.filter((n) => n.type === 'governance').map((n) => [n.id, n.label] as const));
  return sub.nodes.filter((n) => n.type === 'failure').map((f) => {
    const roots: { id: string; label: string }[] = [];
    let recurrence = 0;
    for (const e of sub.edges) {
      const touches = e.source === f.id || e.target === f.id;
      if (!touches) continue;
      recurrence += 1;
      const other = e.source === f.id ? e.target : e.source;
      if (govLabel.has(other)) roots.push({ id: other, label: govLabel.get(other) as string });
    }
    return { id: f.id, label: f.label, recurrence, severity: severityFor(recurrence), governanceRoots: roots };
  });
}

/** Direct governance→failure causal pairs in the subgraph (depth 1, canonical only). */
function deriveChains(sub: GenomeGraph): GovernanceChainSummary[] {
  const govIds = new Set(sub.nodes.filter((n) => n.type === 'governance').map((n) => n.id));
  const typeOf = new Map(sub.nodes.map((n) => [n.id, n.type] as const));
  const chains: GovernanceChainSummary[] = [];
  for (const e of sub.edges) {
    const root = govIds.has(e.source) ? e.source : (govIds.has(e.target) ? e.target : null);
    if (!root) continue;
    const other = root === e.source ? e.target : e.source;
    if (typeOf.get(other) !== 'failure') continue;
    chains.push({ rootId: root, failureId: other, depth: 1, nodeTypes: ['governance', 'failure'] });
  }
  return chains;
}

/** One surface per governance node, with its incident failure-neighbour count. */
function deriveSurfaces(sub: GenomeGraph): ProjectSurfaceSummary[] {
  const failIds = new Set(sub.nodes.filter((n) => n.type === 'failure').map((n) => n.id));
  return sub.nodes.filter((n) => n.type === 'governance').map((g) => {
    const failures = new Set<string>();
    for (const e of sub.edges) {
      if (e.source === g.id && failIds.has(e.target)) failures.add(e.target);
      if (e.target === g.id && failIds.has(e.source)) failures.add(e.source);
    }
    return { id: g.id, label: g.label, failureCount: failures.size, unresolvedCount: failures.size };
  });
}

/** failure nodes touched by >=2 incident edges (recurrence proxy, canonical-only). */
function countRecurring(sub: GenomeGraph): number {
  const incident = new Map<string, number>();
  for (const e of sub.edges) {
    incident.set(e.source, (incident.get(e.source) ?? 0) + 1);
    incident.set(e.target, (incident.get(e.target) ?? 0) + 1);
  }
  return sub.nodes.filter((n) => n.type === 'failure' && (incident.get(n.id) ?? 0) >= 2).length;
}

export function buildGovernanceDashboard(
  result: ShadowGenomeResult, opts: { generatedAt: string },
): GovernanceDashboardResponse {
  if (!result.ok || result.localOnly || !result.graph) return zeroed(opts.generatedAt);
  const sub = governanceSubgraph(result.graph);
  const sum = summarizeGenome(sub);
  const unresolvedCount = sub.nodes.filter((n) => n.type === 'failure').length;
  return {
    generatedAt: opts.generatedAt, enabled: true, degraded: false,
    summary: {
      nodeCount: sum.nodes, edgeCount: sum.edges, unresolvedCount,
      recurringPatternCount: countRecurring(sub), trustTransitionCount: 0,
    },
    typeDistribution: sum.nodeTypes,
    recentChains: deriveChains(sub),
    projectSurfaces: deriveSurfaces(sub),
    incidents: deriveIncidents(sub),
    graph: trimGraph(sub),
    trustTransitions: [],
    federation: FEDERATION_UNSOURCED,
  };
}
