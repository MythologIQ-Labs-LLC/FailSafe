// FailSafe Command Center — QorLogic Install Skills Card.
// Detected-hosts grid (like detected agents) + modal launcher.
// Modal lifecycle moved to install-skills-modal.js per Phase 1 V2 Path A split.

import { renderInstallModal, bindModalEvents, showInstallModal } from './install-skills-modal.js';

function esc(value) {
  if (value === null || value === undefined) return '';
  const d = document.createElement('div');
  d.textContent = String(value);
  return d.innerHTML;
}

const HOST_META = {
  claude:    { label: 'Claude',     icon: 'C' },
  codex:     { label: 'Codex',      icon: 'X' },
  'kilo-code': { label: 'Kilo',     icon: 'K' },
  gemini:    { label: 'Gemini',     icon: 'G' },
};

export function renderInstallSkillsCard(state, hubData) {
  const running = state?.running === true;
  const invocations = Array.isArray(state?.invocations) ? state.invocations : [];
  const report = state?.lastReport ?? null;
  const showOutputBtn = report || invocations.length > 0;
  const hosts = hubData?.bootstrapState?.qorLogicInstall?.hosts || [];
  const anyInstalled = hubData?.bootstrapState?.qorLogicInstall?.anyInstalled || false;

  return `
    <div class="cc-card" id="cc-qorlogic" style="margin-top:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;
          letter-spacing:0.08em">QorLogic Skills</div>
        ${anyInstalled ? '<span class="cc-badge" style="background:var(--accent-green);color:#fff">Active</span>' : ''}
      </div>
      <p style="font-size:0.85rem;color:var(--text-muted);margin:0 0 12px">
        Install or refresh governance skills from the
        <code style="padding:1px 4px;background:var(--bg-dark);border-radius:3px">qor-logic</code>
        PyPI package into detected agent hosts. Idempotent — safe to run multiple times.
      </p>
      ${renderHostGrid(hosts, running)}
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
        <button class="cc-btn cc-btn--primary" data-action="install-qorlogic-skills"
          ${running ? 'disabled' : ''}
          style="font-size:0.8rem;padding:6px 14px">${running ? 'Installing...' : 'Install / Refresh Skills'}</button>
        <button class="cc-btn" data-action="bootstrap-workspace"
          ${running ? 'disabled' : ''}
          style="font-size:0.8rem;padding:6px 14px">Bootstrap Workspace</button>
        ${showOutputBtn ? `<button class="cc-btn" data-action="show-output"
          style="font-size:0.8rem;padding:6px 14px">Show Output</button>` : ''}
      </div>
      <div id="cc-qorlogic-status" style="margin-top:10px;font-size:0.78rem;color:var(--text-muted)">
        ${renderInvocations(invocations)}
        ${report && !running ? renderReportSummary(report) : ''}
      </div>
    </div>
    ${renderInstallModal(hosts, running)}`;
}

