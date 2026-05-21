// FailSafe Command Center — Skills & Intent Renderer
// Intent shell, ingest toolbar, 4-tab browser, category chips, skill card grid.
// Includes view toggle for Marketplace (Beta)
import { escHtml, displayTag, skillTags } from './skill-utils.js';
import { MarketplaceRenderer } from './marketplace.js';

const SKILL_TABS = ['Recommended', 'All Relevant', 'Installed', 'Other'];
const VIEW_MODES = ['Skills', 'Marketplace'];

export class SkillsRenderer {
  constructor(containerId, deps = {}) {
    this.container = document.getElementById(containerId);
    this.client = deps.client || null;
    this.skills = [];
    this.relevance = [];
    this.activeTab = 'Recommended';
    this.activeCat = 'All';
    this.currentPhase = '';
    this.viewMode = 'Skills';
    this.marketplaceRenderer = null;
  }

  async render(hubData) {
    if (!this.container) return;
    // B198 Phase 1: retain the last hub so a cache-invalidating event can
    // re-render from the freshest payload without a new fetch API.
    this._lastHub = hubData;
    this.currentPhase = hubData.runState?.currentPhase || '';

    // Render view toggle first
    this.container.innerHTML = this.renderViewToggle();

    // Create content container
    const contentDiv = document.createElement('div');
    contentDiv.className = 'cc-skills-content';
    this.container.appendChild(contentDiv);

    this.bindViewToggle();

    if (this.viewMode === 'Marketplace') {
      await this.renderMarketplace(contentDiv, hubData);
    } else {
      await this.renderSkillsView(contentDiv, hubData);
    }
  }

  renderViewToggle() {
    return `
      <div style="display:flex;gap:8px;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid var(--border-rim)">
        ${VIEW_MODES.map(mode => `
          <button class="cc-chip cc-view-toggle${mode === this.viewMode ? ' active' : ''}" data-mode="${mode}">
            ${mode}${mode === 'Marketplace' ? ' <span style="font-size:0.65rem;opacity:0.7">(Beta)</span>' : ''}
          </button>
        `).join('')}
      </div>`;
  }

  bindViewToggle() {
    this.container.querySelectorAll('.cc-view-toggle').forEach(btn => {
      btn.addEventListener('click', async () => {
        const newMode = btn.dataset.mode;
        if (newMode === this.viewMode) return;
        this.viewMode = newMode;
        this.container.querySelectorAll('.cc-view-toggle').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const contentDiv = this.container.querySelector('.cc-skills-content');
        if (contentDiv) {
          if (this.viewMode === 'Marketplace') {
            await this.renderMarketplace(contentDiv, { runState: { currentPhase: this.currentPhase } });
          } else {
            await this.renderSkillsView(contentDiv, { runState: { currentPhase: this.currentPhase } });
          }
        }
      });
    });
  }

  async renderMarketplace(contentDiv, hubData) {
    contentDiv.id = 'cc-marketplace-container';
    contentDiv.innerHTML = '';
    if (!this.marketplaceRenderer) {
      this.marketplaceRenderer = new MarketplaceRenderer('cc-marketplace-container', { client: this.client });
    }
    await this.marketplaceRenderer.render(hubData);
  }

  async renderSkillsView(contentDiv, hubData) {
    if (this.client && !this.skills.length) {
      const data = await this.client.fetchSkills();
      this.skills = data?.skills || [];
    }
    contentDiv.innerHTML = `
      ${this.renderIntentShell()}
      ${this.renderToolbar()}
      ${this.renderTabs()}
      ${this.renderCategoryChips()}
      <div class="cc-skill-grid cc-grid-2"></div>`;
    this.bindSkillEvents(contentDiv);
    this.renderCards(contentDiv);
  }

