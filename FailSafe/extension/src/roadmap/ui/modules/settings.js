// FailSafe Command Center — Settings Renderer
// Theme selector, current config display.
import { renderVoiceSettings, bindVoiceSettings } from './voice-settings.js';
import { renderInstallSkillsCard, bindInstallSkillsCard } from './install-skills-card.js';
import { renderNotificationsCard, renderBrainstormCard, bindNotificationsCard, bindBrainstormCard } from './settings-extras.js';
import { escapeHtml } from './brainstorm-templates.js';

// Sentinel attr name used across all bind paths to make listener wiring
// idempotent: a node carrying data-cc-bound="1" already has its listener
// attached and must NOT receive a second addEventListener of the same kind.
const BOUND_ATTR = 'data-cc-bound';
function bindOnce(node, evt, handler) {
  if (!node || node.getAttribute?.(BOUND_ATTR) === '1') return;
  node.addEventListener(evt, handler);
  node.setAttribute?.(BOUND_ATTR, '1');
}

const THEMES = [
  { id: 'pegasus', name: 'Pegasus', label: 'Light', swatch: '#3b82f6' },
  { id: 'mythiq', name: 'Mythiq', label: 'Dark', swatch: '#6366f1' },
  { id: 'midnight', name: 'Midnight', label: 'Pitch', swatch: '#475569' },
  { id: 'aurora', name: 'Aurora', label: 'Teal', swatch: '#2dd4bf' },
  { id: 'crimson', name: 'Crimson', label: 'Red', swatch: '#ef4444' },
  { id: 'atmosphere', name: 'Atmosphere', label: 'Sky', swatch: '#38bdf8' },
];

export class SettingsRenderer {
  constructor(containerId, deps = {}) {
    this.container = document.getElementById(containerId);
    this.store = deps.store || null;
    this._lastHub = {};
    this._installState = { running: false, steps: [], lastReport: null };
  }

  render(hubData) {
    if (!this.container) return;
    if (hubData && Object.keys(hubData).length) this._lastHub = hubData;
    const hub = this._lastHub;
    const current = this.store?.getTheme() || 'mythiq';
    const version = hub.version || 'unknown';

    this.container.innerHTML = `
      <div class="cc-card" style="margin-bottom:16px">
        <div style="${LBL};margin-bottom:12px">Theme</div>
        <div class="cc-theme-chips" style="display:flex;gap:10px;flex-wrap:wrap">${THEMES.map(t => this.renderChip(t, current)).join('')}</div>
      </div>
      <div class="cc-card">
        <div style="${LBL};margin-bottom:8px">Configuration</div>
        <div style="font-size:0.85rem">
          <div style="padding:4px 0;border-bottom:1px solid var(--border-rim)">Theme: <strong>${escapeHtml(current)}</strong></div>
          <div style="padding:4px 0;border-bottom:1px solid var(--border-rim)">Version: <strong>${escapeHtml(version)}</strong></div>
          <div style="padding:4px 0">Server: <strong>${escapeHtml(window.location.origin)}</strong></div>
        </div>
      </div>
      ${renderVoiceSettings(this.store)}
      ${renderNotificationsCard(this.store)}
      ${renderBrainstormCard(this.store)}
      <div class="cc-card" id="cc-hook-toggle-slot" style="margin-top:16px"></div>
      ${renderInstallSkillsCard(this._installState, hub)}
      ${renderGovernanceModeCard(hub)}
      ${renderQorVersionWarning(hub)}
      ${renderFailSafeProCard()}`;
    this._bindQorLogicActions();
    this._bindFailSafeProActions();
    this._bindGovernanceModeActions();
    this.bindChips();
    bindVoiceSettings(this.container, this.store);
    bindNotificationsCard(this.container, this.store);
    bindBrainstormCard(this.container, this.store);
    this._renderHookToggle();
  }

  _bindGovernanceModeActions() {
    const card = this.container?.querySelector('#cc-governance-mode');
    if (!card) return;
    card.querySelectorAll('[data-governance-mode]').forEach((btn) => {
      bindOnce(btn, 'click', () => {
        const mode = btn.getAttribute('data-governance-mode');
        if (!mode) return;
        // Host command opens a QuickPick; arg is advisory pre-selection only.
        try { window.location.href = `command:failsafe.setGovernanceMode?${encodeURIComponent(JSON.stringify([mode]))}`; } catch { /* host-managed */ }
      });
    });
  }

