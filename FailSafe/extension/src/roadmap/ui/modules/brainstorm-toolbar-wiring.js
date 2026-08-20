// FailSafe Command Center — Brainstorm Toolbar Wiring (FX897, #235 LD5 split)
// Layout/view button bindings relocated from BrainstormRenderer.bindToolbar
// (pre-relocation brainstorm.js:176-188), plus the FIT VIEW / RESET VIEW
// controls and view-prefs persistence. `renderer` is the BrainstormRenderer
// instance (owns _getEl/_getAll + graph/canvas).

import { loadViewPrefs, saveViewPrefs } from './brainstorm-graph-io.js';
import { renderListView } from './brainstorm-templates.js';

function highlight(buttons, active, attr) {
  buttons.forEach(b => {
    const on = b.getAttribute(attr) === active;
    b.style.borderColor = on ? 'var(--accent-cyan)' : '';
    b.classList.toggle('active', on);
  });
}

function clearPins(nodes) {
  for (const n of nodes) { delete n.fx; delete n.fy; delete n.fz; }
}

// FX897 LD4: RESET VIEW releases fx/fy/fz pins on BOTH the persistence-layer
// nodes and the live vendor node objects, reheats the (possibly cooled)
// simulation so the relayout is visible, then refits. It never touches the
// nodes/edges arrays themselves — explicit and non-destructive.
function resetView(renderer, canvas) {
  clearPins(renderer.graph.nodes);
  clearPins(canvas.nodes);
  canvas.graph?.d3ReheatSimulation?.();
  canvas.fitToView();
  renderer.graph._saveLocal();
}

export function wireToolbar(renderer) {
  const canvas = renderer.graph.canvas;
  if (!canvas) return;
  const layoutBtns = renderer._getAll('.cc-bs-layout');
  const viewBtns = renderer._getAll('.cc-bs-view');
  layoutBtns.forEach(btn => btn.addEventListener('click', () => {
    const layout = btn.getAttribute('data-layout');
    canvas.setLayout(layout);
    saveViewPrefs({ layout, viewMode: canvas.viewMode }, renderer.workspacePath);
    highlight(layoutBtns, layout, 'data-layout');
  }));
  viewBtns.forEach(btn => btn.addEventListener('click', () => {
    const viewMode = btn.getAttribute('data-view');
    canvas.setViewMode(viewMode);
    saveViewPrefs({ layout: canvas.layout, viewMode }, renderer.workspacePath);
    highlight(viewBtns, viewMode, 'data-view');
  }));
  renderer._getEl('.cc-bs-fit')?.addEventListener('click', () => canvas.fitToView());
  renderer._getEl('.cc-bs-reset-view')?.addEventListener('click', () => resetView(renderer, canvas));
  applyViewPrefs(renderer);

  // #325 (FX912): LIST VIEW toggle — accessible table alternative. Renders
  // from LIVE graph state on every activation (no stale cache); read-only.
  const listToggle = renderer._getEl('.cc-bs-list-toggle');
  if (listToggle) {
    listToggle.addEventListener('click', () => {
      const list = renderer._getEl('.cc-bs-list-view');
      const canvasEl = renderer._getEl('.cc-brainstorm-canvas');
      if (!list || !canvasEl) return;
      const showing = listToggle.getAttribute('aria-pressed') === 'true';
      if (showing) {
        list.style.display = 'none';
        canvasEl.style.display = '';
        listToggle.setAttribute('aria-pressed', 'false');
      } else {
        list.innerHTML = renderListView(renderer.graph.nodes, renderer.graph.edges);
        list.style.display = 'block';
        canvasEl.style.display = 'none';
        listToggle.setAttribute('aria-pressed', 'true');
      }
    });
  }
}

// FX897/#263 v6.0.1: reconcile the LIVE canvas (and toolbar highlights) to the
// persisted prefs under the renderer's CURRENT workspacePath identity. The
// canvas can construct from a render that lost the race with the hub bootstrap
// (workspacePath unknown → prefs looked up under the wrong identity → FORCE/2D
// defaults stick, because the #261 in-flight guard rightly refuses a rebuild).
// Safe to call on every hub render: every user-driven change persists via
// saveViewPrefs before/with the canvas setter, so prefs === canvas after any
// interaction and the reconcile is a no-op except when a load was missed.
export function applyViewPrefs(renderer) {
  const canvas = renderer.graph.canvas;
  if (!canvas) return;
  const prefs = loadViewPrefs(renderer.workspacePath);
  if (canvas.viewMode !== prefs.viewMode) canvas.setViewMode(prefs.viewMode);
  if (canvas.layout !== prefs.layout) canvas.setLayout(prefs.layout);
  highlight(renderer._getAll('.cc-bs-layout'), prefs.layout, 'data-layout');
  highlight(renderer._getAll('.cc-bs-view'), prefs.viewMode, 'data-view');
}
