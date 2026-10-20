/**
 * DeliveryAssessmentRenderer — Workspace-tab "Delivery" sub-view (#532 part B, plan-532b LD8).
 *
 * For one intent (the active intent, or an archived sealed intent, read-only) it shows six steps
 * from GET /api/v1/delivery/intents/:id: the issue it came from, the architecture documents it
 * implements, the commits it was committed under, a review of the implementation, governance
 * evidence already in the FailSafe ledger, and the receipt (unavailable until the ledger repair,
 * #467). Each step has a chip and lists the records behind it. plan-532c: "recorded" means present,
 * not passed, so its chip is neutral; passing is green, failing and missing red, stale amber,
 * unavailable muted, with a legend. The header shows the accepted intent and the intent decision
 * (approval for implementation is not a review), and the overall card says why complete is not
 * reachable yet (B320, B321).
 * For the active, unsealed intent it offers Link architecture, Link commit and Unlink; each posts
 * once and acts only after the operator confirms in VS Code. A commit's changed files are shown
 * for display; they are never an edge.
 *
 * Design source: the Architecture sub-view (architecture-index-renderer.js): the same card, type,
 * chip and scope-line vocabulary. Every string from the repository, the ledger or the intent is
 * set with textContent, never as HTML. Fetch targets are relative. The view refreshes when shown,
 * on its Refresh button, after a link or unlink, and on a `delivery.changed` event.
 */

const STYLE_ID = 'cc-dlv-style';
const STYLE = `
.cc-dlv { display:flex; flex-direction:column; gap:12px; }
.cc-dlv h3 { margin:0 0 4px; font-size:1.05rem; }
.cc-dlv-sub { color:#9aa5b4; margin:0; font-size:.9rem; display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
.cc-dlv-scope { color:#7f8aa0; font-size:.82rem; margin:0; border-left:2px solid #273140; padding-left:8px; }
.cc-dlv-group { font-size:.78rem; text-transform:uppercase; letter-spacing:.04em; color:#7f8aa0; margin:6px 0 2px; }
.cc-dlv-card { background:linear-gradient(180deg,#141a22,#10161e); border:1px solid #202938; border-radius:10px; padding:14px; }
.cc-dlv-card.cc-dlv-warn { border-color:#6b4f2a; }
.cc-dlv-card.cc-dlv-bad { border-color:#6b2f2f; }
.cc-dlv-head { display:flex; align-items:center; gap:10px; margin-bottom:6px; flex-wrap:wrap; }
.cc-dlv-head strong { font-size:.95rem; word-break:break-all; }
.cc-dlv-pill { font-size:.7rem; padding:2px 8px; border-radius:999px; border:1px solid #273140; color:#9aa5b4; text-transform:uppercase; letter-spacing:.05em; }
.cc-dlv-pill-ok { color:#68d391; border-color:#2f5e44; }
.cc-dlv-pill-warn { color:#f6ad55; border-color:#6b4f2a; }
.cc-dlv-pill-bad { color:#fc8181; border-color:#6b2f2f; }
.cc-dlv-pill-muted { color:#7f8aa0; border-color:#273140; }
.cc-dlv-pill-info { color:#5fb0d8; border-color:#2b4a5c; }
.cc-dlv-pill-fail { color:#fff; background:#7a2b2b; border-color:#a33d3d; }
.cc-dlv-legend { display:flex; gap:6px; align-items:center; flex-wrap:wrap; color:#7f8aa0; font-size:.78rem; margin:0; }
.cc-dlv-intent { color:#9aa5b4; font-size:.84rem; margin:0 0 6px; }
.cc-dlv-intent .cc-dlv-note { color:#7f8aa0; font-size:.78rem; }
.cc-dlv-card p, .cc-dlv-line { color:#9aa5b4; margin:0 0 8px; font-size:.88rem; }
.cc-dlv-row { display:flex; gap:10px; align-items:baseline; flex-wrap:wrap; padding:4px 0; border-top:1px solid #1a2230; font-size:.86rem; color:#c9d1dc; }
.cc-dlv-row:first-of-type { border-top:none; }
.cc-dlv-key { color:#7f8aa0; min-width:16ch; }
.cc-dlv-val { color:#c9d1dc; font-family:var(--font-mono, monospace); font-size:.8rem; word-break:break-all; }
.cc-dlv-files { margin:4px 0 0; padding-left:18px; color:#9aa5b4; font-family:var(--font-mono, monospace); font-size:.78rem; }
.cc-dlv-actions { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-top:8px; }
.cc-dlv-select { background:#10161e; color:#f1efe7; border:1px solid #273140; border-radius:8px; padding:5px 8px; font:inherit; font-size:.85rem; max-width:100%; }
.cc-dlv-btn { background:#141a22; color:#f1efe7; border:1px solid #2f5e44; border-radius:8px; padding:6px 14px; cursor:pointer; font:inherit; font-size:.85rem; }
.cc-dlv-btn:hover { border-color:#68d391; }
.cc-dlv-btn[disabled] { opacity:.5; cursor:not-allowed; }
.cc-dlv-btn-link { border-color:#2b4a5c; }
.cc-dlv-result { font-size:.82rem; color:#5fb0d8; margin:6px 0 0; }
.cc-dlv-result.cc-dlv-result-bad { color:#fc8181; }
`;

