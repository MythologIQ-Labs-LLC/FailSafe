// FailSafe Command Center — QorLogic Install Skills Card
// Renders the Settings card that triggers `pip install qor-logic` +
// `qorlogic install` flow. Subscribes to broadcast progress events
// (`skills.install.progress`, `skills.install.complete`, `hub.refresh`)
// so the UI reflects live install state without polling.
//
// Plan A Phase 3 / issue #48: button disables during run; final report
// shown inline (interpreter, exact pip command, per-host destinations,
// counts); failed step + error stays visible until next run.

function esc(value) {
  if (value === null || value === undefined) return '';
  const d = document.createElement('div');
  d.textContent = String(value);
  return d.innerHTML;
}

export function renderInstallSkillsCard(state) {
  const running = state?.running === true;
  const invocations = Array.isArray(state?.invocations) ? state.invocations : [];
  const report = state?.lastReport ?? null;
  const showOutputBtn = report || invocations.length > 0;
  return `
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
          ${running ? 'disabled' : ''}
          style="font-size:0.8rem;padding:6px 14px">${running ? 'Installing…' : 'Install / Refresh QorLogic Skills'}</button>
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
    </div>`;
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

function renderReportSummary(report) {
  const dests = (report.destinations || []).map(esc).join(', ');
  const color = report.ok ? 'var(--accent-teal,#2dd4bf)' : 'var(--accent-gold)';
  const summary = report.ok
    ? `Installed ${report.totalInstalled} skill(s)${dests ? ` at ${dests}` : ''}.`
    : `Installed ${report.totalInstalled} skill(s); ${report.failures.length} host(s) failed.`;
  return `<div style="margin-top:6px;color:${color}">${esc(summary)}</div>`;
}

export function bindInstallSkillsCard(container, options = {}) {
  const installBtn = container.querySelector('[data-action="install-qorlogic-skills"]');
  const bootstrapBtn = container.querySelector('[data-action="bootstrap-workspace"]');
  const setStatus = (msg, color) => {
    const status = container.querySelector('#cc-qorlogic-status');
    if (status) {
      status.innerHTML = '';
      const div = document.createElement('div');
      div.textContent = msg;
      div.style.color = color || 'var(--text-muted)';
      status.appendChild(div);
    }
  };
  installBtn?.addEventListener('click', async () => {
    options.onStart?.();
    setStatus('Starting QorLogic install…');
    try {
      const res = await fetch('/api/actions/scaffold-skills', { method: 'POST' });
      const body = await res.json();
      if (!res.ok || body.ok === false) {
        setStatus(`Install failed: ${body.error || res.statusText}`, 'var(--accent-red,#ef4444)');
      }
      options.onFinishFetch?.(body);
    } catch (err) {
      setStatus(`Network error: ${err}`, 'var(--accent-red,#ef4444)');
      options.onError?.(err);
    }
  });
  bootstrapBtn?.addEventListener('click', () => {
    setStatus('Triggering Bootstrap… (run "FailSafe: Bootstrap Workspace" from the Command Palette if this does not respond)');
    try {
      window.location.href = 'command:failsafe.bootstrap';
      setTimeout(() => setStatus('Bootstrap requested.'), 2000);
    } catch {
      setStatus('Run "FailSafe: Bootstrap Workspace" from the Command Palette.', 'var(--accent-gold)');
    }
  });
  // Round 2 / Issue #49: Show Output button posts to the new
  // POST /api/actions/show-output route which calls outputChannel.show(true).
  const showOutputBtn = container.querySelector('[data-action="show-output"]');
  showOutputBtn?.addEventListener('click', async () => {
    try {
      await fetch('/api/actions/show-output', { method: 'POST' });
    } catch {
      // Best-effort; the OutputChannel reveal is a UX nicety, not a critical path.
    }
  });
}