  renderIntentShell() {
    return `
      <div class="cc-card" style="margin-bottom:12px">
        <div style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;
          letter-spacing:0.08em;margin-bottom:6px">Governance Intent</div>
        <textarea class="cc-intent-input" rows="3" placeholder="Describe your governance intent..."
          style="width:100%;padding:8px;background:var(--bg-dark);color:var(--text-main);
            border:1px solid var(--border-rim);border-radius:6px;resize:vertical;
            font-family:var(--font-body);font-size:0.85rem"></textarea>
        <div style="display:flex;gap:6px;margin-top:6px">
          <button class="cc-btn cc-intent-copy">Copy</button>
        </div>
      </div>`;
  }

  renderToolbar() {
    return `
      <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:center">
        <button class="cc-btn cc-btn--primary cc-skill-auto">Auto Ingest</button>
        <button class="cc-btn cc-skill-manual">Manual Ingest</button>
        <select class="cc-skill-phase" style="padding:6px 10px;background:var(--bg-dark);
          color:var(--text-main);border:1px solid var(--border-rim);border-radius:6px;font-size:0.8rem">
          <option value="">All Phases</option>
          <option value="PLAN"${this.currentPhase === 'PLAN' ? ' selected' : ''}>Plan</option>
          <option value="GATE"${this.currentPhase === 'GATE' ? ' selected' : ''}>Gate</option>
          <option value="IMPLEMENT"${this.currentPhase === 'IMPLEMENT' ? ' selected' : ''}>Implement</option>
          <option value="SUBSTANTIATE"${this.currentPhase === 'SUBSTANTIATE' ? ' selected' : ''}>Substantiate</option>
        </select>
      </div>`;
  }

  renderTabs() {
    return `<div style="display:flex;gap:6px;margin-bottom:12px">${SKILL_TABS.map(t =>
      `<button class="cc-chip cc-skill-tab${t === this.activeTab ? ' active' : ''}" data-tab="${t}">${t}</button>`
    ).join('')}</div>`;
  }

  renderCategoryChips() {
    const activeLabel = this.activeCat === 'All' ? '' : displayTag(this.activeCat);
    return `
      <div class="cc-tag-filter" style="position:relative;margin-bottom:12px;display:flex;gap:6px;align-items:center">
        <input class="cc-tag-input" type="text" placeholder="Filter by tag\u2026"
          value="${escHtml(activeLabel)}"
          style="flex:1;max-width:260px;padding:6px 10px;background:var(--bg-dark);color:var(--text-main);
            border:1px solid var(--border-rim);border-radius:6px;font-size:0.8rem;font-family:var(--font-body)">
        ${this.activeCat !== 'All' ? `<button class="cc-btn cc-tag-clear" style="font-size:0.75rem;padding:4px 8px">Clear</button>` : ''}
        <div class="cc-tag-suggestions" style="display:none;position:absolute;top:100%;left:0;
          max-width:260px;width:100%;max-height:180px;overflow-y:auto;z-index:20;
          background:var(--bg-dark);border:1px solid var(--border-rim);border-radius:6px;
          margin-top:2px"></div>
      </div>`;
  }

  getAvailableTags() {
    const pool = this.activeTab === 'Installed' ? this.skills.filter(s => s.installed)
      : this.activeTab === 'Other' ? this.skills.filter(s => !s.installed)
      : this.skills;
    return Array.from(new Set(pool.flatMap(s => skillTags(s)))).sort();
  }

  bindSkillEvents(contentDiv) {
    const root = contentDiv || this.container;
    root.querySelector('.cc-intent-copy')?.addEventListener('click', () => {
      const text = root.querySelector('.cc-intent-input')?.value || '';
      if (text) navigator.clipboard.writeText(text);
    });
    root.querySelector('.cc-skill-auto')?.addEventListener('click', async () => {
      try {
        if (this.client) await this.client.postAction('/api/skills/ingest/auto');
      } catch (_) { /* logged by postAction */ }
    });
    root.querySelector('.cc-skill-manual')?.addEventListener('click', async () => {
      try {
        if (this.client) await this.client.postAction('/api/skills/ingest/manual', { items: [], mode: 'file' });
      } catch (_) { /* logged by postAction */ }
    });
    root.querySelector('.cc-skill-phase')?.addEventListener('change', async (e) => {
      if (!this.client) return;
      const data = await this.client.fetchRelevance(e.target.value);
      this.relevance = data?.skills || [];
      this.renderCards(contentDiv);
    });
    this.bindTabChips(contentDiv);
    this.bindTagFilter(contentDiv);
  }

