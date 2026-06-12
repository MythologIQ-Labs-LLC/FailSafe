// FailSafe Command Center — Brainstorm Graph Operations
// Node CRUD, transcript submission, graph fetch/export/clear.

import { exportBrainstormJSON } from './brainstorm-export.js';
import { showTruncationNotice } from './brainstorm-truncation-notice.js';

const STORAGE_KEY = 'failsafe-brainstorm-graph';

export class BrainstormGraph {
  constructor({ showStatus, store } = {}) {
    this.nodes = [];
    this.edges = [];
    this.canvas = null;
    this.onSelectionChange = null;
    this._undoStack = [];
    this._redoStack = [];
    this._maxHistory = 50;
    this._mutating = false;
    this._showStatus = showStatus || null;
    this._store = store || null;
  }

  setCanvas(canvas) { this.canvas = canvas; }

  _pushUndo(command) {
    this._undoStack.push(command);
    if (this._undoStack.length > this._maxHistory) this._undoStack.shift();
    this._redoStack = [];
  }

  undo() {
    const cmd = this._undoStack.pop();
    if (!cmd) return;
    cmd.backward();
    this._redoStack.push(cmd);
    this.canvas?.setNodes(this.nodes);
    this.canvas?.setEdges(this.edges, this.nodes);
    this._saveLocal();
  }

  redo() {
    const cmd = this._redoStack.pop();
    if (!cmd) return;
    cmd.forward();
    this._undoStack.push(cmd);
    this.canvas?.setNodes(this.nodes);
    this.canvas?.setEdges(this.edges, this.nodes);
    this._saveLocal();
  }

  async fetchGraph() {
    // Try server first, fall back to localStorage
    try {
      const res = await fetch('/api/v1/brainstorm/graph');
      const data = await res.json();
      if (data.nodes?.length || data.edges?.length) {
        this.nodes = data.nodes || [];
        this.edges = data.edges || [];
        this._saveLocal();
        return;
      }
    } catch {}
    // Server empty or unavailable — restore from localStorage
    this._loadLocal();
    // FX889: an empty Mind Map preloads the repository knowledge graph so the
    // operator starts from repo facts, not a blank canvas.
    if (!this.nodes.length) await this.seedFromRepo();
  }

  // FX889: merge the repository seed graph. By default only fills an EMPTY map
  // (never overwrites brainstorm work); `force` re-seeds on demand (the REPO
  // button). mergeNodes dedupes by id, so a re-seed is idempotent on cb- nodes.
  async seedFromRepo({ force = false } = {}) {
    if (!force && this.nodes.length) return;
    try {
      const res = await fetch('/api/v1/brainstorm/seed');
      const data = await res.json();
      if (data.nodes?.length || data.edges?.length) {
        this.mergeNodes(data.nodes || [], data.edges || []);
      }
    } catch {}
  }

  // FX889: strip the operator's brainstorm layer, KEEP the repo seed (source:
  // "codebase"), so source facts survive while the user's edits are cleared.
  clearBrainstormLayer() {
    const before = { nodes: [...this.nodes], edges: [...this.edges] };
    const keptIds = new Set(this.nodes.filter(n => n.source === 'codebase').map(n => n.id));
    const prune = () => {
      this.nodes = this.nodes.filter(n => keptIds.has(n.id));
      this.edges = this.edges.filter(e => keptIds.has(e.source) && keptIds.has(e.target));
    };
    prune();
    this._pushUndo({
      type: 'clear-layer',
      forward: prune,
      backward: () => { this.nodes = [...before.nodes]; this.edges = [...before.edges]; },
    });
    this.canvas?.setNodes(this.nodes);
    this.canvas?.setEdges(this.edges, this.nodes);
    this.onSelectionChange?.(null);
    this._saveLocal();
  }

