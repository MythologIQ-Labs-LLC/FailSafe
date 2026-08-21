// FailSafe Command Center — Brainstorm Density Status (FX244 Tranche B/webview-density audit).
// Tiny leaf: keeps the toolbar's always-visible node/edge count label truthful.
// Pure disclosure — no cap, no virtualization, no threshold. BrainstormGraph
// already computes { nodeCount, edgeCount, duplicatesRemoved } via getStats();
// nothing rendered it, so density was invisible to the operator at any graph
// size, and the edge count an operator authored could silently read lower
// than what they entered with no signal -- duplicatesRemoved now accumulates
// across every dedup path (server-fetch/seed AND the mergeNodes route every
// manual/voice node add funnels through), and resets to 0 alongside every
// clear operation so it never discloses a merge against edges that no longer
// exist in the current graph.

const STATUS_CLASS = 'cc-bs-density-status';

/**
 * Updates the toolbar's node/edge count label in place. `root` may be a
 * Document or any Element that contains the label (callers should scope to
 * their own container rather than the global document); falls back to the
 * global document when omitted. No-op (returns null) when there is no
 * document/root or the label isn't in the DOM yet — callers do not need to
 * guard.
 */
export function updateDensityStatus(root, stats = {}) {
  const r = root || (typeof document !== 'undefined' ? document : null);
  if (!r) return null;
  const el = r.querySelector('.' + STATUS_CLASS);
  if (!el) return null;
  const nodeCount = Number.isFinite(stats.nodeCount) ? stats.nodeCount : 0;
  const edgeCount = Number.isFinite(stats.edgeCount) ? stats.edgeCount : 0;
  const duplicatesRemoved = Number.isFinite(stats.duplicatesRemoved) ? stats.duplicatesRemoved : 0;
  const nodeWord = nodeCount === 1 ? 'node' : 'nodes';
  const edgeWord = edgeCount === 1 ? 'edge' : 'edges';
  let text = `${nodeCount} ${nodeWord} · ${edgeCount} ${edgeWord}`;
  if (duplicatesRemoved > 0) {
    const dupWord = duplicatesRemoved === 1 ? 'duplicate edge' : 'duplicate edges';
    text += ` (${duplicatesRemoved} ${dupWord} merged)`;
  }
  el.textContent = text;
  return el;
}
