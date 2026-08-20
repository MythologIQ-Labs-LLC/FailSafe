// FailSafe Command Center — Agent Marketplace Renderer
// Catalog browser, HITL install gates, security scanning status, trust tiers.
// Includes Adapter panel for Microsoft Agent Governance Toolkit integration.
import { escHtml } from './skill-utils.js';
import { AdapterPanel } from './adapter-panel.js';

const MARKETPLACE_TABS = ['Featured', 'All', 'Installed', 'Quarantined', 'Adapter'];
const CATEGORY_LABELS = {
  'autonomous-multi-agent': 'Autonomous',
  'safety-red-teaming': 'Safety',
  'ui-orchestration': 'UI & Orchestration',
  'agent-skills': 'Skills',
};

export class MarketplaceRenderer {
  constructor(containerId, deps = {}) {
    this.container = document.getElementById(containerId);
    this.client = deps.client || null;
    this.catalog = [];
    this.scanners = { garak: false, promptfoo: false, lastChecked: '' };
    this.activeTab = 'Featured';
    this.activeCategory = 'all';
    this.pendingInstall = null; // HITL state
    this.adapterPanel = null; // Lazy-initialized adapter panel
  }

  async render(hubData) {
    if (!this.container) return;

    // Adapter tab has its own dedicated panel
    if (this.activeTab === 'Adapter') {
      this.container.innerHTML = `
        ${this.renderHeader()}
        ${this.renderTabs()}
        <div id="cc-adapter-container"></div>`;
      this.bindTabEvents();
      // Initialize or re-render adapter panel
      if (!this.adapterPanel) {
        this.adapterPanel = new AdapterPanel('cc-adapter-container', { client: this.client });
      } else {
        this.adapterPanel.container = document.getElementById('cc-adapter-container');
      }
      await this.adapterPanel.render();
      return;
    }

    // Standard marketplace catalog view
    await this.fetchCatalog();
    this.container.innerHTML = `
      ${this.renderHeader()}
      ${this.renderScannerStatus()}
      ${this.renderTabs()}
      ${this.renderCategoryFilter()}
      <div class="cc-marketplace-grid cc-grid-2"></div>
      ${this.renderHitlModal()}`;
    this.bindEvents();
    this.renderCards();
  }

  async fetchCatalog() {
    if (!this.client) return;
    try {
      const res = await fetch(`${this.client.baseUrl}/api/marketplace/catalog`);
      if (res.ok) {
        const data = await res.json();
        this.catalog = data.items || [];
        this.scanners = data.scanners || this.scanners;
      }
    } catch (e) {
      console.error('Marketplace catalog fetch failed:', e);
    }
  }

