// FailSafe Command Center — Agent-FailSafe Adapter Panel
// Manages installation and configuration of the agent-failsafe Python adapter
// for Microsoft Agent Governance Toolkit integration.
import { escHtml } from './skill-utils.js';
import { CONFIRM_PENDING_TEXT, gatedFailureMessage, jsonPost, settleGated } from './operator-confirmation-copy.js';

const TOOLKIT_PACKAGES = [
  { name: 'agent-os', description: 'Policy engine & tool call interceptors', required: true },
  { name: 'agent-mesh', description: 'Trust & identity (DID translation)', required: false },
  { name: 'agent-hypervisor', description: 'Execution rings & privilege levels', required: false },
  { name: 'agent-sre', description: 'SLO monitoring & reliability', required: false },
];

export class AdapterPanel {
  constructor(containerId, deps = {}) {
    this.container = document.getElementById(containerId);
    this.client = deps.client || null;
    this.state = null;
    this.healthCheck = null;
    this.installing = false;
  }

  async render() {
    if (!this.container) return;
    await this.fetchState();
    this.container.innerHTML = `
      ${this.renderHeader()}
      ${this.renderPrerequisites()}
      ${this.renderAdapterStatus()}
      ${this.renderToolkitPackages()}
      ${this.renderHealthCheck()}
      ${this.renderConfiguration()}
      ${this.renderDocumentation()}
      ${this.renderInstallModal()}`;
    this.bindEvents();
  }

  async fetchState() {
    if (!this.client) return;
    try {
      const res = await fetch(`${this.client.baseUrl}/api/adapter/status`);
      if (res.ok) {
        this.state = await res.json();
      }
    } catch (e) {
      console.error('Adapter state fetch failed:', e);
    }
  }

  async fetchHealthCheck() {
    if (!this.client) return;
    try {
      const res = await fetch(`${this.client.baseUrl}/api/adapter/health`);
      if (res.ok) {
        this.healthCheck = await res.json();
      }
    } catch (e) {
      console.error('Health check failed:', e);
    }
  }

  renderHeader() {
    return `
      <div class="cc-card" style="margin-bottom:16px;padding:16px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div>
            <h2 style="margin:0 0 8px 0;font-size:1.1rem;color:var(--text-main)">
              Microsoft Agent Governance Toolkit Adapter
            </h2>
            <div style="font-size:0.8rem;color:var(--text-muted);line-height:1.5">
              The <code style="background:rgba(255,255,255,0.1);padding:2px 6px;border-radius:3px">agent-failsafe</code>
              adapter bridges FailSafe governance into Microsoft's Agent Governance Toolkit.
              <br>It translates FailSafe decisions into formats understood by agent-os, agent-mesh, agent-hypervisor, and agent-sre.
            </div>
          </div>
          <div style="display:flex;gap:8px">
            <button class="cc-btn cc-adapter-refresh">Refresh</button>
            ${this.state?.adapterInstalled
              ? `<button class="cc-btn cc-btn--danger cc-adapter-uninstall">Uninstall</button>`
              : `<button class="cc-btn cc-btn--primary cc-adapter-install">Install Adapter</button>`
            }
          </div>
        </div>
        <div class="cc-adapter-action-status" role="status" aria-live="polite" style="font-size:0.8rem;color:var(--text-muted);margin-top:8px"></div>
      </div>`;
  }