  _saveLocal() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ nodes: this.nodes, edges: this.edges }));
    } catch {}
  }

  _loadLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      this.nodes = data.nodes || [];
      this.edges = data.edges || [];
    } catch {}
  }

  async addNode(label, type) {
    try {
      const res = await fetch('/api/v1/brainstorm/node', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, type }),
      });
      const node = await res.json();
      if (node.labelTruncated) showTruncationNotice();
      if (node.id) this.mergeNodes([node], []);
    } catch { /* network error — WS will sync */ }
  }

  async saveNode(id, label, type) {
    try {
      const res = await fetch(`/api/v1/brainstorm/node/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, type }),
      });
      const updated = await res.json();
      if (updated && updated.labelTruncated) showTruncationNotice();
      const stored = (updated && typeof updated.label === 'string') ? updated.label : label;
      const node = this.nodes.find(n => n.id === id);
      if (node) { node.label = stored; node.type = type; }
      this.canvas?.setNodes(this.nodes);
      this._saveLocal();
    } catch { /* network error */ }
  }

  async removeNode(id) {
    if (!id) return;
    const removedNode = this.nodes.find(n => n.id === id);
    const removedEdges = this.edges.filter(e => e.source === id || e.target === id);
    try {
      await fetch(`/api/v1/brainstorm/node/${encodeURIComponent(id)}`, { method: 'DELETE' });
    } catch { /* network error */ }
    this.nodes = this.nodes.filter(n => n.id !== id);
    this.edges = this.edges.filter(e => e.source !== id && e.target !== id);
    this._pushUndo({
      type: 'remove-node',
      forward: () => {
        this.nodes = this.nodes.filter(n => n.id !== id);
        this.edges = this.edges.filter(e => e.source !== id && e.target !== id);
      },
      backward: () => {
        if (removedNode) this.nodes.push(removedNode);
        this.edges.push(...removedEdges);
      }
    });
    this.canvas?.setNodes(this.nodes);
    this.canvas?.setEdges(this.edges, this.nodes);
    this.onSelectionChange?.(null);
    this._saveLocal();
  }

  async submitTranscript(transcript) {
    if (!transcript?.trim()) return { error: 'Empty transcript' };
    try {
      const res = await fetch('/api/v1/brainstorm/transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript }),
      });
      if (!res.ok) return { error: `Server error (${res.status})` };
      return await res.json();
    } catch { return null; }
  }

  applyExtraction(extraction) {
    this.mergeNodes(extraction.nodes || [], extraction.edges || []);
  }

  mergeNodes(newNodes, newEdges) {
    if (this._mutating) {
      setTimeout(() => this.mergeNodes(newNodes, newEdges), 16);
      return;
    }
    this._mutating = true;
    try {
    const existingIds = new Set(this.nodes.map(n => n.id));
    const actuallyAdded = [];
    for (const n of newNodes) {
      if (!existingIds.has(n.id)) { this.nodes.push(n); actuallyAdded.push(n); }
    }
    const addedEdges = [...newEdges];
    for (const e of addedEdges) this.edges.push(e);
    if (actuallyAdded.length || addedEdges.length) {
      const addedNodeIds = new Set(actuallyAdded.map(n => n.id));
      this._pushUndo({
        type: 'merge',
        forward: () => {
          for (const n of actuallyAdded) {
            if (!this.nodes.some(x => x.id === n.id)) this.nodes.push(n);
          }
          this.edges.push(...addedEdges);
        },
        backward: () => {
          this.nodes = this.nodes.filter(n => !addedNodeIds.has(n.id));
          this.edges = this.edges.filter(e =>
            !addedEdges.some(ae => ae.source === e.source && ae.target === e.target));
        }
      });
    }
    this.canvas?.setNodes(this.nodes);
    this.canvas?.setEdges(this.edges, this.nodes);
    this._saveLocal();
    } finally { this._mutating = false; }
  }

  async clearAll() {
    const snapshot = { nodes: [...this.nodes], edges: [...this.edges] };
    try { await fetch('/api/v1/brainstorm/graph', { method: 'DELETE' }); } catch {}
    this.nodes = []; this.edges = [];
    this._pushUndo({
      type: 'clear',
      forward: () => { this.nodes = []; this.edges = []; },
      backward: () => { this.nodes = [...snapshot.nodes]; this.edges = [...snapshot.edges]; }
    });
    this.canvas?.setNodes([]); this.canvas?.setEdges([], []);
    this.onSelectionChange?.(null);
    this._saveLocal();
  }

  async exportJSON() {
    return exportBrainstormJSON(this._showStatus, this._store);
  }

  onEvent(evt) {
    if (evt.type === 'brainstorm.update' && evt.payload) {
      this.mergeNodes(evt.payload.nodes || [], evt.payload.edges || []);
    }
    if (evt.type === 'brainstorm.node-removed' && evt.payload?.id) {
      this.nodes = this.nodes.filter(n => n.id !== evt.payload.id);
      this.edges = this.edges.filter(e => e.source !== evt.payload.id && e.target !== evt.payload.id);
      this.canvas?.setNodes(this.nodes);
      this.canvas?.setEdges(this.edges, this.nodes);
      this.onSelectionChange?.(evt.payload.id);
      this._saveLocal();
    }
    if (evt.type === 'brainstorm.reset') {
      this.nodes = []; this.edges = [];
      this.canvas?.setNodes([]); this.canvas?.setEdges([], []);
      this.onSelectionChange?.(null);
      this._saveLocal();
    }
  }
}
