// FailSafe Command Center — Integrations tab renderer.
// Hosts third-party service cards. Bicameral MCP is the only entry in v1.
// Pattern is extensible: additional MCP servers / services drop a new card
// import + a state slot below.

import { renderBicameralCard, bindBicameralCard, INITIAL_BICAMERAL_STATE } from './bicameral-card.js';

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
      </div>
    `;
  }

  _buildHandlers() {
    return {
      onDetect:  () => this._refreshStatus(),
      onConnect: () => this._connect(),
      onRefresh: () => this._refreshHistory(),
      onRatify:  (id, verdict) => this._ratify(id, verdict),
      onInstall: (mode) => this._beginInstall(mode),
      // Setup-only path reuses /api/actions/bicameral-install (the install
      // handler skips the pip step when pip-install reports already-installed,
      // a behavior pip provides natively). For v1 we POST the same endpoint
      // and let the upstream skip the no-op pip step.
      onSetup:   (mode) => this._beginInstall(mode),
    };
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