  renderPrerequisites() {
    const pythonOk = this.state?.pythonAvailable;
    const pipOk = this.state?.pipAvailable;
    const pythonVersion = this.state?.pythonVersion || 'Not found';

    return `
      <div class="cc-card" style="margin-bottom:16px;padding:16px">
        <h3 style="margin:0 0 12px 0;font-size:0.9rem;color:var(--text-main)">Prerequisites</h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px">
          <div style="padding:12px;background:rgba(0,0,0,0.2);border-radius:6px;border-left:3px solid ${pythonOk ? 'var(--accent-green)' : 'var(--accent-red)'}">
            <div style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase">Python 3.10+</div>
            <div style="font-size:0.9rem;color:var(--text-main);margin-top:4px">
              ${pythonOk ? `<span style="color:var(--accent-green)">v${escHtml(pythonVersion)}</span>` : '<span style="color:var(--accent-red)">Not Found</span>'}
            </div>
          </div>
          <div style="padding:12px;background:rgba(0,0,0,0.2);border-radius:6px;border-left:3px solid ${pipOk ? 'var(--accent-green)' : 'var(--accent-red)'}">
            <div style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase">pip</div>
            <div style="font-size:0.9rem;color:var(--text-main);margin-top:4px">
              ${pipOk ? '<span style="color:var(--accent-green)">Available</span>' : '<span style="color:var(--accent-red)">Not Found</span>'}
            </div>
          </div>
        </div>
        ${!pythonOk || !pipOk ? `
          <div style="margin-top:12px;padding:10px;background:rgba(255,100,100,0.1);border-radius:6px;font-size:0.8rem;color:var(--accent-red)">
            Python 3.10+ and pip are required. Please install Python from
            <a href="https://www.python.org/downloads/" target="_blank" rel="noopener" style="color:var(--primary)">python.org</a>
          </div>
        ` : ''}
      </div>`;
  }

  renderAdapterStatus() {
    const installed = this.state?.adapterInstalled;
    const version = this.state?.adapterVersion;
    const latestVersion = this.state?.latestVersion;
    const outdated = version && latestVersion && version !== latestVersion;

    return `
      <div class="cc-card" style="margin-bottom:16px;padding:16px">
        <h3 style="margin:0 0 12px 0;font-size:0.9rem;color:var(--text-main)">Adapter Status</h3>
        <div style="display:flex;align-items:center;gap:12px">
          <div style="width:12px;height:12px;border-radius:50%;background:${installed ? 'var(--accent-green)' : 'var(--text-muted)'}"></div>
          <div>
            <div style="font-size:0.9rem;color:var(--text-main)">
              ${installed
                ? `<strong>agent-failsafe</strong> v${escHtml(version || 'unknown')}`
                : 'Not Installed'}
            </div>
            ${outdated ? `
              <div style="font-size:0.75rem;color:var(--accent-gold);margin-top:2px">
                Update available: v${escHtml(latestVersion)}
                <button class="cc-btn cc-btn--small cc-adapter-upgrade" style="margin-left:8px">Upgrade</button>
              </div>
            ` : ''}
          </div>
        </div>
        ${installed ? `
          <div style="margin-top:12px;padding:10px;background:rgba(0,0,0,0.2);border-radius:6px;font-size:0.8rem">
            <div style="color:var(--text-muted);margin-bottom:4px">PyPI Package</div>
            <code style="color:var(--text-main)">pip install agent-failsafe</code>
          </div>
        ` : ''}
      </div>`;
  }

  renderToolkitPackages() {
    const packages = this.state?.toolkitPackages || [];

    return `
      <div class="cc-card" style="margin-bottom:16px;padding:16px">
        <h3 style="margin:0 0 12px 0;font-size:0.9rem;color:var(--text-main)">
          Microsoft Agent Governance Toolkit
        </h3>
        <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:12px">
          These packages are adapted by agent-failsafe. Install them to enable full integration.
        </div>
        <div style="display:grid;gap:8px">
          ${TOOLKIT_PACKAGES.map(pkg => {
            const status = packages.find(p => p.name === pkg.name);
            const installed = status?.installed;
            const version = status?.version;
            return `
              <div style="display:flex;align-items:center;justify-content:space-between;padding:10px;background:rgba(0,0,0,0.2);border-radius:6px">
                <div style="display:flex;align-items:center;gap:10px">
                  <div style="width:8px;height:8px;border-radius:50%;background:${installed ? 'var(--accent-green)' : 'var(--text-muted)'}"></div>
                  <div>
                    <div style="font-size:0.85rem;color:var(--text-main)">
                      ${escHtml(pkg.name)}
                      ${pkg.required ? '<span style="font-size:0.65rem;color:var(--accent-gold);margin-left:4px">(required)</span>' : ''}
                    </div>
                    <div style="font-size:0.7rem;color:var(--text-muted)">${escHtml(pkg.description)}</div>
                  </div>
                </div>
                <div style="font-size:0.75rem;color:${installed ? 'var(--accent-green)' : 'var(--text-muted)'}">
                  ${installed ? `v${escHtml(version || '?')}` : 'Not installed'}
                </div>
              </div>`;
          }).join('')}
        </div>
        <div style="margin-top:12px;font-size:0.75rem;color:var(--text-muted)">
          Install all with: <code style="background:rgba(255,255,255,0.1);padding:2px 6px;border-radius:3px">pip install agent-os agent-mesh agent-hypervisor agent-sre</code>
        </div>
      </div>`;
  }

