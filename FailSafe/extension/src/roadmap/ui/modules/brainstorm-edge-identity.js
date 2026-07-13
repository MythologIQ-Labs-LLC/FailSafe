// FailSafe Command Center — Brainstorm Edge Identity (FX894, #234)
// Directed edge identity is (source, target, label). JSON-array encoding is
// collision-proof: LLM-extracted ids are unvalidated external input, so
// delimiter-in-id collisions are reachable with string concatenation (LD3).
// Server twin: brainstormEdgeKey in BrainstormService.ts — keep in sync (LD4).

export function edgeKey(e) {
  return JSON.stringify([e.source, e.target, e.label ?? '']);
}

export function isWellFormedEdge(e) {
  return Boolean(e)
    && typeof e.source === 'string' && e.source.length > 0
    && typeof e.target === 'string' && e.target.length > 0;
}

// Drops malformed edges FIRST, then keeps the first instance per key.
// Returns { edges, removed } where `removed` counts every dropped entry.
export function dedupeEdges(edges) {
  const seen = new Set();
  const kept = [];
  let removed = 0;
  for (const e of edges || []) {
    if (!isWellFormedEdge(e)) { removed += 1; continue; }
    const key = edgeKey(e);
    if (seen.has(key)) { removed += 1; continue; }
    seen.add(key);
    kept.push(e);
  }
  return { edges: kept, removed };
}
