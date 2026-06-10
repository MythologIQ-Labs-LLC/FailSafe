/**
 * shadow-genome-client — consume qor-logic's `shadow_genome_graph` causal graph
 * (#118, now unblocked: the core is shipped in qor-logic). First slice = the DATA
 * layer only (parse / filter / summarize + an off-by-default live loader). The
 * dashboard / trust-level / federation UI surfaces are a deliberate follow-up.
 *
 * Contract (verified against qor/scripts/shadow_genome_graph.py `to_dict`):
 *   { nodes: [{ id, type, label, metadata, maturity? }],
 *     edges: [{ id, source, target, type, metadata }],
 *     trust_transitions: [{ id, from_level, to_level, direction, at, governance_node_id }],
 *     federation_peers: [{ id, name, state, last_sync, origin }] }
 * The #213 producer surfaces (trust_transitions / federation_peers / per-failure-node
 * `maturity`) are parsed tolerantly here and consumed by the governance dashboard
 * (#196 Phase 5). Node types include checkpoint / state / failure / governance / trust. The graph is a
 * projection of qor-logic's append-only shadow-event ledger (`.qor/genome.jsonl`),
 * adjacent to the tracker-as-governance-projection (FX862).
 *
 * Pure functions are deterministic + unit-tested; the live loader's Python call is
 * an injected `RunCommand` (no real subprocess in tests) and OFF by default.
 */

import type { RunCommand } from './PythonInterpreterResolver';

/** #213: a failure node's learning-maturity annotation (derive_maturity_stage). */
export interface GenomeMaturity { stage: string; [k: string]: unknown }
export interface GenomeNode { id: string; type: string; label: string; metadata?: Record<string, unknown>; maturity?: GenomeMaturity }
export interface GenomeEdge { id: string; source: string; target: string; type: string; metadata?: Record<string, unknown> }
/** #213: a CBT/KBT/IBT trust-level transition (camelCased from `to_dict`). */
export interface GenomeTrustTransition { id: string; fromLevel: string; toLevel: string; direction: string; at?: string; governanceNodeId?: string }
/** #213: a federation peer status record (camelCased from `to_dict`). */
export interface GenomeFederationPeer { id: string; name?: string; state: string; lastSync?: string; origin?: string }
export interface GenomeGraph {
  nodes: GenomeNode[];
  edges: GenomeEdge[];
  /** #213 surfaces — present only when the producer emitted them (qor-logic >= 0.111). */
  trustTransitions?: GenomeTrustTransition[];
  federationPeers?: GenomeFederationPeer[];
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const optStr = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';

/** Tolerant parse of the `to_json()` output → a typed graph. Bad input → empty. */
export function parseGenomeGraph(json: string): GenomeGraph {
  let raw: unknown;
  try { raw = JSON.parse(json); } catch { return { nodes: [], edges: [] }; }
  const o = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};
  const nodesIn = Array.isArray(o.nodes) ? o.nodes : [];
  const edgesIn = Array.isArray(o.edges) ? o.edges : [];
  const nodes: GenomeNode[] = nodesIn
    .filter((n): n is Record<string, unknown> => !!n && typeof n === 'object' && typeof (n as Record<string, unknown>).id === 'string')
    .map((n) => {
      const node: GenomeNode = {
        id: str(n.id), type: str(n.type) || 'unknown', label: str(n.label),
        metadata: isObj(n.metadata) ? n.metadata : undefined,
      };
      // #213: failure nodes carry a maturity annotation ({ stage, ... }).
      if (isObj(n.maturity) && typeof n.maturity.stage === 'string') {
        node.maturity = { ...n.maturity, stage: n.maturity.stage };
      }
      return node;
    });
  const edges: GenomeEdge[] = edgesIn
    .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object'
      && typeof (e as Record<string, unknown>).source === 'string' && typeof (e as Record<string, unknown>).target === 'string')
    .map((e) => ({
      id: str(e.id), source: str(e.source), target: str(e.target), type: str(e.type) || 'unknown',
      metadata: (e.metadata && typeof e.metadata === 'object') ? e.metadata as Record<string, unknown> : undefined,
    }));
  const graph: GenomeGraph = { nodes, edges };
  // #213 surfaces — included only when the producer emitted them (degrade-safe:
  // an older genome with no such key leaves the field undefined, never a throw).
  if (Array.isArray(o.trust_transitions)) {
    graph.trustTransitions = o.trust_transitions.filter(isObj).map((t) => ({
      id: str(t.id), fromLevel: str(t.from_level), toLevel: str(t.to_level),
      direction: str(t.direction), at: optStr(t.at), governanceNodeId: optStr(t.governance_node_id),
    }));
  }
  if (Array.isArray(o.federation_peers)) {
    graph.federationPeers = o.federation_peers
      .filter((p): p is Record<string, unknown> => isObj(p) && typeof p.id === 'string')
      .map((p) => ({
        id: str(p.id), name: optStr(p.name), state: str(p.state),
        lastSync: optStr(p.last_sync), origin: optStr(p.origin),
      }));
  }
  return graph;
}