function renderHostGrid(hosts, running) {
  if (!hosts.length) {
    return `<div style="font-size:0.8rem;color:var(--text-muted);padding:8px 0">
      No agent hosts detected yet. Skills will be installed once hosts are available.
    </div>`;
  }
  const rows = hosts.map(h => {
    const meta = HOST_META[h.host] || { label: h.host, icon: '?' };
    const dotColor = h.installed ? 'var(--accent-green)' : 'var(--text-muted)';
    const statusText = h.installed ? `${h.fileCount} file${h.fileCount === 1 ? '' : 's'}` : 'Not installed';
    const mtime = h.recordMtime ? new Date(h.recordMtime).toLocaleDateString() : '';
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;
        padding:8px 10px;background:rgba(0,0,0,0.2);border-radius:6px">
        <div style="display:flex;align-items:center;gap:8px">
          <div style="width:8px;height:8px;border-radius:50%;background:${dotColor}"></div>
          <div style="width:24px;height:24px;border-radius:4px;background:rgba(255,255,255,0.08);
            display:flex;align-items:center;justify-content:center;font-size:0.7rem;
            font-weight:700;color:var(--text-main)">${meta.icon}</div>
          <div>
            <div style="font-size:0.85rem;color:var(--text-main)">${esc(meta.label)}</div>
            <div style="font-size:0.7rem;color:var(--text-muted)">${statusText}</div>
          </div>
        </div>
        <div style="font-size:0.7rem;color:${h.installed ? 'var(--accent-green)' : 'var(--text-muted)'}">
          ${mtime ? `Updated ${mtime}` : ''}
        </div>
      </div>`;
  }).join('');
  return `<div style="display:grid;gap:6px">${rows}</div>`;
}

function renderInvocations(invocations) {
  if (invocations.length === 0) return '';
  return `<div style="display:flex;flex-direction:column;gap:2px">${invocations.map(renderInvocationLine).join('')}</div>`;
}

function renderInvocationLine(inv) {
  const icon = invocationIcon(inv);
  const label = invocationLabel(inv);
  const detail = invocationDetail(inv);
  const errorSpan = inv.error
    ? ` <span style="color:var(--accent-red,#ef4444)">${esc(inv.error)}</span>`
    : '';
  return `<div>${icon} ${esc(label)}${detail}${errorSpan}</div>`;
}

function invocationIcon(inv) {
  if (inv.status === 'success') return '✓';
  if (inv.status === 'error') return '✗';
  if (inv.status === 'running') return '⏳';
  return '·';
}

function invocationLabel(inv) {
  switch (inv.phase) {
    case 'python-probe': return inv.interpreter ? `Resolved Python: ${inv.interpreter}` : 'Resolving Python interpreter';
    case 'pip-install': return inv.command ? inv.command : 'Installing qor-logic package';
    case 'qorlogic-install': return `qorlogic install --host ${inv.host}${inv.scope ? ` --scope ${inv.scope}` : ''}`;
    case 'provenance': {
      const s = inv.summary;
      if (!s) return 'Verifying install records';
      return `Provenance verified: ${s.hostsVerified} host record${s.hostsVerified === 1 ? '' : 's'}, ${s.totalFiles} file${s.totalFiles === 1 ? '' : 's'}`;
    }
    case 'refresh': return 'Refreshing hub';
    default: return inv.phase;
  }
}

function invocationDetail(inv) {
  if (inv.phase === 'qorlogic-install' && inv.installedCount && inv.destination) {
    return ` — ${inv.installedCount} skills → <code>${esc(inv.destination)}</code>`;
  }
  if (inv.phase === 'pip-install' && inv.version) {
    return ` — <code>${esc(inv.version)}</code> installed`;
  }
  return '';
}

function groupDestinationsByHost(destinations) {
  // Group paths by the agent-host segment (.claude, .codex, .gemini, etc.).
  // Returns Array<{ host: string, paths: string[] }> sorted by host.
  const groups = new Map();
  for (const p of destinations || []) {
    const m = String(p).match(/(?:^|[/\\])(\.[\w-]+)(?:[/\\]|$)/);
    const host = m ? m[1].replace(/^\./, '') : 'other';
    if (!groups.has(host)) groups.set(host, []);
    groups.get(host).push(p);
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([host, paths]) => ({ host, paths }));
}

function renderReportSummary(report) {
  const ok = report.ok;
  const color = ok ? 'var(--accent-teal,#2dd4bf)' : 'var(--accent-gold)';
  const groups = groupDestinationsByHost(report.destinations);
  const hostNames = groups.map((g) => g.host).join(', ');
  const headline = ok
    ? `Installed ${report.totalInstalled} skill${report.totalInstalled === 1 ? '' : 's'}${hostNames ? ` across ${hostNames}` : ''}.`
    : `Installed ${report.totalInstalled} skill${report.totalInstalled === 1 ? '' : 's'}; ${report.failures.length} host${report.failures.length === 1 ? '' : 's'} failed.`;
  const groupHtml = groups.map((g) => `
      <details style="margin:4px 0;border:1px solid var(--border,rgba(255,255,255,0.1));border-radius:4px;padding:4px 8px">
        <summary style="cursor:pointer;font-size:0.78rem">${esc(g.host)} — ${g.paths.length} path${g.paths.length === 1 ? '' : 's'}</summary>
        <ul style="margin:4px 0 4px 18px;padding:0;font-family:var(--font-mono,monospace);font-size:0.72rem;color:var(--text-muted)">${
          g.paths.map((p) => `<li>${esc(p)}</li>`).join('')
        }</ul>
      </details>`).join('');
  const detailsBlock = groups.length > 0
    ? `<details style="margin-top:4px"><summary style="cursor:pointer;font-size:0.78rem;color:var(--text-muted)">Show install paths (${report.destinations?.length || 0})</summary>${groupHtml}</details>`
    : '';
  return `<div style="margin-top:6px;color:${color}">${esc(headline)}</div>${detailsBlock}`;
}

export function bindInstallSkillsCard(container, options = {}) {
  const installBtn = container.querySelector('[data-action="install-qorlogic-skills"]');
  const bootstrapBtn = container.querySelector('[data-action="bootstrap-workspace"]');
  const setStatus = (msg, color) => {
    const status = container.querySelector('#cc-qorlogic-status');
    if (!status) return;
    status.innerHTML = '';
    const div = document.createElement('div');
    div.textContent = msg;
    div.style.color = color || 'var(--text-muted)';
    status.appendChild(div);
  };

  installBtn?.addEventListener('click', () => { showInstallModal(container); });

  bootstrapBtn?.addEventListener('click', () => {
    setStatus('Triggering Bootstrap… (run "FailSafe: Bootstrap Workspace" from the Command Palette if this does not respond)');
    try {
      window.location.href = 'command:failsafe.bootstrap';
      setTimeout(() => setStatus('Bootstrap requested.'), 2000);
    } catch {
      setStatus('Run "FailSafe: Bootstrap Workspace" from the Command Palette.', 'var(--accent-gold)');
    }
  });

  const showOutputBtn = container.querySelector('[data-action="show-output"]');
  showOutputBtn?.addEventListener('click', async () => {
    try { await fetch('/api/actions/show-output', { method: 'POST' }); } catch {}
  });

  bindModalEvents(container, options, setStatus);
}
