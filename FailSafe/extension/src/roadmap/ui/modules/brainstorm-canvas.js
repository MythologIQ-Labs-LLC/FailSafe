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

function confidenceColor(score) {
  if (score < 0) return null;
  if (score >= 80) return '#10b981'; // Green
  if (score >= 60) return '#f59e0b'; // Gold
  if (score >= 40) return '#f97316'; // Orange
  return '#ef4444'; // Red
}

export class BrainstormCanvas {
  constructor(container) {
    this.container = container;
    this.viewMode = '2D'; // Default to 2D (research: 3D harms accuracy at 10-100 nodes)
    this._reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    this.nodes = [];
    this.edges = [];
    this.graph = null;
    this._initGraph();
    
    // B128: Debounced resize handler
    this._resizeHandler = () => {
      clearTimeout(this._resizeDebounce);
      this._resizeDebounce = setTimeout(() => {
        const rect = this.container.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0 && this.graph) {
          this.graph.width(rect.width).height(rect.height);
        }
      }, 150);
    };
    window.addEventListener('resize', this._resizeHandler);
    setTimeout(this._resizeHandler, 100);
  }

  _initGraph() {
    if (this.graph) {
      if (this.graph.pauseAnimation) this.graph.pauseAnimation();
      this.container.innerHTML = '';
    }

    const factory = this.viewMode === '3D' ? window.ForceGraph3D : window.ForceGraph;
    if (!factory) {
      console.error(`ForceGraph${this.viewMode === '3D' ? '3D' : ''} not found in global scope.`);
      return;
    }

    this.graph = factory()(this.container)
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
      .onNodeDragEnd(node => {
        if (this.moveCallback) {
          this.moveCallback(node.id, node.x, node.y, node.z);
        }
      });

    if (this.viewMode === '3D') {
      if (typeof this.graph.showNavInfo === 'function') {
        this.graph.showNavInfo(false);
      }
      this.graph.nodeResolution(32);
      if (!this._reduceMotion) {
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
    }

    this.graph = applyPhysicsAdapters(this.graph);
    if (this.nodes.length) this._updateGraph();
  }

  setViewMode(mode) {
    if (this.viewMode === mode) return;
    this.viewMode = mode;
    if (this._rotateTimer) clearInterval(this._rotateTimer);
    this._initGraph();
  }

  setLayout(layout) {
    if (!this.graph) return;
    // Basic layout hooks for ForceGraph
    if (layout === 'TREE' && this.graph.dagMode) {
      this.graph.dagMode('td');
    } else if (layout === 'CIRCLE' && this.graph.dagMode) {
      this.graph.dagMode('radialout');
    } else {
      if (this.graph.dagMode) this.graph.dagMode(null);
    }
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
    if (this.graph && this.graph.pauseAnimation) this.graph.pauseAnimation();
    this.container.innerHTML = '';
  }
}
