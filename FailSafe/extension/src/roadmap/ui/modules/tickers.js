// FailSafe Command Center — Ticker and bootstrap banner utilities
import { escapeHtml } from './brainstorm-templates.js';
import { showInstallModal } from './install-skills-modal.js';

export function updateTickers(data) {
  const proto = document.getElementById('ticker-protocol');
  const sent = document.getElementById('ticker-sentinel');
  const lat = document.getElementById('ticker-latency');
  // B-EM-1: the value is sentinel.mode — label SENTINEL, not the ambiguous
  // PROTOCOL. The 'Unknown' fallback is kept intentionally: a live ticker
  // legitimately shows "Unknown" before the first hub payload arrives, so it
  // is NOT routed through sentinelModeValue (which would mask the no-data state).
  if (proto) proto.innerHTML = `SENTINEL <span>${escapeHtml(data.sentinelStatus?.mode || 'Unknown')}</span>`;
  if (sent) {
    const live = data.sentinelStatus?.running;
    const c = live ? 'var(--accent-green)' : 'var(--accent-red)';
    sent.innerHTML = `SENTINEL <span style="color:${c}">${live ? 'Active' : 'Halted'}</span>`;
  }
  if (lat) {
    const latVal = data.qorRuntime?.latencyMs;
    const latLabel = latVal != null ? `${Math.round(latVal)}ms` : 'N/A';
    const latColor = latVal != null ? '' : 'color:var(--text-muted)';
    lat.innerHTML = `API <span style="font-family:var(--font-mono);${latColor}">${latLabel}</span>`;
  }
  const ws = document.querySelector('#ticker-workspace span');
  const wsContainer = document.getElementById('ticker-workspace');
  const workspaceName = data.workspaceName || data.bootstrapState?.workspaceName;
  const workspacePath = data.workspacePath || '';
  if (ws && workspaceName) ws.textContent = workspaceName;
  if (wsContainer && workspacePath) wsContainer.title = workspacePath;
}

export function updateBootstrapBanner(data) {
  const banner = document.getElementById('bootstrap-banner');
  if (!banner) return;
  const bs = data.bootstrapState;
  if (!bs || (bs.skillsInstalled && bs.governanceInitialized)) {
    banner.style.display = 'none';
    return;
  }
  banner.style.display = 'flex';
  banner.style.cssText += 'flex-direction:column;gap:8px;padding:12px 16px;' +
    'background:rgba(245,158,11,0.08);border:1px solid var(--accent-gold);border-radius:6px;margin:8px 16px 0';
  let html = '<div style="font-size:0.85rem;font-weight:600;color:var(--accent-gold)">Get Started</div>';
  if (!bs.skillsInstalled) {
    html += '<div style="display:flex;align-items:center;gap:8px">' +
      '<span style="color:var(--text-muted);font-size:0.78rem">Qor-Logic skills not installed.</span>' +
      '<button data-action="banner-install-skills"' +
      ' class="cc-btn cc-btn--primary" style="font-size:0.75rem;padding:4px 10px">Install Qor-Logic Skills</button></div>';
  }
  if (!bs.governanceInitialized) {
    html += '<div style="display:flex;align-items:center;gap:8px">' +
      '<span style="color:var(--text-muted);font-size:0.78rem">Run <code style="padding:1px 5px;background:var(--bg-dark);border-radius:3px">/qor-bootstrap</code> in Claude Code to initialize.</span>' +
      '<button onclick="navigator.clipboard.writeText(\'/qor-bootstrap\')"' +
      ' class="cc-btn" style="font-size:0.75rem;padding:4px 10px">Copy</button></div>';
  }
  banner.innerHTML = html;

  const installBtn = banner.querySelector('[data-action="banner-install-skills"]');
  installBtn?.addEventListener('click', () => {
    // Open the same modal the Settings card uses, so the user gets the host
    // picker + scope radios + preview button in-browser. Server-side QuickPick
    // would open silently in the extension host, which is invisible to the
    // browser tab and gave the appearance of "nothing happens".
    const host = document.getElementById('install-skills-card') || banner;
    showInstallModal(host);
  });
}
