// FailSafe Command Center — Open Design MCP sub-view renderer.
// Extracted from the former IntegrationsRenderer during B-INT-5. The Open Design
// daemon lifecycle is operator-owned; FailSafe only consumes when reachable.
// B-OD-8 (v1.2): the card gains a "Request create_artifact" affordance — the one
// non-destructive write tool, admitted only through L3 approval. Submitting it
// POSTs /api/actions/open-design-create-artifact, which enqueues an L3 item; the
// operator approves it in the Governance L3 queue (which then auto-executes the
// call). The 3 destructive tools remain rejected at the client gate.

export class OpenDesignRenderer {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    // GH #166: live MCP connection state, probed from
    // /api/integrations/open-design/status. null = not yet probed.
    this._connected = null;
  }

  // GH #166: replace the former hard-coded "disconnected/idle" strings with the
  // live MCP client state. When connected, the stdio client + its SSE attach are
  // active and the daemon is necessarily reachable (the client cannot connect
  // otherwise), so the three lines reflect the single authoritative signal.
  _statusBlock() {
    const connected = this._connected === true;
    const tone = connected ? 'var(--accent-green, #68d391)' : 'var(--text-muted)';
    const daemon = this._connected === null ? 'probe via wizard' : connected ? 'reachable' : 'unreachable';
    const mcp = this._connected === null ? 'unknown' : connected ? 'connected' : 'disconnected';
    const sse = this._connected === null ? 'idle' : connected ? 'attached' : 'idle';
    return `
      <div style="font-size:0.78rem;line-height:1.6;color:var(--text-main)">
        <div>Daemon: <span style="color:${tone}">${daemon}</span></div>
        <div>MCP client: <span style="color:${tone}">${mcp}</span></div>
        <div>SSE attach: <span style="color:${tone}">${sse}</span></div>
      </div>`;
  }

  async _refreshStatus() {
    try {
      const res = await fetch('/api/integrations/open-design/status');
      const json = await res.json().catch(() => ({}));
      this._connected = json && json.ok ? json.connected === true : false;
    } catch {
      this._connected = false;
    }
    // Patch only the status block in place so an in-flight create request input
    // is not clobbered by the async refresh.
    const block = this.container && this.container.querySelector('.cc-od-status-block');
    if (block) block.innerHTML = this._statusBlock();
  }

  render() {
    if (!this.container) return;
    this.container.innerHTML = `
      <div class="cc-integration-card cc-open-design-card" style="padding:12px;border:1px solid var(--border, #2a2a2a);border-radius:6px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <div style="display:flex;align-items:center;gap:10px">
            <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.08em">Open Design MCP</div>
            <span style="font-size:0.65rem;color:var(--text-muted)">v1.2 — read + L3-gated create_artifact</span>
          </div>
        </div>
        <div class="cc-od-status-block">${this._statusBlock()}</div>
        <div class="cc-open-design-create" style="margin-top:10px;display:flex;gap:6px;align-items:center">
          <input class="cc-od-artifact-name" type="text" placeholder="artifact name (create_artifact)"
            style="flex:1;padding:4px 8px;font-size:0.75rem;background:var(--bg-input,#1a1a1a);border:1px solid var(--border-rim,#333);border-radius:4px;color:var(--text-main)" />
          <button class="cc-btn cc-btn--primary cc-od-create-artifact" style="padding:4px 12px;font-size:0.75rem">Request</button>
        </div>
        <div class="cc-od-create-status" style="margin-top:4px;font-size:0.72rem;color:var(--text-muted)"></div>
        <div style="margin-top:8px;font-size:0.7rem;color:var(--text-muted)">
          Run <code>FailSafe: Register Open Design MCP Connection</code> from the command palette to probe the daemon at <code>127.0.0.1:7456</code> and connect the MCP client. <code>create_artifact</code> requires L3 approval (request above → approve in the Governance L3 queue). The destructive write tools (<code>write_file</code>, <code>delete_file</code>, <code>delete_project</code>) remain rejected at runtime; broader exposure deferred (B-OD-8).
        </div>
      </div>
    `;
    this._bind();
    // GH #166: probe live MCP state after the static shell renders. Runs on
    // every hub tick (render is re-invoked per refresh), so the card stays live.
    this._refreshStatus();
  }

  _bind() {
    const btn = this.container.querySelector('.cc-od-create-artifact');
    const input = this.container.querySelector('.cc-od-artifact-name');
    const status = this.container.querySelector('.cc-od-create-status');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      const name = (input && input.value || '').trim();
      if (!name) { if (status) status.textContent = 'Enter an artifact name.'; return; }
      btn.disabled = true;
      try {
        const res = await fetch('/api/actions/open-design-create-artifact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ args: { name } }),
        });
        const json = await res.json().catch(() => ({}));
        if (res.status === 409 && json.pending) {
          if (status) status.textContent = 'Queued for L3 approval — approve in the Governance tab.';
        } else if (res.status === 503) {
          if (status) status.textContent = 'Open Design MCP not connected — run the wizard first.';
        } else {
          if (status) status.textContent = json.error || `Unexpected response (${res.status}).`;
        }
      } catch (err) {
        if (status) status.textContent = String(err);
      } finally {
        btn.disabled = false;
      }
    });
  }

  // GH #166: re-probe live state when an Open Design lifecycle event arrives
  // (connect/disconnect/create-artifact). Other events are ignored.
  onEvent(evt) {
    const type = evt && (evt.type || (evt.payload && evt.payload.type));
    if (typeof type === 'string' && type.indexOf('open-design') === 0) {
      this._refreshStatus();
    }
  }
}
