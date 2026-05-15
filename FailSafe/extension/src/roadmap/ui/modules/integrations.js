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
  }

  render(_hubData) {
    const panel = document.getElementById(this.panelId);
    if (!panel) return;
    panel.innerHTML = this._renderCards();
    bindBicameralCard(panel, this.handlers);
  }

  onEvent(evt) {
    if (!evt || typeof evt !== 'object') return;
    // WS broadcast types from ActionsRoute /api/actions/bicameral-install.
    if (evt.type === 'bicameral.install.progress' || evt.type === 'bicameral.install.complete') {
      this.setInstallProgress(evt.invocation);
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
      onDetect:  () => this._setState({ requesting: true }),
      onConnect: () => this._setState({ requesting: true }),
      onRefresh: () => this._setState({ requesting: true }),
      onRatify:  (_id, _verdict) => this._setState({ requesting: true }),
      onInstall: (mode) => this._beginInstall(mode),
      // Setup-only path reuses /api/actions/bicameral-install (the install
      // handler skips the pip step when pip-install reports already-installed,
      // a behavior pip provides natively). For v1 we POST the same endpoint
      // and let the upstream skip the no-op pip step.
      onSetup:   (mode) => this._beginInstall(mode),
    };
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
   *  the latest InstallProgressEvent. Defined here for v1 even though the
   *  bridge is Phase 3 work — keeps the surface declared. */
  setInstallProgress(progress) {
    this._setState({ installProgress: progress });
  }

  _setState(patch) {
    this.state.bicameral = { ...this.state.bicameral, ...patch };
    this.render();
  }
}
