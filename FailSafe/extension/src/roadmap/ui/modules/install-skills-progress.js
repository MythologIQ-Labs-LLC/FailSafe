// FailSafe Command Center — Install Skills progress reducer (Phase 1).
// Pure DOM-free state transitions for the WS-driven install modal.
// state shape: { lines: [{phase, status, label?, detail?, error?}],
//                terminal: 'idle'|'running'|'done'|'error',
//                destinations?: string[], err?: {...} }

function deriveDetail(inv) {
  if (inv.phase === 'python-probe' && inv.interpreter) return inv.interpreter;
  if (inv.phase === 'pip-install' && inv.version) return inv.version;
  if (inv.phase === 'qorlogic-install' && inv.installedCount && inv.destination) {
    return `${inv.installedCount} skills → ${inv.destination}`;
  }
  if (inv.phase === 'provenance' && inv.summary) {
    const s = inv.summary;
    return `${s.hostsVerified} host${s.hostsVerified === 1 ? '' : 's'}, ${s.totalFiles} file${s.totalFiles === 1 ? '' : 's'}`;
  }
  if (inv.phase === 'pip-install' && inv.command) return inv.command;
  return undefined;
}

function nextTerminal(lines) {
  if (lines.length === 0) return 'idle';
  if (lines.some(l => l.status === 'error')) return 'error';
  if (lines.some(l => l.status === 'running')) return 'running';
  return 'running';
}

function buildLine(inv) {
  const line = { phase: inv.phase, status: inv.status };
  const detail = deriveDetail(inv);
  if (detail) line.detail = detail;
  if (inv.error) line.error = inv.error;
  return line;
}

export function applyProgressUpdate(state, invocation) {
  const lines = Array.isArray(state?.lines) ? state.lines.slice() : [];
  const idx = lines.findIndex(l => l.phase === invocation.phase);
  if (idx === -1) {
    lines.push(buildLine(invocation));
  } else {
    const prev = lines[idx];
    const merged = { ...prev, status: invocation.status };
    const detail = deriveDetail(invocation);
    if (detail) merged.detail = detail;
    if (invocation.error) merged.error = invocation.error;
    lines[idx] = merged;
  }
  return { ...state, lines, terminal: nextTerminal(lines) };
}

export function applyCompletion(state, report) {
  const lines = Array.isArray(state?.lines) ? state.lines.slice() : [];
  const destinations = Array.isArray(report?.destinations) ? report.destinations.slice() : [];
  return {
    ...state,
    lines,
    destinations,
    totalInstalled: report?.totalInstalled,
    terminal: report?.ok === false ? 'error' : 'done',
  };
}

export function applyError(state, err) {
  const lines = Array.isArray(state?.lines) ? state.lines.slice() : [];
  return {
    ...state,
    lines,
    terminal: 'error',
    err: { error: err?.error, stderrTail: err?.stderrTail },
  };
}
