// FailSafe Command Center — Settings Renderer
// Theme selector, current config display.
import { renderVoiceSettings, bindVoiceSettings } from './voice-settings.js';
import { renderInstallSkillsCard, bindInstallSkillsCard } from './install-skills-card.js';

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
        <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;
          letter-spacing:0.08em;margin-bottom:12px">Theme</div>
        <div class="cc-theme-chips" style="display:flex;gap:10px;flex-wrap:wrap">
          ${THEMES.map(t => this.renderChip(t, current)).join('')}
        </div>
      </div>
      <div class="cc-card">
        <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;
          letter-spacing:0.08em;margin-bottom:8px">Configuration</div>
        <div style="font-size:0.85rem">
          <div style="padding:4px 0;border-bottom:1px solid var(--border-rim)">
            Theme: <strong>${current}</strong></div>
          <div style="padding:4px 0;border-bottom:1px solid var(--border-rim)">
            Version: <strong>${version}</strong></div>
          <div style="padding:4px 0">
            Server: <strong>${window.location.origin}</strong></div>
        </div>
      </div>
      ${renderVoiceSettings(this.store)}
      <div class="cc-card" id="cc-hook-toggle-slot" style="margin-top:16px"></div>
      ${renderInstallSkillsCard(this._installState)}
      <div class="cc-card" id="cc-failsafe-pro" style="margin-top:16px">
        <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;
          letter-spacing:0.08em;margin-bottom:8px">FailSafe Pro</div>
        <p style="font-size:0.85rem;color:var(--text-muted);margin:0 0 12px">
          Desktop native application for SDLC visibility and governance:
          OS-level enforcement, file locking, team workflows, and remote
          connections beyond the editor boundary.
        </p>
        <a href="https://mythologiq.studio/products/failsafe-pro" target="_blank" rel="noopener"
          class="cc-btn cc-btn--primary"
          data-action="open-failsafe-pro-about"
          style="display:inline-block;font-size:0.8rem;padding:6px 14px;text-decoration:none">
          About FailSafe Pro
        </a>
      </div>`;
    this._bindQorLogicActions();
    this._bindFailSafeProActions();
    this.bindChips();
    bindVoiceSettings(this.container, this.store);
    this._renderHookToggle();
  }

  _bindFailSafeProActions() {
    const aboutLink = this.container?.querySelector('[data-action="open-failsafe-pro-about"]');
    if (!aboutLink) return;
    aboutLink.addEventListener('click', (e) => {
      // In webview contexts the anchor + target=_blank handles navigation; the
      // command-uri path provides VS Code-native external open as a backup.
      // Either way the destination is the About URL, never the download URL.
      try {
        e.preventDefault();
        window.location.href = 'command:failsafe.openFailSafeProAbout';
      } catch {
        window.open('https://mythologiq.studio/products/failsafe-pro', '_blank', 'noopener');
      }
    });
  }

  _bindQorLogicActions() {
    if (!this.container) return;
    bindInstallSkillsCard(this.container, {
      onStart: () => {
        this._installState = { running: true, steps: [], lastReport: null };
      },
      onFinishFetch: () => {
        // The progress + complete events arrive via WebSocket onEvent below;
        // they are the authoritative source. The fetch-resolve here just
        // marks the request flight done.
      },
      onError: () => {
        this._installState = { ...this._installState, running: false };
      },
    });
  }

  async _renderHookToggle() {
    const slot = this.container?.querySelector('#cc-hook-toggle-slot');
    if (!slot) return;
    try {
      const res = await fetch('/api/hooks/status');
      if (!res.ok) { slot.remove(); return; }
      const { enabled } = await res.json();
      slot.innerHTML = `
        <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;
          letter-spacing:0.08em;margin-bottom:8px">Claude Code Hooks</div>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" class="cc-hook-toggle" ${enabled ? 'checked' : ''} />
          <span style="font-size:0.85rem">FailSafe governance hooks</span>
        </label>`;
      slot.querySelector('.cc-hook-toggle')?.addEventListener('change', (e) => {
        this._toggleHook(e.target);
      });
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
    return `
      <button class="cc-chip cc-theme-select${active}" data-theme="${theme.id}"
        style="display:flex;align-items:center;gap:6px;padding:6px 14px">
        <span style="width:12px;height:12px;border-radius:50%;background:${theme.swatch};
          border:2px solid var(--border-rim)"></span>
        <span>${theme.name}</span>
        <span style="font-size:0.65rem;color:var(--text-muted)">${theme.label}</span>
      </button>`;
  }

  bindChips() {
    this.container.querySelectorAll('.cc-theme-select').forEach(chip => {
      chip.addEventListener('click', () => {
        if (!this.store) return;
        this.store.setTheme(chip.dataset.theme);
        this.container.querySelectorAll('.cc-theme-select').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
      });
    });
  }

  onEvent(event) {
    if (!event || typeof event !== 'object') return;
    if (event.type === 'skills.install.progress' && event.step) {
      this._installState = {
        running: true,
        steps: [...(this._installState?.steps ?? []), event.step],
        lastReport: this._installState?.lastReport ?? null,
      };
      this._refreshInstallCard();
      return;
    }
    if (event.type === 'skills.install.complete' && event.report) {
      this._installState = {
        running: false,
        steps: event.report.steps ?? this._installState?.steps ?? [],
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
    tmp.innerHTML = renderInstallSkillsCard(this._installState).trim();
    const next = tmp.firstElementChild;
    if (!next) return;
    slot.replaceWith(next);
    this._bindQorLogicActions();
  }
  destroy() { if (this.container) this.container.innerHTML = ''; }
}
