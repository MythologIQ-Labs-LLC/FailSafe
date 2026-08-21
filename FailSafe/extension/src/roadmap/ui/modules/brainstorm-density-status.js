// FailSafe Command Center — Brainstorm Density Status (FX244 Tranche B/webview-density audit).
// Tiny leaf: keeps the toolbar's always-visible node/edge count label truthful.
// Pure disclosure — no cap, no virtualization, no threshold. BrainstormGraph
// already computes { nodeCount, edgeCount } via getStats(); nothing rendered
// it, so density was invisible to the operator at any graph size.

const STATUS_CLASS = 'cc-bs-density-status';

/**
 * Updates the toolbar's node/edge count label in place. No-op (returns null)
 * when there is no document or the label isn't in the DOM yet — callers do
 * not need to guard.
 */
export function updateDensityStatus(doc, stats = {}) {
  const d = doc || (typeof document !== 'undefined' ? document : null);
  if (!d) return null;
  const el = d.querySelector('.' + STATUS_CLASS);
  if (!el) return null;
  const nodeCount = Number.isFinite(stats.nodeCount) ? stats.nodeCount : 0;
  const edgeCount = Number.isFinite(stats.edgeCount) ? stats.edgeCount : 0;
  const nodeWord = nodeCount === 1 ? 'node' : 'nodes';
  const edgeWord = edgeCount === 1 ? 'edge' : 'edges';
  el.textContent = `${nodeCount} ${nodeWord} · ${edgeCount} ${edgeWord}`;
  return el;
}
