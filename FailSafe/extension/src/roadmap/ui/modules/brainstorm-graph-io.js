// FailSafe Command Center — Brainstorm Graph Persistence + Repo Seed
// localStorage save/load (FX894: with duplicate-edge repair) and the FX889
// repository-seed operations, relocated from brainstorm-graph.js (#234 LD6
// razor split). Every function takes the BrainstormGraph instance; behavior
// is unchanged apart from the load-time dedupe repair.

import { dedupeEdges } from './brainstorm-edge-identity.js';

export const STORAGE_KEY = 'failsafe-brainstorm-graph';

export function saveLocal(graph) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ nodes: graph.nodes, edges: graph.edges }));
  } catch {}
}

// FX894: legacy localStorage payloads may carry duplicate/malformed edges from
// the pre-idempotency era. Repair on load, persist the repaired set, and
// account the removals so getStats() can surface them.
export function loadLocal(graph) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    graph.nodes = data.nodes || [];
    const repaired = dedupeEdges(data.edges || []);
    graph.edges = repaired.edges;
    if (repaired.removed > 0) {
      graph._duplicatesRemoved = (graph._duplicatesRemoved || 0) + repaired.removed;
      saveLocal(graph);
    }
  } catch {}
}

// FX897 (#235): fx/fy/fz are client-only pin state the server never carries.
// When the server graph wins on reload (fetchGraph server branch), overlay the
// persisted pins by node id so dragged positions survive reload against a
// populated server, not only the server-empty restore path. Server stays the
// source of truth for graph CONTENT; localStorage owns pin POSITION.
function collectPins(nodes) {
  const pins = new Map();
  if (!Array.isArray(nodes)) return pins;
  for (const n of nodes) {
    if (n && n.id != null && (n.fx != null || n.fy != null || n.fz != null)) {
      pins.set(n.id, { fx: n.fx, fy: n.fy, fz: n.fz });
    }
  }
  return pins;
}

function overlayPin(node, pin) {
  if (!pin) return;
  if (pin.fx != null) node.fx = pin.fx;
  if (pin.fy != null) node.fy = pin.fy;
  if (pin.fz != null) node.fz = pin.fz;
}

export function applyPersistedPins(graph) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const pins = collectPins(JSON.parse(raw).nodes);
    for (const n of graph.nodes) overlayPin(n, pins.get(n.id));
  } catch {}
}

// FX889: merge the repository seed graph. By default only fills an EMPTY map
// (never overwrites brainstorm work); `force` re-seeds on demand (the REPO
// button). mergeNodes dedupes by node id AND edge key, so a re-seed is
// idempotent on both cb- nodes and seed edges (FX894).
export async function seedFromRepo(graph, { force = false } = {}) {
  if (!force && graph.nodes.length) return;
  try {
    const res = await fetch('/api/v1/brainstorm/seed');
    const data = await res.json();
    if (data.nodes?.length || data.edges?.length) {
      graph.mergeNodes(data.nodes || [], data.edges || []);
    }
  } catch {}
}

// FX897 (#235): persisted view prefs — {layout, viewMode} are PRESENTATION
// state, stored per workspace under a dedicated key (never in the graph
// payload; server sync does not carry them). Corrupt/absent → safe defaults.
export const VIEW_PREFS_KEY = 'failsafe-brainstorm-view';

const LAYOUTS = new Set(['FORCE', 'TREE', 'CIRCLE']);

export function viewPrefsKey(workspacePath) {
  const identity = workspacePath || 'local';
  return `${VIEW_PREFS_KEY}:${encodeURIComponent(identity)}`;
}

export function loadViewPrefs(workspacePath) {
  try {
    const raw = localStorage.getItem(viewPrefsKey(workspacePath));
    const data = raw ? JSON.parse(raw) : {};
    return {
      layout: LAYOUTS.has(data.layout) ? data.layout : 'FORCE',
      viewMode: data.viewMode === '3D' ? '3D' : '2D',
    };
  } catch {
    return { layout: 'FORCE', viewMode: '2D' };
  }
}

export function saveViewPrefs(prefs, workspacePath) {
  try {
    localStorage.setItem(viewPrefsKey(workspacePath), JSON.stringify({
      layout: prefs.layout,
      viewMode: prefs.viewMode,
    }));
  } catch {}
}

// FX889: strip the operator's brainstorm layer, KEEP the repo seed (source:
// "codebase"), so source facts survive while the user's edits are cleared.
export function clearBrainstormLayer(graph) {
  const before = { nodes: [...graph.nodes], edges: [...graph.edges] };
  const keptIds = new Set(graph.nodes.filter(n => n.source === 'codebase').map(n => n.id));
  const prune = () => {
    graph.nodes = graph.nodes.filter(n => keptIds.has(n.id));
    graph.edges = graph.edges.filter(e => keptIds.has(e.source) && keptIds.has(e.target));
  };
  prune();
  graph._pushUndo({
    type: 'clear-layer',
    forward: prune,
    backward: () => { graph.nodes = [...before.nodes]; graph.edges = [...before.edges]; },
  });
  graph.canvas?.setNodes(graph.nodes);
  graph.canvas?.setEdges(graph.edges, graph.nodes);
  graph.onSelectionChange?.(null);
  graph._saveLocal();
}
