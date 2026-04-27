// FailSafe Command Center — Settings Renderer
// Theme selector, current config display.
import { renderVoiceSettings, bindVoiceSettings } from './voice-settings.js';

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
      <div class="cc-card" id="cc-qorlogic" style="margin-top:16px">
        <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;
          letter-spacing:0.08em;margin-bottom:8px">QorLogic Skills</div>
        <p style="font-size:0.85rem;color:var(--text-muted);margin:0 0 12px">
          Install or refresh governance skills from the
          <code style="padding:1px 4px;background:var(--bg-dark);border-radius:3px">qor-logic</code>
          PyPI package. Idempotent — safe to run multiple times.
        </p>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="cc-btn cc-btn--primary" data-action="install-qorlogic-skills"
            style="font-size:0.8rem;padding:6px 14px">Install / Refresh QorLogic Skills</button>
          <button class="cc-btn" data-action="bootstrap-workspace"
            style="font-size:0.8rem;padding:6px 14px">Bootstrap Workspace</button>
        </div>
        <div id="cc-qorlogic-status" style="margin-top:10px;font-size:0.78rem;color:var(--text-muted)"></div>
      </div>
      <div class="cc-card" id="cc-failsafe-pro" style="margin-top:16px">
        <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;
          letter-spacing:0.08em;margin-bottom:8px">FailSafe Pro</div>
        <p style="font-size:0.85rem;color:var(--text-muted);margin:0 0 12px">
          Desktop daemon with OS-level enforcement, file locking, team workflows,
          and remote connections. FailSafe Pro pairs with this open extension.
        </p>
        <a href="https://mythologiq.studio/products/failsafe-download" target="_blank" rel="noopener"
          class="cc-btn cc-btn--primary"
          data-action="open-failsafe-pro"
          style="display:inline-block;font-size:0.8rem;padding:6px 14px;text-decoration:none">
          About FailSafe Pro
        </a>
      </div>`;
    this._bindQorLogicActions();
    this.bindChips();
    bindVoiceSettings(this.container, this.store);
    this._renderHookToggle();
  }

  _bindQorLogicActions() {
    const installBtn = this.container?.querySelector('[data-action="install-qorlogic-skills"]');
    const bootstrapBtn = this.container?.querySelector('[data-action="bootstrap-workspace"]');
    const status = this.container?.querySelector('#cc-qorlogic-status');
    const setStatus = (msg, color) => {
      if (status) {
        status.textContent = msg;
        status.style.color = color || 'var(--text-muted)';
      }
    };
    installBtn?.addEventListener('click', async () => {
      setStatus('Installing QorLogic skills... (running pip install qor-logic + qorlogic install)');
      installBtn.disabled = true;
      try {
        const res = await fetch('/api/actions/scaffold-skills', { method: 'POST' });
        const body = await res.json();
        if (!res.ok || body.ok === false) {
          setStatus(`Install failed: ${body.error || res.statusText}`, 'var(--accent-red, #ef4444)');
          return;
        }
        const installed = body.scaffolded || 0;
        setStatus(
          body.error
            ? `Installed ${installed} skill(s); some hosts failed: ${body.error}`
            : `Installed ${installed} skill(s).`,
          body.error ? 'var(--accent-gold)' : 'var(--accent-teal, #2dd4bf)',
        );
      } catch (err) {
        setStatus(`Network error: ${err}`, 'var(--accent-red, #ef4444)');
      } finally {
        installBtn.disabled = false;
      }
    });
    bootstrapBtn?.addEventListener('click', async () => {
      // Bootstrap is a VS Code command (not an HTTP endpoint).
      // From the webview we can postMessage to the host to invoke it,
      // OR open a deep link. Browser-served Command Center exposes it
      // via the same scaffold endpoint plus governance-dirs check.
      // Simplest reliable cross-host path: invoke via vscode: deep link.
      setStatus('Triggering Bootstrap... (run "FailSafe: Bootstrap Workspace" from the Command Palette if this does not respond)');
      try {
        window.location.href = 'command:failsafe.bootstrap';
        setTimeout(() => setStatus('Bootstrap requested.'), 2000);
      } catch {
        setStatus('Run "FailSafe: Bootstrap Workspace" from the Command Palette.', 'var(--accent-gold)');
      }
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

  onEvent() {}
  destroy() { if (this.container) this.container.innerHTML = ''; }
}
