import { applyPhysicsAdapters } from './force-layout.js';
import { calculateHaptics } from './haptic-engine.js';
import { escapeHtml } from './brainstorm-templates.js';

const CATEGORY_COLORS = {
  Idea: '#4f46e5',
  Architecture: '#4f46e5',
  Alignment: '#10b981',
  Risk: '#ef4444',
  Decision: '#8b5cf6',
  Task: '#06b6d4',
  Question: '#f59e0b',
  Constraint: '#f97316',
  Database: '#06b6d4',
  Integration: '#f59e0b',
};

// FX897: DAG modes per layout; FORCE (and anything unknown) maps to null.
const DAG_MODES = { TREE: 'td', CIRCLE: 'radialout' };

function confidenceColor(score) {
  if (score < 0) return null;
  if (score >= 80) return '#10b981'; // Green
  if (score >= 60) return '#f59e0b'; // Gold
  if (score >= 40) return '#f97316'; // Orange
  return '#ef4444'; // Red
}

export class BrainstormCanvas {
  constructor(container, prefs = {}) {
    this.container = container;
    // FX897: restore persisted view prefs; 2D default (research: 3D harms
    // accuracy at 10-100 nodes), FORCE default layout.
    this.viewMode = prefs.viewMode === '3D' ? '3D' : '2D';
    this.layout = prefs.layout || 'FORCE';
    this.onDagFallback = null; // FX897 LD1: invoked when a DAG layout meets a cycle
    this._reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    this.nodes = [];
    this.edges = [];
    this.graph = null;

    // B128: Debounced resize handler — defined BEFORE _initGraph so the FX897
    // ResizeObserver registration inside _initGraph can bind it.
    this._resizeHandler = () => {
      clearTimeout(this._resizeDebounce);
      this._resizeDebounce = setTimeout(() => {
        const rect = this.container.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0 && this.graph) {
          this.graph.width(rect.width).height(rect.height);
        }
      }, 150);
    };
    // FX897: ResizeObserver (in _observeResize) is primary; window.resize stays as fallback.
    window.addEventListener('resize', this._resizeHandler);
    this._initGraph();
    setTimeout(this._resizeHandler, 100);
  }

  _initGraph() {
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
    if (this.graph) {
      if (this.graph.pauseAnimation) this.graph.pauseAnimation();
      this.container.innerHTML = '';
    }

    const factory = this.viewMode === '3D' ? window.ForceGraph3D : window.ForceGraph;
    if (!factory) {
      console.error(`ForceGraph${this.viewMode === '3D' ? '3D' : ''} not found in global scope.`);
      return;
    }

    this.graph = this._buildGraph(factory);
    if (this.viewMode === '3D') this._setup3D();
    this.graph = applyPhysicsAdapters(this.graph);
    this._wireDagError();
    this._applyLayout();
    this._observeResize();
    if (this.nodes.length) this._updateGraph();
  }

  _buildGraph(factory) {
    return factory()(this.container)
      .backgroundColor('rgba(0,0,0,0)')
      .nodeLabel(node => escapeHtml(node.label))
      .nodeColor(node => {
        const base = confidenceColor(node.confidence) || CATEGORY_COLORS[node.type] || '#4f46e5';
        if (node.strain > 0) {
          return `rgba(255, 255, 255, ${0.5 - node.strain * 0.4})`;
        }
        return base;
      })
      .nodeVal(node => node.val || 5)
      .linkColor(() => 'rgba(255, 255, 255, 0.2)')
      .linkWidth(1)
      .linkDirectionalParticles(this._reduceMotion ? 0 : 2)
      .linkDirectionalParticleSpeed(0.005)
      .linkDirectionalParticleWidth(1.5)
      .onNodeClick(node => {
        if (this.selectCallback) this.selectCallback(node.id);
      })
      .onNodeRightClick(node => {
        if (this.dblClickCallback) this.dblClickCallback(node.id);
      })
      .onNodeDragEnd(node => this._pinAndReport(node));
  }

  _setup3D() {
    if (typeof this.graph.showNavInfo === 'function') {
      this.graph.showNavInfo(false);
    }
    this.graph.nodeResolution(32);
    if (this._reduceMotion) return;
    const distance = 400;
    let angle = 0;
    this._rotateTimer = setInterval(() => {
      this.graph.cameraPosition({
        x: distance * Math.sin(angle),
        z: distance * Math.cos(angle)
      });
      angle += Math.PI / 3000;
    }, 50);
  }

  // FX897 LD4: dragEnd pins the node (fx/fy, plus fz when z is defined — 3D)
  // so operator positions survive relayout; RESET VIEW clears pins, never data.
  _pinAndReport(node) {
    node.fx = node.x;
    node.fy = node.y;
    if (node.z !== undefined) node.fz = node.z;
    if (this.moveCallback) {
      this.moveCallback(node.id, node.x, node.y, node.z);
    }
  }

  // FX897 LD1: vendor-native cycle hook (present in BOTH force-graph and
  // 3d-force-graph) — a cyclic graph under a DAG layout reverts to FORCE
  // instead of crashing/blanking; the fallback callback surfaces a status note.
  _wireDagError() {
    if (typeof this.graph.onDagError !== 'function') return;
    this.graph.onDagError(() => {
      const attempted = this.layout;
      this.layout = 'FORCE';
      if (this.graph.dagMode) this.graph.dagMode(null);
      this.onDagFallback?.(attempted);
    });
  }

  // FX897: primary resize tracking — fires on container size changes (e.g.
  // sidebar collapse, panel drag, reappearance from 0) without a window resize.
  _observeResize() {
    if (typeof window.ResizeObserver !== 'function') return;
    this._resizeObserver = new window.ResizeObserver(this._resizeHandler);
    this._resizeObserver.observe(this.container);
  }

  _applyLayout() {
    if (!this.graph || typeof this.graph.dagMode !== 'function') return;
    this.graph.dagMode(DAG_MODES[this.layout] ?? null);
  }

  // FX897 LD3: reduced motion ⇒ instant jump (duration 0), else 400ms; 40px padding.
  fitToView() {
    if (this.graph && typeof this.graph.zoomToFit === 'function') {
      this.graph.zoomToFit(this._reduceMotion ? 0 : 400, 40);
    }
  }

  setViewMode(mode) {
    if (this.viewMode === mode) return;
    this.viewMode = mode;
    if (this._rotateTimer) clearInterval(this._rotateTimer);
    this._initGraph();
  }

  setLayout(layout) {
    if (!this.graph) return;
    this.layout = layout;
    this._applyLayout();
    this.fitToView(); // LD6: refit after a layout switch
  }

  setNodes(nodes) {
    this.nodes = nodes.map(n => ({ ...n }));
    this._updateGraph();
  }

  setEdges(edges, nodes) {
    this.edges = edges.map(e => ({ ...e }));
    this._updateGraph();
  }

  _updateGraph() {
    if (this._updatePending) return;
    this._updatePending = true;
    const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (cb) => setTimeout(cb, 0);
    raf(() => {
      this._updatePending = false;
      this._applyGraphData();
    });
  }

  _applyGraphData() {
    if (!this.graph) return;
    const haptics = calculateHaptics(this.nodes, this.edges);
    this.nodes.forEach(n => {
      const h = haptics.get(n.id);
      if (h) {
        n.val = h.val;
        n.strain = h.strain;
      } else {
        n.val = n.mass || 5;
        n.strain = 0;
      }
    });
    this.graph.graphData({
      nodes: this.nodes,
      links: this.edges
    });
  }

  onNodeMove(callback) { this.moveCallback = callback; }
  onNodeSelect(callback) { this.selectCallback = callback; }
  onNodeDblClick(callback) { this.dblClickCallback = callback; }

  destroy() {
    if (this._rotateTimer) clearInterval(this._rotateTimer);
    clearTimeout(this._resizeDebounce);
    window.removeEventListener('resize', this._resizeHandler);
    this._resizeObserver?.disconnect();
    this._resizeObserver = null;
    if (this.graph && this.graph.pauseAnimation) this.graph.pauseAnimation();
    this.container.innerHTML = '';
  }
}