  _bindFailSafeProActions() {
    const aboutLink = this.container?.querySelector('[data-action="open-failsafe-pro-about"]');
    // Webview anchor + target=_blank handles navigation; command-uri provides
    // VS Code-native external open as backup. Destination is About, never download.
    bindOnce(aboutLink, 'click', (e) => {
      try { e.preventDefault(); window.location.href = 'command:failsafe.openFailSafeProAbout'; }
      catch { window.open('https://mythologiq.studio/products/failsafe-pro', '_blank', 'noopener'); }
    });
  }

  _bindQorLogicActions() {
    if (!this.container) return;
    // onFinishFetch is a no-op: WebSocket onEvent below is authoritative
    // for skills.install.progress + skills.install.complete events.
    bindInstallSkillsCard(this.container, {
      onStart: () => { this._installState = { running: true, steps: [], lastReport: null }; },
      onFinishFetch: () => {},
      onError: () => { this._installState = { ...this._installState, running: false }; },
    });
  }

  async _renderHookToggle() {
    const slot = this.container?.querySelector('#cc-hook-toggle-slot');
    if (!slot) return;
    try {
      const res = await fetch('/api/hooks/status');
      if (!res.ok) { slot.remove(); return; }
      const { enabled } = await res.json();
      slot.innerHTML = `<div style="${LBL};margin-bottom:8px">Claude Code Hooks</div>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" class="cc-hook-toggle" ${enabled ? 'checked' : ''} />
          <span style="font-size:0.85rem">FailSafe governance hooks</span>
        </label>`;
      bindOnce(slot.querySelector('.cc-hook-toggle'), 'change', (e) => this._toggleHook(e.target));
    } catch {
      slot.remove();
    }
  }

  async _toggleHook(checkbox) {
    try {
      const r = await fetch('/api/hooks/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: checkbox.checked }),
      });
      if (!r.ok) throw new Error(`${r.status}`);
    } catch {
      checkbox.checked = !checkbox.checked;
    }
  }

  renderChip(theme, current) {
    const active = theme.id === current ? ' active' : '';
    return `<button class="cc-chip cc-theme-select${active}" data-theme="${theme.id}" style="display:flex;align-items:center;gap:6px;padding:6px 14px">
        <span style="width:12px;height:12px;border-radius:50%;background:${theme.swatch};border:2px solid var(--border-rim)"></span>
        <span>${theme.name}</span><span style="font-size:0.65rem;color:var(--text-muted)">${theme.label}</span>
      </button>`;
  }

  bindChips() {
    this.container.querySelectorAll('.cc-theme-select').forEach(chip => {
      bindOnce(chip, 'click', () => {
        if (!this.store) return;
        this.store.setTheme(chip.dataset.theme);
        this.container.querySelectorAll('.cc-theme-select').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
      });
    });
  }

  onEvent(event) {
    if (!event || typeof event !== 'object') return;
    // Round 2 / Issue #49: payload field renamed `step` → `invocation` and
    // report shape changed from `steps[]` to `invocations[]`. Backwards
    // compatibility shim removed; round 2 owns the breaking ABI change.
    if (event.type === 'skills.install.progress' && event.invocation) {
      this._installState = {
        running: true,
        invocations: [...(this._installState?.invocations ?? []), event.invocation],
        lastReport: this._installState?.lastReport ?? null,
      };
      this._refreshInstallCard();
      return;
    }
    if (event.type === 'skills.install.complete' && event.report) {
      this._installState = {
        running: false,
        invocations: event.report.invocations ?? this._installState?.invocations ?? [],
        lastReport: event.report,
      };
      this._refreshInstallCard();
      return;
    }
  }

  /**
   * Targeted update of the QorLogic install card only, NOT the entire
   * Settings panel. The previous full this.render(...) call on every progress
   * event tore down + rebuilt theme chips, voice settings, hook toggle, and
   * Pro card every time — which the user perceived as the tab "flashing to
   * another screen".
   */
  _refreshInstallCard() {
    const slot = this.container?.querySelector('#cc-qorlogic');
    if (!slot) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = renderInstallSkillsCard(this._installState, this._lastHub).trim();
    const next = tmp.firstElementChild;
    if (!next) return;
    slot.replaceWith(next);
    this._bindQorLogicActions();
  }
  destroy() {
    if (this._destroyed) return;
    if (this.container) this.container.innerHTML = '';
    this._lastHub = {}; this._installState = { running: false, steps: [], lastReport: null };
    this._destroyed = true;
  }
}

