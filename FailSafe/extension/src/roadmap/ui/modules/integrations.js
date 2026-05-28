// FailSafe Command Center — Integrations tab renderer.
// Hosts third-party service cards. Bicameral MCP is the only entry in v1.
// Pattern is extensible: additional MCP servers / services drop a new card
// import + a state slot below.

import { renderBicameralCard, bindBicameralCard, INITIAL_BICAMERAL_STATE } from './bicameral-card.js';

// Open Design v1.1 — read-only Settings card. Mirrors the Bicameral card
// shell but omits install/connect orchestration (Open Design daemon lifecycle
// is operator-owned; FailSafe only consumes when reachable). Three status
// rows: daemon-probe, MCP client, SSE attach. Buttons surface the operator
// wizard command from the command palette.
function renderOpenDesignCard() {
  return `
    <div class="cc-integration-card" style="padding:12px;border:1px solid var(--border, #2a2a2a);border-radius:6px">
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

export class IntegrationsRenderer {
  constructor(panelId, { client } = {}) {
    this.panelId = panelId;
    this.client = client;
    this.state = { bicameral: { ...INITIAL_BICAMERAL_STATE } };
    this.handlers = this._buildHandlers();
    this._detectedOnce = false;
  }

  render(_hubData) {
    const panel = document.getElementById(this.panelId);
    if (!panel) return;
    panel.innerHTML = this._renderCards();
    bindBicameralCard(panel, this.handlers);
    if (!this._detectedOnce) {
      this._detectedOnce = true;
      void this._refreshStatus();
    }
  }

  onEvent(evt) {
    if (!evt || typeof evt !== 'object') return;
    // WS broadcast types from BicameralRoute (install + connect lifecycle).
    if (evt.type === 'bicameral.install.progress' || evt.type === 'bicameral.install.complete') {
      this.setInstallProgress(evt.invocation);
      if (evt.type === 'bicameral.install.complete') {
        void this._refreshStatus();
      }
      return;
    }
    if (evt.type === 'bicameral.connected' || evt.type === 'bicameral.disconnected') {
      void this._refreshStatus();
    }
  }

  _renderCards() {
    return `
      <div class="cc-integrations" style="padding:16px;display:flex;flex-direction:column;gap:16px">
        ${renderBicameralCard(this.state.bicameral)}
        ${renderOpenDesignCard()}
      </div>
    `;
  }

  _buildHandlers() {
    return {
      // B-BIC-14: when running, the header button performs a composite Sync
      // (status + history + drift); otherwise it's a plain status probe.
      onDetect:  () => this._sync(),
      onConnect: () => this._connect(),
      onRefresh: () => this._refreshHistory(),
      onRatify:  (id, verdict) => this._ratify(id, verdict),
      onInstall: (mode) => this._beginInstall(mode),
      onOpenBinding: (filePath, startLine) => this._openBinding(filePath, startLine),
      // Setup-only path reuses /api/actions/bicameral-install (the install
      // handler skips the pip step when pip-install reports already-installed,
      // a behavior pip provides natively). For v1 we POST the same endpoint
      // and let the upstream skip the no-op pip step.
      onSetup:   (mode) => this._beginInstall(mode),
    };
  }

  /**
   * B-BIC-14: composite Sync. Always probes status; when the integration is
   * running it additionally refreshes history and the drift status of every
   * binding file path already present in card state.
   */
  async _sync() {
    await this._refreshStatus();
    if (this.state.bicameral.installState !== 'running') return;
    await this._refreshHistory({ silent: true });
    await this._refreshDrift();
  }

  /** B-BIC-14: refresh drift for each binding file path already in card state. */
  async _refreshDrift() {
    const paths = this._collectBindingPaths();
    for (const filePath of paths) {
      try {
        await fetch('/api/actions/bicameral-drift', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filePath }),
        });
      } catch {
        /* drift refresh is best-effort; status/history already surfaced */
      }
    }
  }

  /** Unique binding file paths drawn from the features already in card state. */
  _collectBindingPaths() {
    const paths = new Set();
    for (const feature of this.state.bicameral.features || []) {
      for (const decision of feature.decisions || []) {
        const binding = (decision.bindings || [])[0];
        if (binding && binding.filePath) paths.add(binding.filePath);
      }
    }
    return [...paths];
  }

  /** B-BIC-12: open a decision's bound source file in the editor. */
  async _openBinding(filePath, startLine) {
    if (!filePath) return;
    try {
      await fetch('/api/actions/bicameral-open-binding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath, startLine }),
      });
    } catch (err) {
      this._setState({ error: String(err) });
    }
  }

  async _refreshStatus() {
    this._setState({ requesting: true, error: null });
    try {
      const res = await fetch('/api/integrations/bicameral/status');
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) {
        this._setState({ requesting: false, error: json?.error || res.statusText || 'status probe failed' });
        return;
      }
      this._setState({
        requesting: false,
        installState: json.state || 'unknown',
        version: json.version,
        configPath: json.configPath,
        // B-BIC-13: thread tool capabilities so the empty-state can gate the
        // /bicameral-ingest hint on the `ingest` capability.
        capabilities: Array.isArray(json.capabilities) ? json.capabilities : [],
      });
      // If we're connected, immediately fetch history so the running state has
      // content. If not connected, leave features as-is so prior data persists.
      if (json.state === 'running') void this._refreshHistory({ silent: true });
    } catch (err) {
      this._setState({ requesting: false, error: String(err) });
    }
  }

  async _connect() {
    this._setState({ requesting: true, error: null });
    try {
      const res = await fetch('/api/actions/bicameral-connect', { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) {
        this._setState({ requesting: false, error: json?.error || 'connect failed' });
        return;
      }
      this._setState({ requesting: false, installState: 'running' });
      void this._refreshHistory({ silent: true });
    } catch (err) {
      this._setState({ requesting: false, error: String(err) });
    }
  }

  async _refreshHistory({ silent = false } = {}) {
    if (!silent) this._setState({ requesting: true, error: null });
    try {
      const res = await fetch('/api/actions/bicameral-history', { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) {
        this._setState({ requesting: false, error: json?.error || 'history fetch failed' });
        return;
      }
      this._setState({ requesting: false, features: Array.isArray(json.features) ? json.features : [] });
    } catch (err) {
      this._setState({ requesting: false, error: String(err) });
    }
  }

  async _ratify(decisionId, verdict) {
    if (!decisionId) return;
    this._setState({ requesting: true, error: null });
    try {
      const res = await fetch('/api/actions/bicameral-ratify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decisionId, verdict: verdict || 'ratify' }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) {
        this._setState({ requesting: false, error: json?.error || 'ratify failed' });
        return;
      }
      // Refresh history to surface the new status. _refreshHistory clears
      // requesting on success.
      void this._refreshHistory({ silent: true });
      this._setState({ requesting: false });
    } catch (err) {
      this._setState({ requesting: false, error: String(err) });
    }
  }

  async _beginInstall(mode) {
    this._setState({ installProgress: { mode, steps: [], done: false, ok: false } });
    try {
      const res = await fetch('/api/actions/bicameral-install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) {
        this._setState({
          installProgress: {
            ...(this.state.bicameral.installProgress || { mode, steps: [] }),
            done: true,
            ok: false,
            error: json?.error || res.statusText || 'install failed',
          },
        });
        return;
      }
      // Final report comes back in res.body but the WS broadcasts have
      // likely already advanced state. Trust the body for terminal state.
      if (json?.report) this.setInstallProgress(json.report);
    } catch (err) {
      this._setState({
        installProgress: {
          ...(this.state.bicameral.installProgress || { mode, steps: [] }),
          done: true,
          ok: false,
          error: String(err),
        },
      });
    }
  }

  /** Host-side wiring point: called from the extension's install bridge with
   *  the latest InstallProgressEvent. */
  setInstallProgress(progress) {
    this._setState({ installProgress: progress });
  }

  _setState(patch) {
    this.state.bicameral = { ...this.state.bicameral, ...patch };
    this.render();
  }
}
