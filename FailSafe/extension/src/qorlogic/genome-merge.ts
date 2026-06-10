/**
 * genome-merge — ingest BOTH the real (recorded) genome and the reconstructed
 * appendix into one graph for the dashboard (operator direction: "ingest both,
 * account for redundancy"). Real nodes are tagged `provenance: 'recorded'`, appendix
 * nodes keep `'reconstructed'` — per-record honesty so a mixed graph never reads as
 * uniformly live OR uniformly derived.
 *
 * Redundancy: real and appendix ids are disjoint by construction (real `n*`/`e*` vs
 * appendix `lg-*`), but the merge dedups by id defensively and a RECORDED node always
 * wins over a reconstructed one — a real event supersedes its derived shadow. The
 * #213 producer surfaces (trust_transitions / federation_peers) come only from the
 * real genome (the appendix has none).
 *
 * PURE. Degrade-safe: an empty real graph -> the appendix verbatim; an empty appendix
 * -> the real graph verbatim (the appendix never invents trust/federation).
 */

import type { GenomeGraph, GenomeNode, GenomeEdge } from './shadow-genome-client';

export function mergeGenomes(real: GenomeGraph, appendix: GenomeGraph): GenomeGraph {
  const byId = new Map<string, GenomeNode>();
  // Recorded first (real wins): tag any untagged real node as 'recorded'.
  for (const n of real.nodes) byId.set(n.id, { ...n, provenance: n.provenance ?? 'recorded' });
  // Appendix fills gaps only — never overwrites a recorded node.
  for (const n of appendix.nodes) {
    if (!byId.has(n.id)) byId.set(n.id, { ...n, provenance: n.provenance ?? 'reconstructed' });
  }
  const seenEdge = new Set<string>();
  const edges: GenomeEdge[] = [];
  for (const e of [...real.edges, ...appendix.edges]) {
    if (seenEdge.has(e.id)) continue;
    seenEdge.add(e.id);
    edges.push(e);
  }
  const merged: GenomeGraph = { nodes: [...byId.values()], edges };
  // Trust/federation are recorded-only surfaces — carry them from the real genome.
  if (real.trustTransitions) merged.trustTransitions = real.trustTransitions;
  if (real.federationPeers) merged.federationPeers = real.federationPeers;
  return merged;
}
