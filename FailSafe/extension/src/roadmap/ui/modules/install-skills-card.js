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
  const steps = Array.isArray(state?.steps) ? state.steps : [];
  const report = state?.lastReport ?? null;
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
      </div>
      <div id="cc-qorlogic-status" style="margin-top:10px;font-size:0.78rem;color:var(--text-muted)">
        ${renderSteps(steps)}
        ${report && !running ? renderReportSummary(report) : ''}
      </div>
    </div>`;
}

function renderSteps(steps) {
  if (steps.length === 0) return '';
  return `<div style="display:flex;flex-direction:column;gap:2px">${steps.map((s) => `
    <div>${stepIcon(s)} ${esc(s.label)}${s.command ? ` — <code>${esc(s.command)}</code>` : ''}${s.path ? ` → <code>${esc(s.path)}</code>` : ''}${s.error ? ` <span style="color:var(--accent-red,#ef4444)">${esc(s.error)}</span>` : ''}</div>
  `).join('')}</div>`;
}

function stepIcon(step) {
  if (step.status === 'success') return '✓';
  if (step.status === 'error') return '✗';
  if (step.status === 'running') return '⏳';
  return '·';
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
}