  bindTabChips(contentDiv) {
    const root = contentDiv || this.container;
    root.querySelectorAll('.cc-skill-tab').forEach(chip => {
      chip.addEventListener('click', () => {
        this.activeTab = chip.dataset.tab;
        root.querySelectorAll('.cc-skill-tab').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        this.activeCat = 'All';
        this.reRenderCategoryChips(contentDiv);
        this.renderCards(contentDiv);
      });
    });
  }

  bindTagFilter(contentDiv) {
    const root = contentDiv || this.container;
    const input = root.querySelector('.cc-tag-input');
    const sugBox = root.querySelector('.cc-tag-suggestions');
    const clearBtn = root.querySelector('.cc-tag-clear');
    if (!input || !sugBox) return;

    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      if (!q) { sugBox.style.display = 'none'; return; }
      const matches = this.getAvailableTags().filter(t => t.includes(q));
      if (!matches.length) { sugBox.style.display = 'none'; return; }
      sugBox.innerHTML = matches.map(t =>
        `<div class="cc-tag-option" data-tag="${escHtml(t)}"
          style="padding:6px 10px;cursor:pointer;font-size:0.8rem;color:var(--text-main)"
          onmouseenter="this.style.background='var(--primary)'"
          onmouseleave="this.style.background='transparent'">${escHtml(displayTag(t))}</div>`
      ).join('');
      sugBox.style.display = 'block';
      sugBox.querySelectorAll('.cc-tag-option').forEach(opt => {
        opt.addEventListener('click', () => {
          this.activeCat = opt.dataset.tag;
          input.value = displayTag(opt.dataset.tag);
          sugBox.style.display = 'none';
          this.reRenderCategoryChips(contentDiv);
          this.renderCards(contentDiv);
        });
      });
    });

    input.addEventListener('blur', () => setTimeout(() => { sugBox.style.display = 'none'; }, 150));
    input.addEventListener('focus', () => { if (input.value.trim()) input.dispatchEvent(new Event('input')); });

    clearBtn?.addEventListener('click', () => {
      this.activeCat = 'All';
      this.reRenderCategoryChips(contentDiv);
      this.renderCards(contentDiv);
    });
  }

  reRenderCategoryChips(contentDiv) {
    const root = contentDiv || this.container;
    const wrapper = root.querySelector('.cc-tag-filter');
    if (!wrapper) return;
    wrapper.outerHTML = this.renderCategoryChips();
    this.bindTagFilter(contentDiv);
  }

  renderCards(contentDiv) {
    const root = contentDiv || this.container;
    const grid = root.querySelector('.cc-skill-grid');
    if (!grid) return;
    const filtered = this.filterByTab();
    if (!filtered.length) {
      grid.innerHTML = `
        <div class="cc-card" style="grid-column:1/-1;min-height:180px;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center">
          <div style="font-size:0.95rem;font-weight:600;color:var(--text-main);margin-bottom:6px">Skill bank is ready</div>
          <div style="font-size:0.82rem;color:var(--text-muted);max-width:420px">
            No skills matched this filter yet. Run Auto Ingest or switch tabs to start assembling your plan toolkit.
          </div>
        </div>`;
      return;
    }
    grid.innerHTML = filtered.map(s => this.renderCard(s)).join('');
  }

  renderCard(s) {
    const tags = skillTags(s).slice(0, 3);
    const sourceCredit = s.sourceCredit || s.creator || '';
    const normalizedId = s.id || s.key || '';
    return `
      <div class="cc-card" style="padding:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:6px">
          <strong style="font-size:0.9rem">${escHtml(s.name || s.displayName || s.id || 'Skill')}</strong>
          <div style="display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end">
            ${tags.map(tag => `<span class="cc-badge" style="background:var(--primary);color:#fff">${escHtml(displayTag(tag))}</span>`).join('')}
          </div>
        </div>
        <div style="color:var(--text-muted);font-size:0.8rem;margin-top:4px">
          ${escHtml((s.description || s.desc || '').slice(0, 100))}
        </div>
        ${normalizedId ? `<div style="margin-top:4px"><span style="font-size:0.65rem;color:var(--text-muted)">ID: ${escHtml(normalizedId)}</span></div>` : ''}
        ${sourceCredit ? `<div style="margin-top:4px"><span style="font-size:0.65rem;color:var(--text-muted)">Source: ${escHtml(sourceCredit)}</span></div>` : ''}
      </div>`;
  }

  filterByTab() {
    let pool;
    if (this.activeTab === 'Recommended') pool = this.relevance.slice(0, 20);
    else if (this.activeTab === 'All Relevant') pool = this.relevance;
    else if (this.activeTab === 'Installed') pool = this.skills.filter(s => s.installed);
    else pool = this.skills.filter(s => !s.installed);
    if (this.activeCat !== 'All') {
      pool = pool.filter(s => skillTags(s).includes(this.activeCat));
    }
    return pool;
  }

  onEvent(data) {
    // Forward marketplace events to marketplace renderer
    if (this.viewMode === 'Marketplace' && this.marketplaceRenderer) {
      if (data?.type?.startsWith('marketplace.')) {
        this.marketplaceRenderer.onEvent(data);
      }
    }
    // B198 Phase 1 (OQ-A): a skills.* / voicePack.* event means the installed
    // set changed — drop the cached list so the next renderSkillsView re-fetches
    // (its !this.skills.length guard becomes true), then re-render from the
    // last hub. Unrelated events leave the cache intact.
    const type = data?.type || '';
    if (type.startsWith('skills.') || type.startsWith('voicePack.')) {
      this.skills = [];
      if (this._lastHub) this.render(this._lastHub);
    }
  }

  renderRightPanel() {
    // Delegate to marketplace if in that view
    if (this.viewMode === 'Marketplace' && this.marketplaceRenderer) {
      return this.marketplaceRenderer.renderRightPanel();
    }
    return `
      <div class="cc-skills-side cc-card" style="padding: 16px;">
        <h3 style="margin: 0 0 16px 0; font-size: 14px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 8px;">Codex Statistics</h3>
        <div style="display: flex; flex-direction: column; gap: 12px;">
          <div style="font-size: 11px; color: var(--text-muted);">
            Total indexed skills: <strong>${this.skills.length}</strong>
          </div>
          <div style="font-size: 11px; color: var(--text-muted);">
            Active relevance score: <strong style="color: var(--accent-cyan); font-family: var(--font-mono);">${this.relevance.length ? 'CALC_PASS' : 'IDLE'}</strong>
          </div>
          <div style="padding: 10px; background: rgba(0,0,0,0.2); border-radius: 4px; border-left: 2px solid var(--accent-gold); margin-top: 8px;">
            <div style="font-size: 10px; color: var(--text-muted); text-transform: uppercase;">Permission Boundary</div>
            <div style="font-size: 11px; font-weight: bold; color: var(--text-main); margin-top: 2px;">Local Scope Only</div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * B198 Phase 3: re-render-safe teardown (RD-4). Tears down the marketplace
   * sub-renderer, clears the container DOM (detaching listeners bound during
   * render), and drops the cached skills list + last-hub reference. A later
   * render() re-initializes cleanly — re-fetching skills and re-binding events.
   */
  destroy() {
    if (this.marketplaceRenderer) {
      this.marketplaceRenderer.destroy();
      this.marketplaceRenderer = null;
    }
    if (this.container) this.container.innerHTML = '';
    this.skills = [];
    this._lastHub = null;
  }
}