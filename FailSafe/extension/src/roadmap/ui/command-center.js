// FailSafe Unified Command Center — Main Entry Point
import { ConnectionClient } from './modules/connection.js';
import { StateStore } from './modules/state.js';
import { OverviewRenderer } from './modules/overview.js';
import { OperationsRenderer } from './modules/operations.js';
import { TransparencyRenderer } from './modules/transparency.js';
import { RisksRenderer } from './modules/risks.js';
import { SkillsRenderer } from './modules/skills.js';
import { GovernanceRenderer } from './modules/governance.js';
import { BrainstormRenderer } from './modules/brainstorm.js';
import { SettingsRenderer } from './modules/settings.js';
import { TimelineRenderer } from './modules/timeline.js';
import { GenomeRenderer } from './modules/genome.js';
import { ReplayRenderer } from './modules/replay.js';
import { IntegrationsRenderer } from './modules/integrations.js';
import { TabGroup } from './modules/tab-group.js';
import { updateTickers, updateBootstrapBanner } from './modules/tickers.js';
import { setWorkspaceRegistryClient, loadWorkspaceRegistry, initWorkspaceSelector } from './modules/workspace-registry.js';

document.addEventListener('DOMContentLoaded', () => {
  const client = new ConnectionClient();
  const store = new StateStore();

  const renderers = {
    overview:   new OverviewRenderer('overview', {}),
    agents:     new TabGroup('agents', [
      { key: 'operations', label: 'Operations', renderer: new OperationsRenderer('agents', { client }) },
      { key: 'timeline',   label: 'Timeline',   renderer: new TimelineRenderer('agents') },
      { key: 'genome',     label: 'Genome',     renderer: new GenomeRenderer('agents') },
      { key: 'replay',     label: 'Replay',     renderer: new ReplayRenderer('agents') },
    ]),
    governance: new TabGroup('governance', [
      { key: 'audit',      label: 'Audit Log',  renderer: new TransparencyRenderer('governance') },
      { key: 'risks',      label: 'Risks',      renderer: new RisksRenderer('governance', { client }) },
      { key: 'compliance', label: 'Compliance',  renderer: new GovernanceRenderer('governance', { client }) },
    ]),
    workspace: new TabGroup('workspace', [
      { key: 'skills',     label: 'Skills',     renderer: new SkillsRenderer('workspace', { client }) },
      { key: 'brainstorm', label: 'Mindmap',    renderer: new BrainstormRenderer('workspace', { store, client }) },
    ]),
    integrations: new IntegrationsRenderer('integrations', { client }),
    settings:   new SettingsRenderer('settings', { store }),
  };

  // Connection status indicator + disconnection banner
  const statusEls = document.querySelectorAll('.connection-status');
  const disconnectedBanner = document.getElementById('disconnected-banner');
  client.on('connection', (state) => {
    statusEls.forEach(el => {
      const colors = { connected: 'var(--accent-green)', connecting: 'var(--accent-gold)', disconnected: 'var(--accent-red)' };
      const labels = { connected: 'Live', connecting: 'Connecting', disconnected: 'Disconnected' };
      const c = colors[state] || colors.disconnected;
      el.innerHTML = `<span class="dot" style="background:${c};width:8px;height:8px;border-radius:50%;display:inline-block;margin-right:6px${state === 'connecting' ? ';animation:pulse 1s infinite' : ''}"></span><span style="color:var(--text-muted);font-size:0.8rem">${labels[state] || 'Unknown'}</span>`;
    });
    // Show/hide disconnection banner
    if (disconnectedBanner) {
      disconnectedBanner.style.display = state === 'disconnected' ? 'flex' : 'none';
      if (state === 'disconnected') {
        document.body.classList.add('workspace-disconnected');
        loadWorkspaceRegistry();
      } else {
        document.body.classList.remove('workspace-disconnected');
      }
    }
  });

  // Route hub data to tickers + all renderers
  client.on('hub', (data) => {
    updateTickers(data);
    updateBootstrapBanner(data);
    Object.values(renderers).forEach(r => r.render(data));
  });

  // Route events to relevant renderers
  client.on('event', (evt) => {
    renderers.overview.onEvent?.(evt);
    renderers.agents.onEvent?.(evt);
    renderers.governance.onEvent?.(evt);
    renderers.workspace.onEvent?.(evt);
    renderers.integrations.onEvent?.(evt);
    renderers.settings.onEvent?.(evt);
  });

  client.on('verdict', (v) => {
    const wrapped = { type: 'verdict', payload: v };
    renderers.overview.onEvent?.(wrapped);
    renderers.governance.onEvent?.(wrapped);
  });

  // B-B199-2 Phase 0: test-only renderer registry. Exposes the renderers
  // map for Playwright specs that need to synthesize WebSocket events
  // (FX535.8 + FX536.6 dispatch into `agents` TabGroup which propagates
  // to ReplayRenderer/GenomeRenderer sub-renderers per tab-group.js:58).
  // Benign in production: `__failsafe*` namespace + no secrets/tokens
  // exposed; renderers carry only DOM controllers.
  if (typeof globalThis !== 'undefined') {
    globalThis.__failsafeRenderers = renderers;
  }

  // Tab navigation with persistence
  const tabs = document.querySelectorAll('.tab-btn');
  const panels = document.querySelectorAll('.tab-panel');
  const contextHub = document.getElementById('context-hub');
  const panelToggle = document.getElementById('panel-toggle');

  let panelUserCollapsed = store.get('panel-collapsed') === 'true';

  const updateUIForPanelState = () => {
    const activeTab = document.querySelector('.tab-btn.active')?.dataset.target;
    const renderer = renderers[activeTab];
    const hasContext = renderer && !!renderer.renderRightPanel;

    if (contextHub) {
      if (panelUserCollapsed || !hasContext) {
        contextHub.classList.add('hidden');
      } else {
        const html = renderer.renderRightPanel();
        if (!html) {
          contextHub.classList.add('hidden');
        } else {
          contextHub.classList.remove('hidden');
          contextHub.innerHTML = html;
          if (renderer.bindToolbar) renderer.bindToolbar();
        }
      }
    }

    const panelVisible = contextHub && !contextHub.classList.contains('hidden');
    if (panelToggle) {
      panelToggle.classList.toggle('collapsed', panelUserCollapsed);
      panelToggle.innerHTML = panelUserCollapsed
        ? '<span class="btn-icon">◂</span> Show Sidebar'
        : '<span class="btn-icon">▸</span> Hide Sidebar';
      panelToggle.style.display = (hasContext && (panelVisible || panelUserCollapsed)) ? 'flex' : 'none';
    }
  };

  // Wire sub-view pill switches to update right panel
  renderers.agents.onSubViewSwitch = () => updateUIForPanelState();
  renderers.governance.onSubViewSwitch = () => updateUIForPanelState();
  renderers.workspace.onSubViewSwitch = () => updateUIForPanelState();

  panelToggle?.addEventListener('click', () => {
    panelUserCollapsed = !panelUserCollapsed;
    store.set('panel-collapsed', panelUserCollapsed);
    updateUIForPanelState();
    window.dispatchEvent(new Event('resize'));
  });

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      const targetId = tab.dataset.target;
      const target = document.getElementById(targetId);
      if (target) target.classList.add('active');

      const contentArea = document.querySelector('.content-area');
      if (contentArea) contentArea.style.overflowY = 'auto';

      // Update Right Panel (Intelligence/Action)
      updateUIForPanelState();

      // Initial render for tab activation
      const renderer = renderers[targetId];
      if (renderer) renderer.render?.(client.lastHubData || {});

      store.setActiveTab(targetId);
    });
  });

  // Global listeners for LLM interactive tier list
  window.addEventListener('fs-reorder-llm', (e) => {
    const br = renderers.workspace;
    const bsRenderer = br?.subViews?.find(s => s.key === 'brainstorm')?.renderer;
    if (bsRenderer?.llmStatus) { bsRenderer.llmStatus.reorderLlm(e.detail.index, e.detail.dir); bsRenderer.llmStatus.render(bsRenderer.client); }
  });
  window.addEventListener('fs-toggle-llm-help', () => {
    const br = renderers.workspace;
    const bsRenderer = br?.subViews?.find(s => s.key === 'brainstorm')?.renderer;
    if (bsRenderer?.llmStatus) { bsRenderer.llmStatus.toggleHelp(); bsRenderer.llmStatus.render(bsRenderer.client); }
  });

  // Restore saved tab (URL hash takes priority). Strip the query suffix so
  // deep-link parameters like `#governance?verdict=<ts>` still resolve the
  // correct tab name. Renderers parse the query themselves.
  const hashRaw = window.location.hash?.replace('#', '') || '';
  const hashTab = hashRaw.split('?')[0];
  const savedTab = hashTab || store.getActiveTab();
  const savedBtn = [...tabs].find(t => t.dataset.target === savedTab);
  if (savedBtn) savedBtn.click();

  // Theme restore
  const saved = store.getTheme();
  if (saved) store.setTheme(saved);

  // Wire workspace isolation
  setWorkspaceRegistryClient(client);
  initWorkspaceSelector();

  client.start();
});