const DECISION_NOTE = 'Recorded in the local intent history; the chain shows the entry is unchanged since it was chained, not who wrote it.';

export const DELIVERY_SCOPE_LINE = 'This assessment uses only the links you recorded here and evidence already in the FailSafe ledger. ' +
  'Nothing is inferred and nothing leaves this machine. Receipts are unavailable until the ledger repair (#467). ' +
  'Recorded means the evidence is present, not that it passed.';

const CHIP = {
  recorded: ['Recorded', 'cc-dlv-pill-info'],
  passing: ['Passing', 'cc-dlv-pill-ok'],
  failing: ['Failing', 'cc-dlv-pill-fail'],
  stale: ['Stale', 'cc-dlv-pill-warn'],
  missing: ['Missing', 'cc-dlv-pill-bad'],
  unavailable: ['Unavailable', 'cc-dlv-pill-muted'],
};
const CARD = { recorded: '', passing: '', failing: ' cc-dlv-bad', stale: ' cc-dlv-warn', missing: ' cc-dlv-bad', unavailable: '' };
const OUTCOME = {
  'evidence-complete-except-receipt': ['Evidence complete except receipt', 'cc-dlv-pill-ok'],
  incomplete: ['Incomplete', 'cc-dlv-pill-warn'],
  failing: ['Failing', 'cc-dlv-pill-fail'],
};

/** Who linked an edge (plan-532c LD6), as the dialog said it. */
function linkedBy(rec) {
  if (rec.via === 'governed-commit') return `FailSafe ${rec.action || 'governed'} (governed commit)`;
  if (rec.via === 'workspace-delivery') return 'Workspace > Delivery (your pick)';
  return 'not recorded';
}

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function pill(label, cls) {
  return el('span', `cc-dlv-pill ${cls}`, label);
}