  renderHeader() {
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div>
          <h2 style="margin:0;font-size:1.1rem;color:var(--text-main)">Agent Marketplace</h2>
          <div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px">
            ${this.catalog.length} agents available
          </div>
        </div>
        <button class="cc-btn cc-marketplace-refresh">Refresh</button>
      </div>`;
  }

  renderScannerStatus() {
    const garakStatus = this.scanners.garak
      ? '<span style="color:var(--accent-green)">Available</span>'
      : '<span style="color:var(--text-muted)">Not installed</span>';
    const promptfooStatus = this.scanners.promptfoo
      ? '<span style="color:var(--accent-green)">Available</span>'
      : '<span style="color:var(--text-muted)">Not installed</span>';
    return `
      <div class="cc-card" style="padding:10px;margin-bottom:12px;display:flex;gap:16px;align-items:center;font-size:0.8rem">
        <span style="color:var(--text-muted)">Security Scanners:</span>
        <span>Garak: ${garakStatus}</span>
        <span>Promptfoo: ${promptfooStatus}</span>
        ${this.scanners.lastChecked ? `<span style="color:var(--text-muted);font-size:0.7rem">Last checked: ${new Date(this.scanners.lastChecked).toLocaleTimeString()}</span>` : ''}
      </div>`;
  }

  renderTabs() {
    return `<div style="display:flex;gap:6px;margin-bottom:12px">${MARKETPLACE_TABS.map(t =>
      `<button class="cc-chip cc-marketplace-tab${t === this.activeTab ? ' active' : ''}" data-tab="${t}">${t}</button>`
    ).join('')}</div>`;
  }

  renderCategoryFilter() {
    return `
      <div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap">
        <button class="cc-chip cc-marketplace-cat${this.activeCategory === 'all' ? ' active' : ''}" data-cat="all">All</button>
        ${Object.entries(CATEGORY_LABELS).map(([key, label]) =>
          `<button class="cc-chip cc-marketplace-cat${this.activeCategory === key ? ' active' : ''}" data-cat="${key}">${label}</button>`
        ).join('')}
      </div>`;
  }

  renderCards() {
    const grid = this.container.querySelector('.cc-marketplace-grid');
    if (!grid) return;
    const filtered = this.filterItems();
    if (!filtered.length) {
      grid.innerHTML = `
        <div class="cc-card" style="grid-column:1/-1;min-height:180px;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center">
          <div style="font-size:0.95rem;font-weight:600;color:var(--text-main);margin-bottom:6px">No agents found</div>
          <div style="font-size:0.82rem;color:var(--text-muted);max-width:420px">
            ${this.activeTab === 'Installed' ? 'No agents installed yet. Browse Featured or All tabs to find agents.' :
              this.activeTab === 'Quarantined' ? 'No quarantined agents. All scanned agents passed security checks.' :
              'Try adjusting your filters or refresh the catalog.'}
          </div>
        </div>`;
      return;
    }
    grid.innerHTML = filtered.map(item => this.renderCard(item)).join('');
    this.bindCardActions();
  }

  renderCard(item) {
    const statusBadge = this.getStatusBadge(item);
    const trustBadge = this.getTrustBadge(item);
    const categoryLabel = CATEGORY_LABELS[item.category] || item.category;
    const tags = (item.tags || []).slice(0, 3);
    const isInstalling = item.status === 'installing' || item.status === 'scanning';
    const isInstalled = item.status === 'installed';
    const isQuarantined = item.status === 'quarantined';

    return `
      <div class="cc-card cc-marketplace-card" data-id="${escHtml(item.id)}" style="padding:12px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
          <div style="flex:1">
            <div style="display:flex;align-items:center;gap:6px">
              <strong style="font-size:0.9rem">${escHtml(item.name)}</strong>
              ${statusBadge}
              ${trustBadge}
            </div>
            <div style="font-size:0.7rem;color:var(--text-muted);margin-top:2px">by ${escHtml(item.author)}</div>
          </div>
          <span class="cc-badge" style="background:var(--primary);color:#fff;font-size:0.65rem">${escHtml(categoryLabel)}</span>
        </div>
        <div style="color:var(--text-muted);font-size:0.8rem;margin-top:8px;line-height:1.4">
          ${escHtml((item.description || '').slice(0, 120))}${item.description?.length > 120 ? '...' : ''}
        </div>
        <div style="display:flex;gap:4px;margin-top:8px;flex-wrap:wrap">
          ${tags.map(tag => `<span class="cc-badge" style="background:rgba(255,255,255,0.1);font-size:0.65rem">${escHtml(tag)}</span>`).join('')}
        </div>
        <div style="display:flex;gap:6px;margin-top:10px;padding-top:8px;border-top:1px solid var(--border-rim)">
          ${isInstalling ? `
            <span style="font-size:0.75rem;color:var(--accent-gold)">Installing...</span>
          ` : isInstalled ? `
            <button class="cc-btn cc-btn--small cc-marketplace-scan" data-id="${escHtml(item.id)}">Re-scan</button>
            <button class="cc-btn cc-btn--small cc-btn--danger cc-marketplace-uninstall" data-id="${escHtml(item.id)}">Uninstall</button>
          ` : isQuarantined ? `
            <button class="cc-btn cc-btn--small cc-marketplace-scan" data-id="${escHtml(item.id)}">Re-scan</button>
            <button class="cc-btn cc-btn--small cc-btn--danger cc-marketplace-uninstall" data-id="${escHtml(item.id)}">Remove</button>
          ` : `
            <button class="cc-btn cc-btn--small cc-btn--primary cc-marketplace-install" data-id="${escHtml(item.id)}">Install</button>
          `}
          <a href="${escHtml(item.repoUrl)}" target="_blank" rel="noopener"
            style="font-size:0.75rem;color:var(--text-muted);text-decoration:none;margin-left:auto;display:flex;align-items:center;gap:4px">
            GitHub ↗
          </a>
        </div>
        ${item.securityScan ? this.renderScanSummary(item.securityScan) : ''}
      </div>`;
  }

  getStatusBadge(item) {
    const statusColors = {
      'installed': 'var(--accent-green)',
      'installing': 'var(--accent-gold)',
      'scanning': 'var(--accent-cyan)',
      'failed': 'var(--accent-red)',
      'quarantined': 'var(--accent-red)',
    };
    if (item.status === 'not-installed') return '';
    const color = statusColors[item.status] || 'var(--text-muted)';
    return `<span class="cc-badge" style="background:${color};color:#000;font-size:0.6rem">${escHtml(item.status)}</span>`;
  }

  getTrustBadge(item) {
    const trustColors = {
      'approved': 'var(--accent-green)',
      'scanned': 'var(--accent-cyan)',
      'quarantined': 'var(--accent-red)',
      'unverified': 'var(--text-muted)',
    };
    if (item.trustTier === 'unverified') return '';
    const color = trustColors[item.trustTier] || 'var(--text-muted)';
    return `<span class="cc-badge" style="background:${color};color:#000;font-size:0.6rem">${escHtml(item.trustTier)}</span>`;
  }

  renderScanSummary(scan) {
    if (!scan) return '';
    const passedStyle = scan.passed ? 'color:var(--accent-green)' : 'color:var(--accent-red)';
    const findingsCount = scan.findings?.length || 0;
    return `
      <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border-rim);font-size:0.7rem">
        <span style="${passedStyle}">${scan.passed ? 'PASS' : 'FAIL'}</span>
        <span style="color:var(--text-muted);margin-left:8px">Risk: ${scan.riskGrade || 'N/A'}</span>
        <span style="color:var(--text-muted);margin-left:8px">${findingsCount} finding${findingsCount !== 1 ? 's' : ''}</span>
        <span style="color:var(--text-muted);margin-left:8px">Scanner: ${scan.scanner}</span>
      </div>`;
  }

  renderHitlModal() {
    return `
      <div class="cc-marketplace-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:1000;justify-content:center;align-items:center">
        <div class="cc-card cc-marketplace-modal-content" style="max-width:500px;width:90%;padding:20px">
          <h3 style="margin:0 0 16px 0;font-size:1rem">Confirm Installation</h3>
          <div class="cc-marketplace-modal-body"></div>
          <div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end">
            <button class="cc-btn cc-marketplace-modal-cancel">Cancel</button>
            <button class="cc-btn cc-btn--primary cc-marketplace-modal-confirm">Install</button>
          </div>
        </div>
      </div>`;
  }

  filterItems() {
    let items = this.catalog;
    // Tab filter
    if (this.activeTab === 'Featured') {
      items = items.filter(i => i.featured);
    } else if (this.activeTab === 'Installed') {
      items = items.filter(i => i.status === 'installed');
    } else if (this.activeTab === 'Quarantined') {
      items = items.filter(i => i.status === 'quarantined');
    }
    // Category filter
    if (this.activeCategory !== 'all') {
      items = items.filter(i => i.category === this.activeCategory);
    }
    return items;
  }

  bindTabEvents() {
    // Tab chips - used by both catalog and adapter views
    this.container.querySelectorAll('.cc-marketplace-tab').forEach(chip => {
      chip.addEventListener('click', async () => {
        const newTab = chip.dataset.tab;
        const wasAdapter = this.activeTab === 'Adapter';
        const isAdapter = newTab === 'Adapter';
        this.activeTab = newTab;

        // If switching to/from Adapter tab, need full re-render
        if (wasAdapter !== isAdapter) {
          await this.render();
        } else if (!isAdapter) {
          // Within catalog tabs, just update cards
          this.container.querySelectorAll('.cc-marketplace-tab').forEach(c => c.classList.remove('active'));
          chip.classList.add('active');
          this.renderCards();
        }
      });
    });
  }

  bindEvents() {
    // Refresh button
    this.container.querySelector('.cc-marketplace-refresh')?.addEventListener('click', async () => {
      await this.fetchCatalog();
      this.render();
    });
    // Tab chips
    this.bindTabEvents();
    // Category chips
    this.container.querySelectorAll('.cc-marketplace-cat').forEach(chip => {
      chip.addEventListener('click', () => {
        this.activeCategory = chip.dataset.cat;
        this.container.querySelectorAll('.cc-marketplace-cat').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        this.renderCards();
      });
    });
    // Modal cancel
    this.container.querySelector('.cc-marketplace-modal-cancel')?.addEventListener('click', () => {
      this.closeModal();
    });
    // Modal confirm
    this.container.querySelector('.cc-marketplace-modal-confirm')?.addEventListener('click', async () => {
      await this.confirmInstall();
    });
  }

  bindCardActions() {
    // Install buttons
    this.container.querySelectorAll('.cc-marketplace-install').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        await this.requestInstall(id);
      });
    });
    // Scan buttons
    this.container.querySelectorAll('.cc-marketplace-scan').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        await this.requestScan(id);
      });
    });
    // Uninstall buttons
    this.container.querySelectorAll('.cc-marketplace-uninstall').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        await this.requestUninstall(id);
      });
    });
  }

  async requestInstall(itemId) {
    if (!this.client) return;
    try {
      const res = await fetch(`${this.client.baseUrl}/api/marketplace/install/${encodeURIComponent(itemId)}`, {
        method: 'POST',
      });
      if (!res.ok) {
        const err = await res.json();
        alert(`Install request failed: ${err.error || 'Unknown error'}`);
        return;
      }
      const data = await res.json();
      this.pendingInstall = {
        itemId,
        nonce: data.nonce,
        item: data.item,
        expiresAt: data.expiresAt,
      };
      this.showModal(data.item);
    } catch (e) {
      console.error('Install request failed:', e);
      alert('Failed to request installation. Check console for details.');
    }
  }

  showModal(item) {
    const modal = this.container.querySelector('.cc-marketplace-modal');
    const body = this.container.querySelector('.cc-marketplace-modal-body');
    if (!modal || !body) return;
    body.innerHTML = `
      <div style="margin-bottom:12px">
        <strong>${escHtml(item.name)}</strong> by ${escHtml(item.author)}
      </div>
      <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:12px">
        Repository: <a href="${escHtml(item.repoUrl)}" target="_blank" rel="noopener" style="color:var(--primary)">${escHtml(item.repoUrl)}</a>
      </div>
      <div style="font-size:0.8rem;margin-bottom:12px">
        <strong>Required Permissions:</strong>
        <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px">
          ${(item.requiredPermissions || []).map(p => `<span class="cc-badge" style="background:var(--accent-gold);color:#000">${escHtml(p)}</span>`).join('')}
        </div>
      </div>
      <div style="font-size:0.8rem;margin-bottom:12px">
        <strong>License:</strong> ${escHtml(item.licenseType || 'Unknown')}
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;padding:12px;background:rgba(0,0,0,0.3);border-radius:6px">
        <label style="display:flex;align-items:center;gap:8px;font-size:0.8rem;cursor:pointer">
          <input type="checkbox" class="cc-marketplace-sandbox" checked>
          Enable sandbox isolation (recommended)
        </label>
        <label style="display:flex;align-items:center;gap:8px;font-size:0.8rem;cursor:pointer">
          <input type="checkbox" class="cc-marketplace-scan-check" ${this.scanners.garak || this.scanners.promptfoo ? 'checked' : ''}>
          Run security scan after install
        </label>
      </div>`;
    modal.style.display = 'flex';
  }

  closeModal() {
    const modal = this.container.querySelector('.cc-marketplace-modal');
    if (modal) modal.style.display = 'none';
    this.pendingInstall = null;
  }

  async confirmInstall() {
    if (!this.pendingInstall || !this.client) {
      this.closeModal();
      return;
    }
    const sandboxEnabled = this.container.querySelector('.cc-marketplace-sandbox')?.checked ?? true;
    const runSecurityScan = this.container.querySelector('.cc-marketplace-scan-check')?.checked ?? false;
    try {
      const res = await fetch(`${this.client.baseUrl}/api/marketplace/install/${encodeURIComponent(this.pendingInstall.itemId)}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nonce: this.pendingInstall.nonce,
          sandboxEnabled,
          runSecurityScan,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(`Install confirmation failed: ${err.error || 'Unknown error'}`);
        this.closeModal();
        return;
      }
      this.closeModal();
      // Update local state optimistically
      const item = this.catalog.find(i => i.id === this.pendingInstall.itemId);
      if (item) item.status = 'installing';
      this.renderCards();
    } catch (e) {
      console.error('Install confirmation failed:', e);
      alert('Failed to confirm installation. Check console for details.');
      this.closeModal();
    }
  }

  async requestScan(itemId) {
    if (!this.client) return;
    try {
      const res = await fetch(`${this.client.baseUrl}/api/marketplace/scan/${encodeURIComponent(itemId)}`, {
        method: 'POST',
      });
      if (!res.ok) {
        const err = await res.json();
        alert(`Scan request failed: ${err.error || 'Unknown error'}`);
        return;
      }
      // Update local state
      const item = this.catalog.find(i => i.id === itemId);
      if (item) item.status = 'scanning';
      this.renderCards();
    } catch (e) {
      console.error('Scan request failed:', e);
    }
  }

  async requestUninstall(itemId) {
    if (!this.client) return;
    if (!confirm('Are you sure you want to uninstall this agent?')) return;
    try {
      const res = await fetch(`${this.client.baseUrl}/api/marketplace/uninstall/${encodeURIComponent(itemId)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = await res.json();
        alert(`Uninstall failed: ${err.error || 'Unknown error'}`);
        return;
      }
      // Update local state
      const item = this.catalog.find(i => i.id === itemId);
      if (item) {
        item.status = 'not-installed';
        item.trustTier = 'unverified';
        item.securityScan = undefined;
      }
      this.renderCards();
    } catch (e) {
      console.error('Uninstall request failed:', e);
    }
  }

  // Handle WebSocket events from server
  onEvent(data) {
    if (!data || !data.type) return;

    // Handle adapter events (forward to adapter panel if active)
    if (data.type.startsWith('adapter.')) {
      this.handleAdapterEvent(data);
      return;
    }

    // Handle marketplace catalog events
    const itemId = data.payload?.itemId;
    if (!itemId) return;
    const item = this.catalog.find(i => i.id === itemId);
    if (!item) return;

    switch (data.type) {
      case 'marketplace.installing':
        item.status = 'installing';
        this.renderCards();
        break;
      case 'marketplace.scanning':
        item.status = 'scanning';
        this.renderCards();
        break;
      case 'marketplace.installed':
        item.status = 'installed';
        item.installPath = data.payload.installPath;
        this.renderCards();
        break;
      case 'marketplace.scanned':
        item.securityScan = data.payload.result;
        item.status = data.payload.result?.passed ? 'installed' : 'quarantined';
        item.trustTier = data.payload.result?.passed ? 'scanned' : 'quarantined';
        this.renderCards();
        break;
      case 'marketplace.failed':
        item.status = 'failed';
        this.renderCards();
        break;
      case 'marketplace.uninstalled':
        item.status = 'not-installed';
        item.trustTier = 'unverified';
        item.securityScan = undefined;
        this.renderCards();
        break;
    }
  }

  // Handle adapter-specific WebSocket events
  handleAdapterEvent(data) {
    // Update progress UI if adapter panel is active
    if (this.activeTab !== 'Adapter' || !this.adapterPanel) return;

    const modal = document.querySelector('.cc-adapter-modal');
    const progressBar = modal?.querySelector('.cc-adapter-progress-bar');
    const progressMsg = modal?.querySelector('.cc-adapter-progress-msg');

    switch (data.type) {
      case 'adapter.progress':
        if (progressBar && data.payload?.progress !== undefined) {
          progressBar.style.width = `${data.payload.progress}%`;
        }
        if (progressMsg && data.payload?.message) {
          progressMsg.textContent = data.payload.message;
        }
        break;
      case 'adapter.installed':
      case 'adapter.uninstalled':
        // Refresh adapter panel state
        this.adapterPanel.render();
        break;
      case 'adapter.failed':
        if (progressMsg) {
          progressMsg.textContent = `Error: ${data.payload?.error || 'Unknown error'}`;
          progressMsg.style.color = 'var(--accent-red)';
        }
        break;
    }
  }

  renderRightPanel() {
    const installed = this.catalog.filter(i => i.status === 'installed').length;
    const quarantined = this.catalog.filter(i => i.status === 'quarantined').length;
    const scanned = this.catalog.filter(i => i.trustTier === 'scanned').length;
    return `
      <div class="cc-marketplace-side cc-card" style="padding: 16px;">
        <h3 style="margin: 0 0 16px 0; font-size: 14px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 8px;">Marketplace Stats</h3>
        <div style="display: flex; flex-direction: column; gap: 12px;">
          <div style="font-size: 11px; color: var(--text-muted);">
            Total agents: <strong>${this.catalog.length}</strong>
          </div>
          <div style="font-size: 11px; color: var(--text-muted);">
            Installed: <strong style="color: var(--accent-green);">${installed}</strong>
          </div>
          <div style="font-size: 11px; color: var(--text-muted);">
            Scanned: <strong style="color: var(--accent-cyan);">${scanned}</strong>
          </div>
          <div style="font-size: 11px; color: var(--text-muted);">
            Quarantined: <strong style="color: var(--accent-red);">${quarantined}</strong>
          </div>
          <div style="padding: 10px; background: rgba(0,0,0,0.2); border-radius: 4px; border-left: 2px solid var(--accent-gold); margin-top: 8px;">
            <div style="font-size: 10px; color: var(--text-muted); text-transform: uppercase;">Security Policy</div>
            <div style="font-size: 11px; font-weight: bold; color: var(--text-main); margin-top: 2px;">HITL Required</div>
          </div>
        </div>
      </div>
    `;
  }

  destroy() {
    if (this.container) this.container.innerHTML = '';
  }
}