  renderHealthCheck() {
    if (!this.state?.adapterInstalled) return '';

    return `
      <div class="cc-card" style="margin-bottom:16px;padding:16px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <h3 style="margin:0;font-size:0.9rem;color:var(--text-main)">Health Check</h3>
          <button class="cc-btn cc-btn--small cc-adapter-health">Run Check</button>
        </div>
        <div class="cc-adapter-health-results">
          ${this.healthCheck ? this.renderHealthResults() : `
            <div style="font-size:0.8rem;color:var(--text-muted)">Click "Run Check" to verify adapter configuration</div>
          `}
        </div>
      </div>`;
  }

  renderHealthResults() {
    if (!this.healthCheck) return '';
    const hc = this.healthCheck;
    const statusColor = hc.healthy ? 'var(--accent-green)' : 'var(--accent-red)';

    return `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
        <div style="width:10px;height:10px;border-radius:50%;background:${statusColor}"></div>
        <span style="font-size:0.85rem;color:${statusColor}">${hc.healthy ? 'Healthy' : 'Issues Detected'}</span>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px">
        <span class="cc-badge" style="background:${hc.mcpConnected ? 'var(--accent-green)' : 'var(--text-muted)'}">MCP ${hc.mcpConnected ? '✓' : '○'}</span>
        <span class="cc-badge" style="background:${hc.ledgerAccessible ? 'var(--accent-green)' : 'var(--accent-red)'}">Ledger ${hc.ledgerAccessible ? '✓' : '✗'}</span>
        <span class="cc-badge" style="background:${hc.policyFilesFound ? 'var(--accent-green)' : 'var(--accent-red)'}">Policies ${hc.policyFilesFound ? '✓' : '✗'}</span>
      </div>
      <div style="font-size:0.75rem;color:var(--text-muted);font-family:var(--font-mono);line-height:1.6">
        ${(hc.details || []).map(d => `<div>${escHtml(d)}</div>`).join('')}
      </div>`;
  }

  renderConfiguration() {
    if (!this.state?.adapterInstalled) return '';

    return `
      <div class="cc-card" style="margin-bottom:16px;padding:16px">
        <h3 style="margin:0 0 12px 0;font-size:0.9rem;color:var(--text-main)">Configuration</h3>
        <div style="display:grid;gap:12px">
          <div>
            <label style="display:block;font-size:0.75rem;color:var(--text-muted);margin-bottom:4px">MCP Server Command</label>
            <input type="text" class="cc-adapter-mcp-cmd" value="failsafe mcp serve"
              style="width:100%;padding:8px;background:var(--bg-dark);color:var(--text-main);border:1px solid var(--border-rim);border-radius:6px;font-family:var(--font-mono);font-size:0.8rem">
          </div>
          <div style="display:flex;gap:16px">
            <label style="display:flex;align-items:center;gap:8px;font-size:0.8rem;cursor:pointer">
              <input type="checkbox" class="cc-adapter-fail-open" checked>
              Fail Open (allow on error)
            </label>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div>
              <label style="display:block;font-size:0.75rem;color:var(--text-muted);margin-bottom:4px">CBT Threshold</label>
              <input type="number" class="cc-adapter-cbt" value="0.5" min="0" max="1" step="0.1"
                style="width:100%;padding:8px;background:var(--bg-dark);color:var(--text-main);border:1px solid var(--border-rim);border-radius:6px;font-size:0.8rem">
            </div>
            <div>
              <label style="display:block;font-size:0.75rem;color:var(--text-muted);margin-bottom:4px">KBT Threshold</label>
              <input type="number" class="cc-adapter-kbt" value="0.8" min="0" max="1" step="0.1"
                style="width:100%;padding:8px;background:var(--bg-dark);color:var(--text-main);border:1px solid var(--border-rim);border-radius:6px;font-size:0.8rem">
            </div>
          </div>
          <button class="cc-btn cc-adapter-save-config">Save Configuration</button>
        </div>
      </div>`;
  }