function button(label, cls, onClick) {
  const b = el('button', `cc-dlv-btn${cls ? ` ${cls}` : ''}`, label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

function row(key, value) {
  const r = el('div', 'cc-dlv-row');
  r.appendChild(el('span', 'cc-dlv-key', key));
  r.appendChild(el('span', 'cc-dlv-val', value === null || value === undefined || value === '' ? '(none)' : value));
  return r;
}

async function getJson(url) {
  const res = await fetch(url);
  let data = {};
  try { data = await res.json(); } catch { /* non-JSON error page */ }
  if (!res.ok && data.integrity !== 'invalid') throw new Error(data && data.error ? data.error : `HTTP ${res.status}`);
  return data;
}

async function postJson(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  let data = {};
  try { data = await res.json(); } catch { /* non-JSON error page */ }
  return { status: res.status, data };
}

/** The lines shown for one record of a step (all values are text). */
function recordRows(step, rec) {
  switch (step) {
    case 'issue': return [
      ['Issue', [rec.source, rec.key].filter(Boolean).join(' ') || rec.externalRef],
      ['Content SHA-256', rec.contentSha256], ['Fetched at', rec.fetchedAt], ['Created entry hash', rec.createdEntryHash],
    ];
    case 'architecture': return [
      ['Document', `${rec.docPath} (row ${rec.target})`], ['Document SHA-256', rec.docSha256],
      ...(rec.currentSha256 ? [['Now', rec.currentSha256]] : []),
      ['HEAD at link time', rec.sourceSha], ['Linked by', linkedBy(rec)], ...(rec.reason ? [['Why', rec.reason]] : []),
    ];
    case 'code': return [
      ['Commit', rec.sha], ['Tree', rec.tree], ['Branch', rec.branch || 'none (detached HEAD)'], ['Linked by', linkedBy(rec)],
      ...(rec.reason ? [['Why', rec.reason]] : []),
    ];
    case 'review': return [
      ['Intent decision', rec.decision], ['By', rec.actor], ['At', rec.timestamp], ['Entry hash', rec.entryHash],
      ['Provenance', rec.provenance],
    ];
    case 'governance': return [
      ['Ledger entry', `#${rec.entryId} ${rec.eventType}`], ['Recorded at', rec.timestamp], ['Entry hash', rec.entryHash],
      ['Kind', rec.kind === 'policy-decision' ? 'policy decision (an action under the intent, not a review)' : 'presence'],
      ...(rec.outcome ? [['Outcome', rec.outcome]] : []),
      ['Ledger chain', 'unknown (not re-verified for each assessment)'],
    ];
    default: return [];
  }
}

const STEP_EDGE = { architecture: 'implements', code: 'committed-under' };

export class DeliveryAssessmentRenderer {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.selectedId = null;
    this.message = null;
  }

  ensureStyle() {
    if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
    const node = document.createElement('style');
    node.id = STYLE_ID;
    node.textContent = STYLE;
    document.head.appendChild(node);
  }

  /** Called by the TabGroup on every hub render; fetches only when the view is (re)shown. */
  render() {
    if (!this.container) return;
    this.ensureStyle();
    if (this.container.querySelector('.cc-dlv')) return;
    void this.refresh();
  }

  async refresh() {
    if (!this.container) return;
    this.ensureStyle();
    let state;
    try {
      const listing = await getJson('/api/v1/delivery/intents');
      if (listing.integrity === 'invalid') { this.paint(this.container, { invalid: true }); return; }
      const intents = Array.isArray(listing.intents) ? listing.intents : [];
      const chosen = intents.find((i) => i.id === this.selectedId) || intents.find((i) => i.active) || intents[0];
      if (!chosen) { this.paint(this.container, { intents }); return; }
      this.selectedId = chosen.id;
      const view = await getJson(`/api/v1/delivery/intents/${encodeURIComponent(chosen.id)}`);
      const candidates = view.linkable ? await getJson('/api/v1/delivery/candidates') : null;
      state = { intents, view, candidates };
    } catch (err) {
      this.paint(this.container, { error: `Could not load the delivery assessment: ${err && err.message ? err.message : err}` });
      return;
    }
    // Paint into the container current at completion (the TabGroup may have swapped it).
    this.paint(this.container, state);
  }

  paint(target, state) {
    const root = el('div', 'cc-dlv');
    root.appendChild(el('h3', null, 'Delivery'));
    const sub = el('div', 'cc-dlv-sub');
    root.appendChild(sub);
    root.appendChild(el('p', 'cc-dlv-scope', DELIVERY_SCOPE_LINE));
    root.appendChild(this.legend());
    if (state.intents && state.intents.length) sub.appendChild(this.picker(state.intents));
    sub.appendChild(button('Refresh', 'cc-dlv-refresh', () => this.refresh()));
    if (this.message) {
      root.appendChild(el('p', `cc-dlv-result${this.message[1] ? ' cc-dlv-result-bad' : ''}`, this.message[0]));
      this.message = null;
    }
    if (state.error) root.appendChild(el('p', 'cc-dlv-line', state.error));
    else if (state.invalid) {
      const card = el('div', 'cc-dlv-card cc-dlv-bad cc-dlv-invalid');
      card.appendChild(el('p', null, 'The intent history failed its chain check, so nothing is assessed and nothing can be linked.'));
      root.appendChild(card);
    } else if (!state.view) {
      root.appendChild(el('p', 'cc-dlv-line', 'No active or sealed intent in this workspace yet.'));
    } else {
      root.dataset.intent = state.view.intent.id;
      this.paintView(root, state.view, state.candidates);
    }
    target.replaceChildren(root);
  }

  legend() {
    const row = el('p', 'cc-dlv-legend');
    for (const key of ['recorded', 'passing', 'failing', 'stale', 'missing', 'unavailable']) {
      const [label, cls] = CHIP[key];
      row.appendChild(pill(label, cls));
    }
    row.appendChild(el('span', null, 'Recorded means present, not passed.'));
    return row;
  }

  picker(intents) {
    const select = el('select', 'cc-dlv-select cc-dlv-picker');
    select.setAttribute('aria-label', 'Intent');
    for (const i of intents) {
      const opt = el('option', null, `${i.active ? 'Active' : 'Sealed'}: ${i.purpose}`);
      opt.value = i.id;
      if (i.id === this.selectedId) opt.selected = true;
      select.appendChild(opt);
    }
    select.addEventListener('change', () => { this.selectedId = select.value; void this.refresh(); });
    return select;
  }

  /** The accepted intent: who created it and when, and the intent decision (not a review). */
  intentLine(intent) {
    const box = el('div', 'cc-dlv-intent');
    box.appendChild(el('div', null, `Accepted intent, status ${intent.status}. Created by ${intent.createdBy || 'not recorded'} at ${intent.createdAt || 'not recorded'}; CREATED entry ${intent.createdEntryHash || '(none)'}.`));
    const d = intent.decision;
    if (d) {
      const what = d.status === 'VETO' ? 'vetoed' : 'approved for implementation (not a review)';
      box.appendChild(el('div', null, `Intent decision: ${what}, by ${d.actor} at ${d.timestamp}.`));
      box.appendChild(el('div', 'cc-dlv-note', DECISION_NOTE));
    }
    return box;
  }

  paintView(root, view, candidates) {
    const a = view.assessment;
    const complete = a.overall === 'evidence-complete-except-receipt';
    const failing = a.overall === 'failing';
    const overall = el('div', `cc-dlv-card cc-dlv-overall${complete ? '' : failing ? ' cc-dlv-bad' : ' cc-dlv-warn'}`);
    const head = el('div', 'cc-dlv-head');
    head.appendChild(el('strong', null, view.intent.purpose));
    const [outcomeLabel, outcomeCls] = OUTCOME[a.overall] || OUTCOME.incomplete;
    head.appendChild(pill(outcomeLabel, outcomeCls));
    overall.appendChild(head);
    overall.appendChild(this.intentLine(view.intent));
    const labels = a.steps.filter((s) => a.gaps.includes(s.key)).map((s) => s.label);
    overall.appendChild(el('p', null, complete
      ? 'Every step except the receipt has a record.'
      : `Gaps: ${labels.join(', ')}.`));
    if (a.completeReachable === false) {
      overall.appendChild(el('p', 'cc-dlv-unreachable', `Complete is not reachable yet: FailSafe records no review of the implementation (${(a.completeBlockedBy || []).join(', ')}). The receipt also needs the ledger repair (#467).`));
    }
    if (!view.linkable) overall.appendChild(el('p', null, 'This intent is sealed; its links are read-only.'));
    root.appendChild(overall);
    for (const step of a.steps) root.appendChild(this.stepCard(step, view, candidates));
  }

  stepCard(step, view, candidates) {
    const [label, cls] = CHIP[step.status] || [step.status, 'cc-dlv-pill-muted'];
    const card = el('div', `cc-dlv-card cc-dlv-step${CARD[step.status] || ''}`);
    card.dataset.key = step.key;
    card.dataset.status = step.status;
    const head = el('div', 'cc-dlv-head');
    head.appendChild(el('strong', null, step.label));
    head.appendChild(pill(label, cls));
    card.appendChild(head);
    card.appendChild(el('p', null, step.reason));
    for (const rec of step.records || []) {
      const group = el('div', 'cc-dlv-record');
      for (const [k, v] of recordRows(step.key, rec)) group.appendChild(row(k, v));
      if (step.key === 'code' && Array.isArray(rec.files) && rec.files.length) {
        group.appendChild(el('div', 'cc-dlv-group', `Changed files (display only)${rec.filesTruncated ? ', first 500' : ''}`));
        const list = el('ul', 'cc-dlv-files');
        for (const f of rec.files) list.appendChild(el('li', null, f));
        group.appendChild(list);
      }
      const edge = STEP_EDGE[step.key];
      if (view.linkable && edge) {
        const target = step.key === 'code' ? rec.sha : rec.target;
        const actions = el('div', 'cc-dlv-actions');
        actions.appendChild(button('Unlink', 'cc-dlv-btn-link cc-dlv-unlink', () => this.post('unlink', view.intent.id, edge, target)));
        group.appendChild(actions);
      }
      card.appendChild(group);
    }
    if (view.linkable && candidates && step.key === 'architecture') card.appendChild(this.linkArchitecture(view, candidates));
    if (view.linkable && candidates && step.key === 'code') card.appendChild(this.linkCommit(view, candidates));
    return card;
  }

  linkArchitecture(view, candidates) {
    const actions = el('div', 'cc-dlv-actions');
    const linked = new Set(view.edges.filter((e) => e.edge === 'implements').map((e) => e.target));
    const rows = (candidates.architecture && candidates.architecture.rows || []).filter((r) => !linked.has(r.id));
    if (!rows.length) {
      actions.appendChild(el('span', 'cc-dlv-line', 'No other registered architecture document to link.'));
      return actions;
    }
    const select = el('select', 'cc-dlv-select cc-dlv-arch-pick');
    select.setAttribute('aria-label', 'Architecture document');
    for (const r of rows) {
      const opt = el('option', null, `${r.docPath} (${r.id})`);
      opt.value = r.id;
      select.appendChild(opt);
    }
    actions.appendChild(select);
    const btn = button('Link architecture', 'cc-dlv-link-arch', () => { btn.disabled = true; void this.post('link', view.intent.id, 'implements', select.value); });
    actions.appendChild(btn);
    return actions;
  }

  linkCommit(view, candidates) {
    const actions = el('div', 'cc-dlv-actions');
    const commits = candidates.commits || {};
    if (commits.state !== 'ok') {
      actions.appendChild(el('span', 'cc-dlv-line', commits.state === 'unborn'
        ? 'This repository has no commits yet.' : 'Git cannot read this repository, so no commit can be linked.'));
      return actions;
    }
    const linked = new Set(view.edges.filter((e) => e.edge === 'committed-under').map((e) => e.target));
    const list = commits.commits.filter((c) => !linked.has(c.sha));
    if (!list.length) {
      actions.appendChild(el('span', 'cc-dlv-line', 'Every recent commit is already linked.'));
      return actions;
    }
    const select = el('select', 'cc-dlv-select cc-dlv-commit-pick');
    select.setAttribute('aria-label', 'Commit');
    for (const c of list) {
      const opt = el('option', null, `${c.sha === commits.head ? 'HEAD ' : ''}${c.sha.slice(0, 12)} ${c.subject}`);
      opt.value = c.sha;
      select.appendChild(opt);
    }
    actions.appendChild(select);
    const btn = button('Link commit', 'cc-dlv-link-commit', () => { btn.disabled = true; void this.post('link', view.intent.id, 'committed-under', select.value); });
    actions.appendChild(btn);
    return actions;
  }

  async post(action, intentId, edge, target) {
    const url = action === 'unlink' ? '/api/actions/delivery/unlink' : '/api/actions/delivery/link';
    const { status, data } = await postJson(url, { intentId, edge, target });
    this.message = status === 200
      ? [action === 'unlink' ? 'Link removed and recorded in the intent history.' : 'Link recorded in the intent history.', false]
      : [data.error || `${action === 'unlink' ? 'Unlink' : 'Link'} failed (${status}).`, true];
    await this.refresh();
  }

  onEvent(evt) {
    if (evt && evt.type === 'delivery.changed' && this._tgMounted !== false) void this.refresh();
  }
}
