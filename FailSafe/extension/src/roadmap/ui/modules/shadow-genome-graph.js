// FailSafe Command Center — Shadow Genome Map (#196 Phase 4).
// A DETERMINISTIC, accessible SVG causal-graph: governance gates are "anchor
// stars" on an inner ring, each failure node orbits its governance root, other
// nodes ring the periphery. Positions are pure functions of sorted node ids
// (stable Playwright screenshots). Static depth only (gradients, glow, rings —
// no non-deterministic motion). A "View as table" mode keeps the graph from
// being the only access path (spec §15). Edges styled by canonical type.

function esc(value) {
  const d = document.createElement('div');
  d.textContent = String(value ?? '');
  return d.innerHTML;
}

// FX890: truncate the VISIBLE node label so dense graphs don't collapse into
// overlapping text. Truncates the RAW string (before esc) so an HTML entity is
// never split; the full label is kept in <title> + the group aria-label.
function truncateLabel(value, max = 16) {
  const s = String(value ?? '');
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

const CX = 400, CY = 250;
const SEV_GRAD = { active: 'active', repeated: 'repeated', emerging: 'emerging', remediated: 'remediated', informational: 'cyan' };
const EDGE_STYLE = {
  produced: 'stroke-width:1.6',
  occurred_during: 'stroke-width:1.4;stroke-dasharray:3 3',
  triggered_by: 'stroke-width:1.6;marker-end:url(#sg-arrow)',
  applies_to: 'stroke-width:1;opacity:0.5',
};

const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

function degreeMap(graph) {
  const m = new Map();
  for (const e of graph.edges) { m.set(e.source, (m.get(e.source) || 0) + 1); m.set(e.target, (m.get(e.target) || 0) + 1); }
  return m;
}

function neighbours(graph, id) {
  const s = new Set();
  for (const e of graph.edges) { if (e.source === id) s.add(e.target); if (e.target === id) s.add(e.source); }
  return s;
}

/** failureId -> sorted governance root ids (canonical applies_to/triggered_by adjacency). */
function failureRoots(graph) {
  const type = new Map(graph.nodes.map((n) => [n.id, n.type]));
  const roots = new Map();
  for (const e of graph.edges) {
    for (const [a, b] of [[e.source, e.target], [e.target, e.source]]) {
      if (type.get(a) === 'failure' && type.get(b) === 'governance') {
        if (!roots.has(a)) roots.set(a, []);
        if (!roots.get(a).includes(b)) roots.get(a).push(b);
      }
    }
  }
  for (const v of roots.values()) v.sort();
  return roots;
}

/** Governance-centric radial layout — deterministic by sorted id. */
function layout(graph) {
  const pos = new Map();
  const gov = graph.nodes.filter((n) => n.type === 'governance').slice().sort(byId);
  const fail = graph.nodes.filter((n) => n.type === 'failure').slice().sort(byId);
  const other = graph.nodes.filter((n) => n.type !== 'governance' && n.type !== 'failure').slice().sort(byId);
  gov.forEach((n, i) => {
    const a = -Math.PI / 2 + (i / Math.max(gov.length, 1)) * Math.PI * 2;
    pos.set(n.id, { x: CX + Math.cos(a) * 120, y: CY + Math.sin(a) * 120 });
  });
  const roots = failureRoots(graph);
  const grp = new Map();
  fail.forEach((n, i) => {
    const rs = roots.get(n.id);
    const root = rs && rs.length ? rs[0] : null;
    if (root && pos.has(root)) {
      const rp = pos.get(root);
      const k = grp.get(root) || 0; grp.set(root, k + 1);
      const base = Math.atan2(rp.y - CY, rp.x - CX);
      const off = (k % 2 === 0 ? 1 : -1) * (0.35 + 0.26 * Math.floor(k / 2));
      pos.set(n.id, { x: rp.x + Math.cos(base + off) * 92, y: rp.y + Math.sin(base + off) * 92 });
    } else {
      const a = -Math.PI / 2 + (i / Math.max(fail.length, 1)) * Math.PI * 2;
      pos.set(n.id, { x: CX + Math.cos(a) * 245, y: CY + Math.sin(a) * 245 });
    }
  });
  other.forEach((n, i) => {
    const a = -Math.PI / 2 + ((i + 0.5) / Math.max(other.length, 1)) * Math.PI * 2;
    pos.set(n.id, { x: CX + Math.cos(a) * 330, y: CY + Math.sin(a) * 330 });
  });
  return pos;
}

function grad(id, color) {
  return `<radialGradient id="sg-grad-${id}"><stop offset="0%" stop-color="${color}" stop-opacity="0.95"/><stop offset="100%" stop-color="${color}" stop-opacity="0.32"/></radialGradient>`;
}
function defs() {
  return `<defs>${grad('gov', 'var(--primary)')}${grad('active', 'var(--accent-red)')}${grad('repeated', 'var(--accent-orange)')}${grad('emerging', 'var(--accent-gold)')}${grad('remediated', 'var(--accent-green)')}${grad('cyan', 'var(--accent-cyan)')}${grad('muted', 'var(--text-muted)')}` +
    `<marker id="sg-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="var(--text-muted)"/></marker></defs>`;
}

function nodeSvg(n, p, deg, sev, sel, nb) {
  const isGov = n.type === 'governance', isFail = n.type === 'failure';
  const d = deg.get(n.id) || 0;
  const r = isGov ? 14 + Math.min(d, 5) * 1.6 : isFail ? 8 + Math.min(d, 5) * 1.4 : 6;
  const sv = sev.get(n.id);
  const stroke = isGov ? 'var(--primary)' : isFail ? `var(--accent-${sv === 'active' ? 'red' : sv === 'repeated' ? 'orange' : sv === 'emerging' ? 'gold' : 'cyan'})` : 'var(--text-muted)';
  const gradId = isGov ? 'gov' : isFail ? (SEV_GRAD[sv] || 'cyan') : 'muted';
  const dim = sel && n.id !== sel && !(nb && nb.has(n.id)) ? ' dim' : '';
  const ring = isGov ? `<circle r="${(r + 6).toFixed(1)}" class="sg-node-ring"/>` : '';
  const dashed = isFail && d === 0 ? ' sg-node-dashed' : '';
  const shape = (!isGov && !isFail)
    ? `<rect x="${(-r).toFixed(1)}" y="${(-r).toFixed(1)}" width="${(r * 2).toFixed(1)}" height="${(r * 2).toFixed(1)}" transform="rotate(45)" class="sg-node-shape" style="fill:url(#sg-grad-muted);stroke:${stroke}"/>`
    : `<circle r="${r.toFixed(1)}" class="sg-node-shape${dashed}" style="fill:url(#sg-grad-${gradId});stroke:${stroke}"/>`;
  const label = (isGov || n.id === sel) ? `<text class="sg-node-label" y="${(r + 13).toFixed(1)}">${esc(truncateLabel(n.label))}</text>` : '';
  return `<g class="sg-node${dim}${n.id === sel ? ' sel' : ''}" transform="translate(${p.x.toFixed(1)},${p.y.toFixed(1)})" data-node="${esc(n.id)}" tabindex="0" role="button" aria-label="${esc(n.type)}: ${esc(n.label)}">${ring}${shape}${label}<title>${esc(n.label)} (${esc(n.type)})</title></g>`;
}

/** Deterministic viewBox for a zoom level (centered on the 800×520 stage). */
function viewBoxFor(zoom) {
  const z = Math.max(0.5, Math.min(3, zoom || 1));
  const w = 800 / z, h = 520 / z;
  return `${(400 - w / 2).toFixed(1)} ${(260 - h / 2).toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`;
}

function buildSvg(graph, pos, sev, deg, sel, zoom) {
  const nb = sel ? neighbours(graph, sel) : null;
  const edges = graph.edges.map((e) => {
    const a = pos.get(e.source), b = pos.get(e.target);
    if (!a || !b) return '';
    const on = !sel || e.source === sel || e.target === sel;
    return `<line class="sg-edge${on ? ' on' : ''}" x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" style="${EDGE_STYLE[e.type] || 'stroke-width:1.2'}"><title>${esc(e.source)} ${esc(e.type)} ${esc(e.target)}</title></line>`;
  }).join('');
  const nodes = graph.nodes.map((n) => { const p = pos.get(n.id); return p ? nodeSvg(n, p, deg, sev, sel, nb) : ''; }).join('');
  return `<svg class="sg-graph-svg" viewBox="${viewBoxFor(zoom)}" role="img" aria-label="Genome causal map — ${graph.nodes.length} nodes, ${graph.edges.length} edges">${defs()}<g class="sg-edges">${edges}</g><g class="sg-nodes">${nodes}</g></svg>`;
}

function buildLegend() {
  const dot = (c, l) => `<span class="sg-leg"><span class="sg-leg-dot" style="background:${c}"></span>${l}</span>`;
  const line = (cls, l) => `<span class="sg-leg"><span class="sg-leg-line ${cls}"></span>${l}</span>`;
  return `<div class="sg-legend">${dot('var(--primary)', 'governance')}${dot('var(--accent-red)', 'active')}${dot('var(--accent-orange)', 'repeated')}${dot('var(--accent-gold)', 'emerging')}${line('sg-leg-solid', 'produced')}${line('sg-leg-dotted', 'occurred_during')}${line('sg-leg-arrow', 'triggered_by')}</div>`;
}

function buildInspector(graph, sel, sev, deg) {
  if (!sel) return `<div class="sg-panel"><div class="sg-panel-title">Inspector</div><div class="sg-muted">Select a node to trace its causal neighbourhood.</div></div>`;
  const n = graph.nodes.find((x) => x.id === sel);
  if (!n) return '';
  const sevKey = n.type === 'failure' ? (sev.get(sel) || 'emerging') : 'gov';
  const rels = graph.edges.filter((e) => e.source === sel || e.target === sel)
    .map((e) => `<li><code class="sg-id">${esc(e.source === sel ? n.label : e.source)}</code> <span class="sg-rel">${esc(e.type)}</span> <code class="sg-id">${esc(e.target === sel ? n.label : e.target)}</code></li>`).join('');
  const nbs = [...neighbours(graph, sel)].map((id) => graph.nodes.find((x) => x.id === id)).filter(Boolean)
    .map((x) => `<li><span class="sg-surface-label">${esc(x.label)}</span><span class="sg-surface-meta">${esc(x.type)}</span></li>`).join('');
  return `<div class="sg-panel">
    <div class="sg-drawer-head sg-sev-${esc(sevKey)}"><span class="sg-sev-spine" aria-hidden="true"></span><div class="sg-drawer-headtext"><div class="sg-drawer-title">${esc(n.label)}</div><div class="sg-drawer-sub">${esc(n.type)} · degree ${esc(deg.get(sel) || 0)}</div></div></div>
    <div class="sg-drawer-section"><div class="sg-drawer-h">Causal relationships</div><ul class="sg-surfaces">${rels || '<li class="sg-muted">none</li>'}</ul></div>
    <div class="sg-drawer-section"><div class="sg-drawer-h">Neighbours</div>${nbs ? `<ul class="sg-surfaces">${nbs}</ul>` : '<div class="sg-muted">none</div>'}</div>
    <div class="sg-drawer-section"><div class="sg-drawer-h">Node id</div><code class="sg-id">${esc(n.id)}</code></div>
  </div>`;
}

function buildTable(graph, sev) {
  const rows = graph.nodes.slice().sort(byId).map((n) =>
    `<tr><td><code class="sg-id">${esc(n.id)}</code></td><td>${esc(n.type)}</td><td>${esc(n.label)}</td><td>${esc(n.type === 'failure' ? (sev.get(n.id) || 'unclassified') : '—')}</td></tr>`).join('');
  const er = graph.edges.slice().sort((a, b) => (a.id < b.id ? -1 : 1)).map((e) =>
    `<tr><td><code class="sg-id">${esc(e.source)}</code></td><td><span class="sg-rel">${esc(e.type)}</span></td><td><code class="sg-id">${esc(e.target)}</code></td></tr>`).join('');
  return `<div class="sg-table-view">
    <table class="sg-data-table"><caption>Nodes</caption><thead><tr><th>ID</th><th>Type</th><th>Label</th><th>Severity</th></tr></thead><tbody>${rows}</tbody></table>
    <table class="sg-data-table"><caption>Edges</caption><thead><tr><th>Source</th><th>Relationship</th><th>Target</th></tr></thead><tbody>${er}</tbody></table>
  </div>`;
}

export function renderGenomeMode(d, state) {
  const graph = d.graph || { nodes: [], edges: [] };
  if (!graph.nodes.length) {
    return `<div class="sg-panel sg-graph-wrap"><div class="sg-panel-title">Genome Map</div><div class="sg-muted">No causal graph yet — the map takes shape as governed failures and their edges are observed.</div></div>`;
  }
  const sev = new Map((d.incidents || []).map((i) => [i.id, i.severity]));
  const deg = degreeMap(graph);
  const view = state.view === 'table' ? 'table' : 'graph';
  const zoom = state.zoom || 1;
  const body = view === 'table' ? buildTable(graph, sev) : buildSvg(graph, layout(graph), sev, deg, state.selectedId, zoom);
  const zoomCtl = view === 'graph'
    ? `<button class="sg-zoom" data-zoom="out" type="button" aria-label="Zoom out"${zoom <= 0.5 ? ' disabled' : ''}>−</button><button class="sg-zoom" data-zoom="in" type="button" aria-label="Zoom in"${zoom >= 3 ? ' disabled' : ''}>+</button>`
    : '';
  const canReset = state.selectedId || zoom !== 1;
  return `<div class="sg-graph-wrap">
    <div class="sg-graph-main">
      <div class="sg-graph-toolbar">
        <div class="sg-panel-title">Genome Map</div>
        <div class="sg-graph-controls">
          <button class="sg-view-btn${view === 'graph' ? ' active' : ''}" data-view="graph" type="button">Graph</button>
          <button class="sg-view-btn${view === 'table' ? ' active' : ''}" data-view="table" type="button">Table</button>
          ${zoomCtl}
          <button class="sg-reset" type="button" aria-label="Reset view"${canReset ? '' : ' disabled'}>Reset</button>
        </div>
      </div>
      <div class="sg-graph-canvas">${body}</div>
      ${view === 'graph' ? buildLegend() : ''}
    </div>
    <div class="sg-graph-rail">${buildInspector(graph, state.selectedId, sev, deg)}</div>
  </div>`;
}

export function bindGenome(wrap, d, state, onChange) {
  wrap.querySelectorAll('.sg-view-btn').forEach((b) => b.addEventListener('click', () => { state.view = b.getAttribute('data-view'); onChange(); }));
  wrap.querySelector('.sg-reset')?.addEventListener('click', () => { state.selectedId = null; state.zoom = 1; onChange(); });
  wrap.querySelectorAll('.sg-zoom').forEach((b) => b.addEventListener('click', () => {
    const dir = b.getAttribute('data-zoom');
    state.zoom = Math.max(0.5, Math.min(3, (state.zoom || 1) * (dir === 'in' ? 1.3 : 1 / 1.3)));
    onChange();
  }));
  wrap.querySelectorAll('.sg-node').forEach((g) => {
    const id = g.getAttribute('data-node');
    const sel = () => { state.selectedId = state.selectedId === id ? null : id; onChange(); };
    g.addEventListener('click', sel);
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sel(); } });
  });
}
