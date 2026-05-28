// FailSafe Command Center — Open Design MCP sub-view renderer.
// Extracted from the former IntegrationsRenderer during B-INT-5. Open Design
// v1.1 is a read-only Settings card: it mirrors the Bicameral card shell but
// omits install/connect orchestration (the Open Design daemon lifecycle is
// operator-owned; FailSafe only consumes when reachable). Three status rows:
// daemon-probe, MCP client, SSE attach. Buttons surface the operator wizard
// command from the command palette. No WS event stream exists for Open Design,
// so onEvent is a no-op.

export class OpenDesignRenderer {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
  }

  render() {
    if (!this.container) return;
    this.container.innerHTML = `
      <div class="cc-integration-card cc-open-design-card" style="padding:12px;border:1px solid var(--border, #2a2a2a);border-radius:6px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <div style="display:flex;align-items:center;gap:10px">
            <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.08em">Open Design MCP</div>
            <span style="font-size:0.65rem;color:var(--text-muted)">v1.1 — read-only</span>
          </div>
        </div>
        <div style="font-size:0.78rem;line-height:1.6;color:var(--text-main)">
          <div>Daemon: <span style="color:var(--text-muted)">probe via wizard</span></div>
          <div>MCP client: <span style="color:var(--text-muted)">disconnected</span></div>
          <div>SSE attach: <span style="color:var(--text-muted)">idle</span></div>
        </div>
        <div style="margin-top:8px;font-size:0.7rem;color:var(--text-muted)">
          Run <code>FailSafe: Register Open Design MCP Connection</code> from the command palette to probe the daemon at <code>127.0.0.1:7456</code> and connect the MCP client. Write tools (<code>create_artifact</code>, <code>write_file</code>, <code>delete_file</code>, <code>delete_project</code>) are rejected at runtime in v1.1; L3-gated exposure ships in v1.2 (B-OD-8).
        </div>
      </div>
    `;
  }

  // No Open Design WS event stream in v1.1 — accept and ignore for TabGroup parity.
  onEvent() {}
}
