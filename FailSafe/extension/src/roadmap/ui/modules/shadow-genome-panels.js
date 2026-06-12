// FailSafe Command Center — Shadow Genome panels (#196 Phase 5).
// Trust Transitions (§9), Federation (§10), and the Learning-Maturity
// progression (§8). All render-ready: they render their REAL API slice when
// present and honest empty/"not yet sourced" states otherwise (trust +
// federation have no producer in the canonical graph yet; learning-maturity's
// "Observed" is the only sourced stage today). Token-only, no faked data.

function esc(value) {
  const d = document.createElement('div');
  d.textContent = String(value ?? '');
  return d.innerHTML;
}

export function renderTrustPanel(d) {
  const ts = d.trustTransitions || [];
  if (!ts.length) {
    return `<div class="sg-panel sg-graph-wrap"><div class="sg-panel-title">Trust Transitions</div>
      <div class="sg-muted">No trust transitions recorded yet.</div>
      <div class="sg-note">Evidence-backed CBT → KBT → IBT promotions and demotions render here as governance decisions are observed (spec §8/§9). Trust data has no producer in the current graph; this surface is render-ready.</div></div>`;
  }
  const cards = ts.map((t) => `<div class="sg-trust-card sg-trust-${esc(t.direction)}">
    <div class="sg-trust-flow"><span class="sg-trust-lvl">${esc(t.from)}</span><span class="sg-trust-arrow">${t.direction === 'demotion' ? '↓' : '↑'}</span><span class="sg-trust-lvl">${esc(t.to)}</span></div>
    <div class="sg-trust-meta"><span class="sg-trust-dir">${esc(t.direction)}</span> · gate <code class="sg-id">${esc(t.governanceNodeId)}</code> · ${esc(t.at)}</div>
  </div>`).join('');
  return `<div class="sg-panel sg-graph-wrap"><div class="sg-panel-title">Trust Transitions <span class="sg-count">${ts.length}</span></div><div class="sg-trust-list">${cards}</div></div>`;
}

export function renderFederationPanel(d) {
  const f = d.federation || { sourced: false, peers: [] };
  const peers = f.peers || [];
  if (!f.sourced || !peers.length) {
    return `<div class="sg-panel sg-graph-wrap"><div class="sg-panel-title">Federation</div>
      <div class="sg-muted">${esc(f.note || 'Federation peer status is not yet sourced.')}</div>
      <div class="sg-note">Peer health (synced · syncing · stale · degraded · incompatible · unauthorized · offline) and causal-origin provenance render here once a federation adapter is connected (spec §10). Render-ready.</div></div>`;
  }
  const rows = peers.map((p) => `<div class="sg-fed-peer">
    <span class="sg-fed-state sg-fed-${esc(p.state)}">${esc(p.state)}</span>
    <span class="sg-fed-name">${esc(p.name)}</span>
    ${p.lastSync ? `<span class="sg-surface-meta">synced ${esc(p.lastSync)}</span>` : ''}
  </div>`).join('');
  return `<div class="sg-panel sg-graph-wrap"><div class="sg-panel-title">Federation <span class="sg-count">${peers.length}</span></div><div class="sg-fed-list">${rows}</div></div>`;
}

export function renderMaturity(d) {
  const stages = d.learningMaturity || [];
  if (!stages.length) return '';
  // FX890 — observed-count invariant: the canonical backend always sets Observed =
  // failure count, but a foreign/corrupted payload can report all-zero maturity while
  // the graph clearly has failure nodes. In that case derive Observed from the graph
  // failure count (summary.unresolvedCount) and mark the panel degraded, so Observed
  // never reads 0 against a non-empty failure set.
  const failureCount = (d.summary && typeof d.summary.unresolvedCount === 'number') ? d.summary.unresolvedCount : 0;
  const allZero = stages.every((s) => !s.count);
  const degraded = allZero && failureCount > 0;
  const countFor = (s) => (degraded && s.stage === 'Observed' ? failureCount : s.count);
  const max = stages.reduce((m, s) => Math.max(m, countFor(s)), 0) || 1;
  const bars = stages.map((s) => {
    const c = countFor(s);
    return `<div class="sg-mat-row" data-stage="${esc(s.stage)}">
    <span class="sg-mat-stage">${esc(s.stage)}</span>
    <span class="sg-mat-track"><span class="sg-mat-fill" style="width:${Math.round((c / max) * 100)}%"></span></span>
    <span class="sg-mat-num">${esc(c)}</span>
  </div>`;
  }).join('');
  const note = degraded
    ? 'Maturity stages are not sourced for this graph — "Observed" shows the graph failure count so it cannot contradict the map.'
    : 'Recording a failure is not learning from it. Only "Observed" is sourced today; deeper stages light up as constraints, detectors, and enforcement gates are recorded (spec §8).';
  return `<div class="sg-panel sg-maturity${degraded ? ' sg-maturity-degraded' : ''}"><div class="sg-panel-title">Learning maturity <span class="sg-mat-cap">has failure become protection?</span></div>${bars}
    <div class="sg-note">${note}</div></div>`;
}