const MODE_OPTIONS = [{ id: 'observe', label: 'Observe' }, { id: 'assist', label: 'Assist' }, { id: 'enforce', label: 'Enforce' }];
const LBL = 'font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.08em';

function renderFailSafeProCard() {
  return `<div class="cc-card" id="cc-failsafe-pro" style="margin-top:16px">
      <div style="${LBL};margin-bottom:8px">FailSafe Pro</div>
      <p style="font-size:0.85rem;color:var(--text-muted);margin:0 0 12px">Desktop native application for SDLC visibility and governance: OS-level enforcement, file locking, team workflows, and remote connections beyond the editor boundary.</p>
      <a href="https://mythologiq.studio/products/failsafe-pro" target="_blank" rel="noopener" class="cc-btn cc-btn--primary" data-action="open-failsafe-pro-about" style="display:inline-block;font-size:0.8rem;padding:6px 14px;text-decoration:none">About FailSafe Pro</a>
    </div>`;
}

function renderGovernanceModeCard(hub) {
  const state = hub?.governanceModeState || { mode: 'observe', defaulted: true };
  const current = String(state.mode || 'observe');
  const defaulted = state.defaulted === true;
  const hint = defaulted ? `<p style="font-size:0.8rem;color:var(--text-muted);margin:0 0 10px">You're in Observe mode by default. Switch to Assist when ready to enable governance suggestions, or Enforce for hard gating.</p>` : '';
  const buttons = MODE_OPTIONS.map((m) => {
    const active = m.id === current;
    const cls = active ? 'cc-btn cc-btn--primary' : 'cc-btn';
    const aria = active ? 'aria-pressed="true"' : '';
    return `<button class="${cls}" data-governance-mode="${escapeHtml(m.id)}" style="font-size:0.8rem;padding:6px 14px" ${aria}>${escapeHtml(m.label)}</button>`;
  }).join('');
  const tag = defaulted ? ' <span style="color:var(--text-muted)">(default)</span>' : '';
  const label = escapeHtml(current.charAt(0).toUpperCase() + current.slice(1));
  return `<div class="cc-card" id="cc-governance-mode" style="margin-top:16px">
      <div style="${LBL};margin-bottom:8px">Governance Mode</div>
      <div style="font-size:0.9rem;margin-bottom:10px">Mode: <strong data-governance-current>${label}</strong>${tag}</div>
      ${hint}
      <div style="display:flex;gap:8px;flex-wrap:wrap">${buttons}</div>
    </div>`;
}

function renderQorVersionWarning(hub) {
  const status = hub?.qorLogic?.versionStatus;
  if (!status || status.meetsFloor !== false) return '';
  const installed = status.installed ? escapeHtml(String(status.installed)) : 'not installed';
  const minimum = escapeHtml(String(status.minimum || ''));
  return `<div class="cc-card" id="cc-qor-version-warning" data-state="below-floor" style="margin-top:16px;border-left:3px solid var(--accent-gold,#f5a524)">
      <div style="${LBL};color:var(--accent-gold,#f5a524);margin-bottom:6px">qor-logic Version Warning</div>
      <div style="font-size:0.9rem;margin-bottom:6px">qor-logic Python package version below minimum</div>
      <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:8px">Installed: <strong>${installed}</strong> &mdash; minimum required: <strong>${minimum}</strong></div>
      <div style="font-size:0.8rem;color:var(--text-muted)">Reinstall via Settings &rarr; Install qor-logic.</div>
    </div>`;
}