  renderDocumentation() {
    return `
      <div class="cc-card" style="padding:16px">
        <h3 style="margin:0 0 12px 0;font-size:0.9rem;color:var(--text-main)">Documentation</h3>
        <div style="font-size:0.8rem;color:var(--text-muted);line-height:1.6">
          <p style="margin:0 0 8px 0">The adapter translates between FailSafe and Microsoft toolkit:</p>
          <ul style="margin:0;padding-left:20px">
            <li><strong>FailSafeInterceptor</strong> → agent-os ToolCallInterceptor chain</li>
            <li><strong>FailSafeTrustMapper</strong> → agent-mesh DID translation</li>
            <li><strong>FailSafeRingAdapter</strong> → agent-hypervisor execution rings</li>
            <li><strong>FailSafeComplianceSLI</strong> → agent-sre SLO monitoring</li>
          </ul>
          <p style="margin:12px 0 0 0">
            <a href="https://pypi.org/project/agent-failsafe/" target="_blank" rel="noopener" style="color:var(--primary)">PyPI Package</a>
            <span style="margin:0 8px;color:var(--border-rim)">|</span>
            <a href="https://github.com/microsoft/agent-governance-toolkit" target="_blank" rel="noopener" style="color:var(--primary)">Microsoft Toolkit</a>
          </p>
        </div>
      </div>`;
  }

  renderInstallModal() {
    return `
      <div class="cc-adapter-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:1000;justify-content:center;align-items:center">
        <div class="cc-card" style="max-width:500px;width:90%;padding:20px">
          <h3 style="margin:0 0 16px 0;font-size:1rem">Install agent-failsafe Adapter</h3>
          <div class="cc-adapter-modal-body">
            <div style="margin-bottom:16px">
              <label style="display:flex;align-items:center;gap:8px;font-size:0.85rem;cursor:pointer">
                <input type="checkbox" class="cc-adapter-install-toolkit" checked>
                Also install Microsoft Agent Governance Toolkit packages
              </label>
              <div style="font-size:0.75rem;color:var(--text-muted);margin-left:24px;margin-top:4px">
                Includes agent-os, agent-mesh, agent-hypervisor, and agent-sre
              </div>
            </div>
            <div class="cc-adapter-progress" style="display:none">
              <div style="height:4px;background:var(--bg-dark);border-radius:2px;overflow:hidden;margin-bottom:8px">
                <div class="cc-adapter-progress-bar" style="height:100%;background:var(--primary);width:0%;transition:width 0.3s"></div>
              </div>
              <div class="cc-adapter-progress-msg" style="font-size:0.8rem;color:var(--text-muted)"></div>
            </div>
          </div>
          <div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end">
            <button class="cc-btn cc-adapter-modal-cancel">Cancel</button>
            <button class="cc-btn cc-btn--primary cc-adapter-modal-confirm">Install</button>
          </div>
        </div>
      </div>`;
  }

  bindEvents() {
    // Refresh
    this.container.querySelector('.cc-adapter-refresh')?.addEventListener('click', async () => {
      await this.render();
    });

    // Install button
    this.container.querySelector('.cc-adapter-install')?.addEventListener('click', () => {
      this.showInstallModal();
    });

    // Upgrade button
    this.container.querySelector('.cc-adapter-upgrade')?.addEventListener('click', async () => {
      await this.performInstall(true, false);
    });

    // Uninstall button
    this.container.querySelector('.cc-adapter-uninstall')?.addEventListener('click', async () => {
      if (!confirm('Are you sure you want to uninstall the agent-failsafe adapter?')) return;
      await this.performUninstall();
    });

    // Health check
    this.container.querySelector('.cc-adapter-health')?.addEventListener('click', async () => {
      await this.fetchHealthCheck();
      const resultsDiv = this.container.querySelector('.cc-adapter-health-results');
      if (resultsDiv) {
        resultsDiv.innerHTML = this.renderHealthResults();
      }
    });

    // Save config
    this.container.querySelector('.cc-adapter-save-config')?.addEventListener('click', async () => {
      await this.saveConfig();
    });

    // Modal controls
    this.container.querySelector('.cc-adapter-modal-cancel')?.addEventListener('click', () => {
      this.hideInstallModal();
    });

    this.container.querySelector('.cc-adapter-modal-confirm')?.addEventListener('click', async () => {
      const installToolkit = this.container.querySelector('.cc-adapter-install-toolkit')?.checked ?? true;
      await this.performInstall(false, installToolkit);
    });
  }

