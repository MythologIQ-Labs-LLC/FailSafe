// FailSafe Command Center — Brainstorm HTML Templates
// Pure template functions extracted from BrainstormRenderer.

export function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function renderShell() {
  return `
    <!-- View Control Toolbar HUD -->
    <div class="cc-bs-toolbar">
      <div class="cc-bs-actions-row">
        <button class="cc-btn cc-bs-layout" data-layout="FORCE">FORCE</button>
        <button class="cc-btn cc-bs-layout" data-layout="TREE">TREE</button>
        <button class="cc-btn cc-bs-layout" data-layout="CIRCLE">CIRCLE</button>
      </div>
      <div class="cc-bs-view-row">
        <button class="cc-btn cc-bs-view active" data-view="2D">2D</button>
        <button class="cc-btn cc-bs-view" data-view="3D">3D</button>
      </div>
      <div class="cc-bs-meta-row">
        <button class="cc-btn cc-bs-seed" title="Preload nodes from the repository knowledge graph">REPO</button>
        <button class="cc-btn cc-bs-clear-layer" title="Remove your brainstorm nodes, keep the repo nodes">CLEAR LAYER</button>
        <button class="cc-btn cc-bs-undo" title="Undo (Ctrl+Z)">UNDO</button>
        <button class="cc-btn cc-bs-redo" title="Redo (Ctrl+Y)">REDO</button>
        <button class="cc-btn cc-bs-export">EXPORT</button>
        <button class="cc-btn cc-btn--danger cc-bs-clear">RESET</button>
      </div>
    </div>

    <!-- 3D Graph Container -->
    <div class="cc-canvas cc-brainstorm-canvas"></div>

    <div class="cc-bs-node-info" style="display:none;"></div>`;
}

export function renderRightPanel() {
  return `
  <div style="display: flex; flex-direction: column; height: 100%; gap: 16px;">
    <!-- Topology Legend -->
    <div class="cc-bs-legend cc-card" style="padding: 16px;">
      <h3 style="margin: 0 0 12px 0; font-size: 13px; color: var(--text-main); border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 8px;">Topology Legend</h3>
      <div class="cc-bs-legend-nodes" style="display: flex; flex-direction: column; gap: 10px;">
        <div style="display: flex; align-items: center; gap: 10px; font-size: 11px; color: var(--text-muted);">
          <div style="width: 12px; height: 12px; border-radius: 50%; background: #4f46e5;"></div> Core Architecture
        </div>
        <div style="display: flex; align-items: center; gap: 10px; font-size: 11px; color: var(--text-muted);">
          <div style="width: 12px; height: 12px; border-radius: 50%; background: #10b981;"></div> High Confidence
        </div>
        <div style="display: flex; align-items: center; gap: 10px; font-size: 11px; color: var(--text-muted);">
          <div style="width: 12px; height: 12px; border-radius: 50%; background: #ef4444;"></div> Risk / Unaligned
        </div>
        <div style="display: flex; align-items: center; gap: 10px; font-size: 11px; color: var(--text-muted);">
          <div style="width: 12px; height: 12px; border-radius: 50%; background: #f59e0b; box-shadow: 0 0 10px #f59e0b;"></div> Living Ideation (Active)
        </div>
      </div>
    </div>

    <!-- AI Engine Status -->
    <div class="cc-bs-llm-status cc-card" style="padding: 16px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:8px;">
        <h3 style="margin: 0; font-size: 13px; color: var(--text-main);">AI Extraction Tiers</h3>
        <span style="font-size: 10px; color: var(--text-muted); opacity:0.6;">Priority 1-3</span>
      </div>
      <div class="cc-bs-llm-indicator">
        <!-- Dyn Content -->
      </div>
    </div>

    <div style="flex: 1;"></div>

    <!-- Ideation Prep Bay (Integrated at Bottom) -->
    <div class="cc-bs-prep-bay cc-card" style="display: flex; flex-direction: column; gap: 12px; padding: 16px;">
      <div class="cc-bs-prep-header" style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 8px;">
        <h3 style="margin: 0; font-size: 14px; color: var(--text-main);">Ideation Prep Bay <span class="beta-badge">Beta</span></h3>
        <div style="display:flex;align-items:center;gap:6px;">
          <button class="cc-btn cc-bs-prep-expand" title="Expand to full editor" style="background:none;border:1px solid rgba(255,255,255,0.15);border-radius:4px;padding:2px 6px;font-size:11px;color:var(--text-muted);cursor:pointer;">Expand</button>
          <select class="cc-bs-history" style="background: rgba(0,0,0,0.3); color: var(--text-muted); border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; padding: 2px 6px; font-size: 11px; max-width: 100px;">
            <option value="">0 history</option>
          </select>
        </div>
      </div>

      <div class="cc-bs-prep-body" style="display: flex; flex-direction: column; gap: 10px;">
        <textarea class="cc-bs-prep-input" placeholder="Speak or type your architectural goals..." spellcheck="false" style="width: 100%; min-height: 200px; background: rgba(0,0,0,0.3); border: 1px solid var(--border-rim); border-radius: 8px; padding: 10px; color: var(--text-main); font-family: var(--font-body); font-size: 0.95rem; line-height: 1.5; resize: vertical; outline: none;"></textarea>

        <!-- Audio Feedback Visualizer -->
        <div class="audio-visualizer-container">
          <canvas class="audio-visualizer-canvas"></canvas>
        </div>

        <div style="display: flex; align-items: center; gap: 10px;">
          <label style="display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--text-muted); cursor: pointer; user-select: none; flex: 1;">
            <input type="checkbox" class="cc-bs-wake-toggle" style="accent-color: var(--accent-cyan);" />
            Hey FailSafe
          </label>
          <div class="cc-bs-chat-status" style="font-size: 11px; color: var(--text-muted); font-family: var(--font-mono);">Ready</div>
        </div>

        <div class="cc-bs-prep-controls" style="display: flex; gap: 8px;">
          <button class="cc-btn cc-bs-voice" style="flex: 1; padding: 10px; font-weight: bold; background: rgba(255,255,255,0.05);">[ RECORD ]</button>
          <button class="cc-btn cc-btn--primary cc-bs-prep-send" style="flex: 1.2; padding: 10px; font-weight: bold;">SEND TO MAP</button>
        </div>
      </div>
    </div>
  </div>`;
}
