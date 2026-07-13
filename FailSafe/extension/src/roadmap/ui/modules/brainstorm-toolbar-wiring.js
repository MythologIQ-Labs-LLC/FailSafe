// FailSafe Command Center — Brainstorm Toolbar Wiring (FX897, #235 LD5 split)
// Layout/view button bindings relocated from BrainstormRenderer.bindToolbar
// (pre-relocation brainstorm.js:176-188), plus the FIT VIEW / RESET VIEW
// controls and view-prefs persistence. `renderer` is the BrainstormRenderer
// instance (owns _getEl/_getAll + graph/canvas).

import { loadViewPrefs, saveViewPrefs } from './brainstorm-graph-io.js';

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
  const prefs = loadViewPrefs(renderer.workspacePath);
  highlight(layoutBtns, prefs.layout, 'data-layout');
  highlight(viewBtns, prefs.viewMode, 'data-view');
}
