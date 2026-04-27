// FailSafe Command Center — Ticker and bootstrap banner utilities
export function updateTickers(data) {
  const proto = document.getElementById('ticker-protocol');
  const sent = document.getElementById('ticker-sentinel');
  const lat = document.getElementById('ticker-latency');
  if (proto) proto.innerHTML = `PROTOCOL <span>${data.sentinelStatus?.mode || 'Unknown'}</span>`;
  if (sent) {
    const live = data.sentinelStatus?.running;
    const c = live ? 'var(--accent-green)' : 'var(--accent-red)';
    sent.innerHTML = `SENTINEL <span style="color:${c}">${live ? 'Active' : 'Halted'}</span>`;
  }
  if (lat) {
    const latVal = data.qoreRuntime?.latencyMs;
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
      '<span style="color:var(--text-muted);font-size:0.78rem">QorLogic skills not installed.</span>' +
      '<button onclick="fetch(\'/api/actions/scaffold-skills\',{method:\'POST\'}).then(()=>location.reload())"' +
      ' class="cc-btn cc-btn--primary" style="font-size:0.75rem;padding:4px 10px">Install QorLogic Skills</button></div>';
  }
  if (!bs.governanceInitialized) {
    html += '<div style="display:flex;align-items:center;gap:8px">' +
      '<span style="color:var(--text-muted);font-size:0.78rem">Run <code style="padding:1px 5px;background:var(--bg-dark);border-radius:3px">/qor-bootstrap</code> in Claude Code to initialize.</span>' +
      '<button onclick="navigator.clipboard.writeText(\'/qor-bootstrap\')"' +
      ' class="cc-btn" style="font-size:0.75rem;padding:4px 10px">Copy</button></div>';
  }
  banner.innerHTML = html;
}