export interface GenomeSummary {
  nodes: number;
  edges: number;
  nodeTypes: Record<string, number>;
  edgeTypes: Record<string, number>;
}

/** Counts by node/edge type — mirrors the Python `snapshot()` shape. */
export function summarizeGenome(g: GenomeGraph): GenomeSummary {
  const nodeTypes: Record<string, number> = {};
  const edgeTypes: Record<string, number> = {};
  for (const n of g.nodes) nodeTypes[n.type] = (nodeTypes[n.type] ?? 0) + 1;
  for (const e of g.edges) edgeTypes[e.type] = (edgeTypes[e.type] ?? 0) + 1;
  return { nodes: g.nodes.length, edges: g.edges.length, nodeTypes, edgeTypes };
}

/**
 * The governance-centric slice: every `governance`-typed node, the edges incident
 * to one, and the neighbour nodes those edges reach (the causal neighbourhood that
 * makes governance decisions traceable). This is the tracker-relevant subgraph.
 */
export function governanceSubgraph(g: GenomeGraph): GenomeGraph {
  const govIds = new Set(g.nodes.filter((n) => n.type === 'governance').map((n) => n.id));
  const edges = g.edges.filter((e) => govIds.has(e.source) || govIds.has(e.target));
  const keep = new Set<string>(govIds);
  for (const e of edges) { keep.add(e.source); keep.add(e.target); }
  const nodes = g.nodes.filter((n) => keep.has(n.id));
  return { nodes, edges };
}

export interface ShadowGenomeOptions {
  /** Injected Python runner (tests pass a stub — no real subprocess). */
  run: RunCommand;
  /** Resolved Python interpreter command (via PythonInterpreterResolver). */
  python: string;
  /** Genome event store; defaults to the qor-logic convention. */
  genomePath?: string;
  /** OFF by default — only `true` runs the subprocess. */
  enabled?: boolean;
}

export interface ShadowGenomeResult {
  ok: boolean;
  localOnly?: boolean;
  graph?: GenomeGraph;
  summary?: GenomeSummary;
  error?: string;
}

// Print the graph as JSON via the shipped `to_json()` — the verified contract.
const EXPORT_SNIPPET =
  'import sys; from qor.scripts.shadow_genome_graph import ShadowGenomeGraph; '
  + 'print(ShadowGenomeGraph(sys.argv[1]).to_json())';

/**
 * Live path: shell qor-logic's `shadow_genome_graph` via the injected Python
 * runner and parse its `to_json()`. OFF by default (no `enabled: true` ⇒ no
 * subprocess). Degrade-safe: a non-zero exit / unparseable output / thrown error
 * → `{ ok: false }`, never a throw. Only the local genome store is read.
 */
export async function loadShadowGenome(opts: ShadowGenomeOptions): Promise<ShadowGenomeResult> {
  if (opts.enabled !== true) return { ok: true, localOnly: true };
  const genomePath = opts.genomePath || '.qor/genome.jsonl';
  try {
    const res = await opts.run(opts.python, ['-c', EXPORT_SNIPPET, genomePath]);
    if (res.code !== 0) {
      return { ok: false, error: 'shadow_genome_graph unavailable (non-zero exit — is qor-logic installed and a genome present?).' };
    }
    const graph = parseGenomeGraph(res.stdout);
    return { ok: true, graph, summary: summarizeGenome(graph) };
  } catch {
    return { ok: false, error: 'shadow_genome_graph load failed (runner or parse error).' };
  }
}
