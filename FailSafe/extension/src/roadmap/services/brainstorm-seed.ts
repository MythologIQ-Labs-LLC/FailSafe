// FX889 — Mind Map repository seed (research-brief Phase 4). PURE projection of
// the EXISTING governance/genome graph (recorded Shadow Genome + META_LEDGER
// reconstruction — the same source QorRoute wires) into Brainstorm nodes/edges
// tagged `source:"codebase"`, so the Mind Map can preload repository knowledge
// while keeping it distinct from operator/voice brainstorm work.
//
// PURE: graph in → {nodes,edges} out. No fs/git/network. Deterministic.

import type { BrainstormNode, BrainstormEdge } from "./BrainstormService";

interface GenomeNodeLike { id: string; type?: string; label?: string }
interface GenomeEdgeLike { source: string; target: string; type?: string }
export interface GenomeGraphLike { nodes?: GenomeNodeLike[]; edges?: GenomeEdgeLike[] }

// Genome node type → Brainstorm node type. Genome types are governance / failure /
// state / checkpoint / trust (shadow-genome-client.ts); anything else → Question.
const TYPE_MAP: Record<string, string> = {
  governance: "Architecture",
  failure: "Risk",
  state: "Feature",
  checkpoint: "Feature",
  trust: "Integration",
};

const SEED_PREFIX = "cb-";

/**
 * Project a governance/genome graph into a Brainstorm seed graph. Every node is
 * prefixed (`cb-<id>`) + tagged `source:"codebase"`; edges are re-pointed to the
 * prefixed ids, given a `label` from the genome edge `type`, and dropped when an
 * endpoint node was dropped (so no seeded edge dangles).
 */
export function seedGraphFromGenome(
  graph: GenomeGraphLike,
): { nodes: BrainstormNode[]; edges: BrainstormEdge[] } {
  const nodes: BrainstormNode[] = (graph.nodes ?? []).map((n) => ({
    id: `${SEED_PREFIX}${n.id}`,
    label: (n.label && n.label.trim()) || n.type || n.id,
    type: TYPE_MAP[n.type ?? ""] ?? "Question",
    confidence: 100,
    source: "codebase",
  }));
  const ids = new Set(nodes.map((n) => n.id));
  const edges: BrainstormEdge[] = (graph.edges ?? [])
    .map((e) => ({
      source: `${SEED_PREFIX}${e.source}`,
      target: `${SEED_PREFIX}${e.target}`,
      label: e.type ?? "",
    }))
    .filter((e) => ids.has(e.source) && ids.has(e.target));
  return { nodes, edges };
}