  showInstallModal() {
    const modal = this.container.querySelector('.cc-adapter-modal');
    if (modal) {
      modal.style.display = 'flex';
      // Reset progress
      const progress = modal.querySelector('.cc-adapter-progress');
      if (progress) progress.style.display = 'none';
    }
  }

  hideInstallModal() {
    const modal = this.container.querySelector('.cc-adapter-modal');
    if (modal) modal.style.display = 'none';
  }

  async performInstall(upgrade, installToolkit) {
    if (this.installing) return;
    this.installing = true;

    const modal = this.container.querySelector('.cc-adapter-modal');
    const progressDiv = modal?.querySelector('.cc-adapter-progress');
    const progressBar = modal?.querySelector('.cc-adapter-progress-bar');
    const progressMsg = modal?.querySelector('.cc-adapter-progress-msg');
    const confirmBtn = modal?.querySelector('.cc-adapter-modal-confirm');

    if (progressDiv) progressDiv.style.display = 'block';
    if (confirmBtn) confirmBtn.disabled = true;
    // #538: pip runs only after the operator confirms in a VS Code dialog. The Upgrade
    // button calls this without the modal open, so the panel status line says it too.
    if (progressMsg) { progressMsg.textContent = CONFIRM_PENDING_TEXT; progressMsg.style.color = ''; }
    this.setActionStatus(CONFIRM_PENDING_TEXT);

    try {
      const r = await settleGated(fetch(`${this.client.baseUrl}/api/adapter/install`, jsonPost({
        installToolkit,
        upgradeIfExists: upgrade,
      })));

      if (!r.ok) {
        const message = gatedFailureMessage(r.status, r.body, 'installed');
        if (progressMsg) { progressMsg.textContent = message; progressMsg.style.color = 'var(--accent-red)'; }
        this.setActionStatus(message);
        return;
      }

      if (progressBar) progressBar.style.width = '100%';
      if (progressMsg) progressMsg.textContent = r.body.message || 'Installation complete';
      this.setActionStatus('');

      setTimeout(() => {
        this.hideInstallModal();
        this.render();
      }, 1500);
    } finally {
      this.installing = false;
      if (confirmBtn) confirmBtn.disabled = false;
    }
  }

  async performUninstall() {
    // #538: sent as JSON (the server refuses other content types) and confirmed in VS Code.
    this.setActionStatus(CONFIRM_PENDING_TEXT);
    const r = await settleGated(fetch(`${this.client.baseUrl}/api/adapter/uninstall`, jsonPost({})));
    if (r.ok) {
      await this.render();
      return;
    }
    this.setActionStatus(gatedFailureMessage(r.status, r.body, 'uninstalled'));
  }

  setActionStatus(message) {
    const el = this.container?.querySelector('.cc-adapter-action-status');
    if (el) el.textContent = message;
  }

  async saveConfig() {
    const mcpCmd = this.container.querySelector('.cc-adapter-mcp-cmd')?.value || 'failsafe mcp serve';
    const failOpen = this.container.querySelector('.cc-adapter-fail-open')?.checked ?? true;
    const cbt = parseFloat(this.container.querySelector('.cc-adapter-cbt')?.value || '0.5');
    const kbt = parseFloat(this.container.querySelector('.cc-adapter-kbt')?.value || '0.8');

    try {
      const res = await fetch(`${this.client.baseUrl}/api/adapter/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mcpServerCommand: mcpCmd.split(' '),
          failOpen,
          trustThresholds: { cbt, kbt },
        }),
      });
      if (res.ok) {
        alert('Configuration saved');
      }
    } catch (e) {
      alert(`Failed to save: ${e.message}`);
    }
  }

  destroy() {
    if (this.container) this.container.innerHTML = '';
  }
}
