/**
 * ArchitectureIndexRenderer — Workspace-tab "Architecture" sub-view (#531 LD6; slice 2: plan-531b LD9).
 *
 * Shows the managed architecture index from GET /api/v1/architecture/index: its state and path,
 * authority findings (two canonical documents for one domain, a canonical document missing, a
 * dangling supersession, hidden or non-ASCII characters in a domain), each with its index line,
 * document hash and provenance (index hash, HEAD), registry rows grouped by status, validation
 * problems with their codes, and documents that match the architecture globs but have no row.
 *
 * Each unregistered document has a domain and status form and "Propose registration" (a PROPOSAL
 * ledger entry plus one L3 item; approval records the decision and edits nothing). A refusal keeps
 * its alternatives on the card: "Use existing: open <path>", "Register as descriptive" and
 * "Propose superseding <ids>" (a supersession needs a VS Code confirmation). A conflict offers
 * "Propose: <a> superseded by <b>" for each pair. "Bootstrap index" appears only when no index
 * exists. Design source: the Integrations Catalog renderer (integration-catalog-renderer.js), same
 * card, pill and button vocabulary.
 *
 * Every string that comes from the repository (paths, ids, domains, problem details) is set with
 * textContent, never as HTML. The view refreshes when it is shown, on its Refresh button, and on
 * an `architecture.index.changed` event; there is no path-level file watcher behind it.
 */

const STYLE_ID = 'cc-arch-style';
const STYLE = `
.cc-arch { display:flex; flex-direction:column; gap:12px; }
.cc-arch h3 { margin:0 0 4px; font-size:1.05rem; }
.cc-arch-sub { color:#9aa5b4; margin:0; font-size:.9rem; display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
.cc-arch-scope, .cc-arch-authority-scope { color:#7f8aa0; font-size:.82rem; margin:0; border-left:2px solid #273140; padding-left:8px; }
.cc-arch-group { font-size:.78rem; text-transform:uppercase; letter-spacing:.04em; color:#7f8aa0; margin:6px 0 2px; }
.cc-arch-card { background:linear-gradient(180deg,#141a22,#10161e); border:1px solid #202938; border-radius:10px; padding:14px; }
.cc-arch-card.cc-arch-warn { border-color:#6b4f2a; }
.cc-arch-card.cc-arch-bad { border-color:#6b2f2f; }
.cc-arch-head { display:flex; align-items:center; gap:10px; margin-bottom:6px; flex-wrap:wrap; }
.cc-arch-head strong { font-size:.95rem; word-break:break-all; }
.cc-arch-pill { font-size:.7rem; padding:2px 8px; border-radius:999px; border:1px solid #273140; color:#9aa5b4; text-transform:uppercase; letter-spacing:.05em; }
.cc-arch-pill-ok { color:#68d391; border-color:#2f5e44; }
.cc-arch-pill-warn { color:#f6ad55; border-color:#6b4f2a; }
.cc-arch-pill-bad { color:#fc8181; border-color:#6b2f2f; }
.cc-arch-pill-muted { color:#7f8aa0; border-color:#273140; }
.cc-arch-card p, .cc-arch-line { color:#9aa5b4; margin:0 0 8px; font-size:.88rem; }
.cc-arch-code { font-family:var(--font-mono, monospace); font-size:.78rem; color:#f6ad55; margin-right:6px; }
.cc-arch-row { display:flex; gap:10px; align-items:baseline; flex-wrap:wrap; padding:4px 0; border-top:1px solid #1a2230; font-size:.86rem; color:#c9d1dc; }
.cc-arch-row:first-of-type { border-top:none; }
.cc-arch-row .cc-arch-id { color:#f1efe7; min-width:10ch; }
.cc-arch-row .cc-arch-path { color:#9aa5b4; word-break:break-all; }
.cc-arch-hash { font-family:var(--font-mono, monospace); font-size:.78rem; color:#7f8aa0; }
.cc-arch-actions { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.cc-arch-form { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin:6px 0; }
.cc-arch-form input, .cc-arch-form select { background:#10161e; color:#f1efe7; border:1px solid #273140; border-radius:8px; padding:5px 8px; font:inherit; font-size:.85rem; }
.cc-arch-form input { min-width:18ch; }
.cc-arch-alternatives { border-top:1px solid #1a2230; margin-top:8px; padding-top:8px; }
.cc-arch-btn { background:#141a22; color:#f1efe7; border:1px solid #2f5e44; border-radius:8px; padding:6px 14px; cursor:pointer; font:inherit; font-size:.85rem; }
.cc-arch-btn:hover { border-color:#68d391; }
.cc-arch-btn[disabled] { opacity:.5; cursor:not-allowed; }
.cc-arch-btn-link { border-color:#2b4a5c; }
.cc-arch-result { font-size:.82rem; color:#5fb0d8; margin:6px 0 0; }
.cc-arch-result.cc-arch-result-bad { color:#fc8181; }
`;

const SCOPE_LINE = 'FailSafe records the writes it makes here after your confirmation and never overwrites a file. ' +
  'Documents written by editors, agents or other tools are found when this view refreshes; FailSafe cannot block them.';

export const AUTHORITY_SCOPE_LINE = "FailSafe compares the registry's declared domains, statuses, links and supersedes lists as written. " +
  'It does not judge whether two documents, or two domain names, mean the same thing. ' +
  "A canonical document's domain and every new domain must use plain ASCII letters, digits, spaces and . _ / & ( ) -; " +
  'a non-ASCII domain already in the index can be reused only for proposed, descriptive or historical documents, typed exactly, ' +
  'and is shown with its code points. Edits made outside FailSafe are found when this view refreshes.';

const STATE_PILL = {
  present: ['Valid', 'cc-arch-pill-ok'],
  'present-with-problems': ['Problems', 'cc-arch-pill-warn'],
  invalid: ['Cannot parse', 'cc-arch-pill-bad'],
  absent: ['No index', 'cc-arch-pill-muted'],
  'present-elsewhere': ['Index elsewhere', 'cc-arch-pill-warn'],
  'bad-index-path': ['Bad index path', 'cc-arch-pill-bad'],
  'no-git': ['Git unavailable', 'cc-arch-pill-bad'],
  'not-a-repo': ['Not a git repository', 'cc-arch-pill-bad'],
  'no-workspace': ['No workspace', 'cc-arch-pill-muted'],
};

const STATE_TEXT = {
  absent: 'No architecture index exists at this path yet. Bootstrap creates one new file, after you confirm in VS Code.',
  invalid: 'The index exists but its registry table or its fenced glob blocks cannot be parsed. FailSafe will not create another one; fix this file by hand.',
  'bad-index-path': 'The failsafe.architecture.indexPath setting is absolute or leaves the workspace.',
  'no-git': 'FailSafe found no trusted git executable, so it cannot list the workspace files.',
  'not-a-repo': 'This workspace is not a git repository, so FailSafe cannot list its files.',
  'no-workspace': 'Open a folder to use the architecture index.',
};

const FINDING_LABEL = {
  'conflicting-canonical': ['Two canonical documents', 'cc-arch-pill-bad'],
  'canonical-missing': ['Canonical document missing', 'cc-arch-pill-bad'],
  'dangling-supersession': ['Dangling supersession', 'cc-arch-pill-warn'],
  'domain-hidden-characters': ['Hidden characters in a domain', 'cc-arch-pill-warn'],
  'domain-non-ascii': ['Non-ASCII domain', 'cc-arch-pill-warn'],
};

const DOC_STATE_TEXT = {
  present: 'present',
  'not-on-disk': 'not on disk',
  'not-listed': 'exists, but git does not list it (ignored)',
  'outside-workspace': 'resolves outside the workspace',
  'too-large': 'larger than 2 MiB',
  'no-safe-link': 'no safe relative link',
};

const DANGLING_TEXT = {
  'unknown-id': 'supersedes an id that is not registered',
  'no-successor': 'is superseded, but no row names it in supersedes',
  cycle: 'supersedes forms a cycle',
};

const STATUS_ORDER = ['canonical', 'proposed', 'descriptive', 'superseded', 'historical'];
const REGISTER_STATUSES = ['canonical', 'proposed', 'descriptive', 'historical'];
const PROPOSABLE = new Set(['present', 'present-with-problems']);
const DATALIST_ID = 'cc-arch-domains';
const INTAKE_CHAR = /^[A-Za-z0-9 ._/&()-]$/;

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function pill(label, cls) {
  return el('span', `cc-arch-pill ${cls}`, label);
}

function button(label, cls, onClick) {
  const b = el('button', `cc-arch-btn${cls ? ` ${cls}` : ''}`, label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

async function postJson(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  let data = {};
  try { data = await res.json(); } catch { /* non-JSON error page */ }
  return { status: res.status, data };
}

/** A domain as a reviewer sees it: plain characters as is, every other code point as [U+XXXX]. */
function reviewDomain(s) {
  return [...String(s ?? '')].map((ch) => (INTAKE_CHAR.test(ch) ? ch
    : `[U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}]`)).join('');
}

const short = (hex) => (typeof hex === 'string' && hex ? hex.slice(0, 12) : 'none');

function bootstrapMessage(status, data) {
  if (status === 200) {
    const ledger = data.ledger && typeof data.ledger === 'object'
      ? `Recorded as ledger entry #${data.ledger.entryId}.`
      : 'The FailSafe ledger is unavailable, so the creation is not recorded.';
    return [`Created ${data.path} with ${data.rows} row(s). ${ledger}`, false];
  }
  if (data.reuse) return [`An index already exists at ${data.reuse}; nothing was written.`, false];
  if (data.exists === 'appeared') return [`A file appeared at ${data.path} first; it was not overwritten.`, true];
  if (data.confirmation) return [data.error || 'Not confirmed in VS Code; nothing was written.', true];
  if (data.refused) return [`Refused (${data.refused}); nothing was written.`, true];
  return [data.error || `Bootstrap failed (${status}).`, true];
}

const rowText = (r) => `${r.id} (line ${r.line}${r.domain !== undefined ? `, "${reviewDomain(r.domain)}"` : ''})`;

function proposeMessage(status, data) {
  if (status === 202) {
    return [`Queued for L3 review (approval ${data.approvalId}, ledger entry #${data.ledgerEntryId}). Approving records the decision; ` +
      'edit the index yourself. An undecided proposal expires after the L3 SLA and can be proposed again.', false];
  }
  if (data.ledger === 'unavailable') return ['The FailSafe ledger is unavailable; nothing was queued.', true];
  if (data.conflict === 'canonical-exists') {
    const rows = (data.existing || []).map(rowText).join(', ');
    return [`"${reviewDomain(data.domain)}" already has a canonical document: ${rows}. Use it, register this one as descriptive, ` +
      'or propose superseding every canonical row. Nothing was recorded.', true];
  }
  if (data.conflict === 'pending-authority') {
    const parts = [];
    if ((data.pending || []).length) parts.push(`Proposal ${data.pending.join(', ')} for the same authority is waiting for an L3 decision.`);
    for (const a of data.approvedNotInIndex || []) {
      const still = Array.isArray(a.stillCanonical) ? a.stillCanonical : [];
      const todo = [];
      if (a.missingRow || !still.length) todo.push('add its row to the index by hand (any status)');
      if (still.length) todo.push(`change ${still.map(reviewDomain).join(', ')} from canonical in the index by hand`);
      parts.push(`Approval of ledger entry #${a.entryId} for ${a.path} is not in the index yet; ${todo.join(' and ')}.`);
    }
    return [`${parts.join(' ')} Nothing was recorded.`, true];
  }
  if (data.conflict === 'ambiguous-authority') {
    const rows = (data.rows || []).map(rowText).join('; ');
    if (data.reason === 'bad-row') {
      return [`Registry rows with the wrong number of cells at ${(data.lines || []).map((l) => `line ${l}`).join(', ')}: FailSafe cannot read them, so ` +
        'canonical registrations and supersessions are refused until you fix those rows in the index. Nothing was recorded.', true];
    }
    if (data.reason === 'hidden-character-domain') {
      return [`Canonical rows with hidden characters in their domain: ${rows}. Rename each domain in the index without them, or change its status ` +
        'from canonical; until then canonical registrations and supersessions are refused. Nothing was recorded.', true];
    }
    if (data.reason === 'non-ascii-domain') {
      return [`Canonical rows with a non-ASCII domain: ${rows}. Rename each domain in the index to plain ASCII, or change its status ` +
        'from canonical; until then canonical registrations and supersessions are refused. Nothing was recorded.', true];
    }
    if (data.reason === 'bad-status') return [`Rows with a status FailSafe does not know: ${rows}. Fix the status in the index first. Nothing was recorded.`, true];
    return [`Rows that share an id: ${rows}. Give each row its own id in the index first. Nothing was recorded.`, true];
  }
  return [data.error || `Proposal failed (${status}).`, true];
}

export class ArchitectureIndexRenderer {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.data = null;
    this.message = null;
    /** path -> { domain, status } typed into a candidate's form; kept across repaints. */
    this.drafts = new Map();
    /** The last canonical-exists refusal: { path, domain, existing } (its alternatives stay on that card). */
    this.conflict = null;
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
    if (this.container.querySelector('.cc-arch')) return;
    void this.refresh();
  }

  async refresh() {
    if (!this.container) return;
    let data;
    try {
      const res = await fetch('/api/v1/architecture/index');
      data = await res.json();
      if (!res.ok) throw new Error(data && data.error ? data.error : `HTTP ${res.status}`);
    } catch (err) {
      this.data = null;
      this.paint(this.container, null, `Could not load the architecture index: ${err && err.message ? err.message : err}`);
      return;
    }
    this.data = data;
    // Paint into the container current at completion: if the sub-view was switched away during the
    // fetch, the TabGroup has pointed this.container at a detached scratch node.
    this.paint(this.container, data, null);
  }

  paint(target, data, error) {
    const root = el('div', 'cc-arch');
    root.appendChild(el('h3', null, 'Architecture Index'));
    const sub = el('div', 'cc-arch-sub');
    root.appendChild(sub);
    root.appendChild(el('p', 'cc-arch-scope', SCOPE_LINE));
    if (error || !data) {
      sub.appendChild(el('span', null, error || 'Loading…'));
      sub.appendChild(button('Refresh', 'cc-arch-refresh', () => this.refresh()));
      target.replaceChildren(root);
      return;
    }
    const [label, cls] = STATE_PILL[data.state] || [data.state, 'cc-arch-pill-muted'];
    sub.appendChild(pill(label, cls));
    sub.appendChild(el('span', 'cc-arch-index-path', `Index: ${data.indexPath}`));
    sub.appendChild(pill(data.ledger === 'available' ? 'Ledger available' : 'Ledger unavailable',
      data.ledger === 'available' ? 'cc-arch-pill-ok' : 'cc-arch-pill-warn'));
    const when = new Date(data.checkedAt);
    if (!Number.isNaN(when.getTime())) sub.appendChild(el('span', null, `Checked ${when.toLocaleTimeString()}`));
    sub.appendChild(button('Refresh', 'cc-arch-refresh', () => this.refresh()));

    if (this.message) {
      root.appendChild(el('p', `cc-arch-result${this.message[1] ? ' cc-arch-result-bad' : ''}`, this.message[0]));
      this.message = null;
    }
    root.appendChild(this.stateCard(data));
    if (data.authority) root.appendChild(this.authoritySection(data));
    if (Array.isArray(data.problems) && data.problems.length) root.appendChild(this.problemsCard(data.problems));
    if (Array.isArray(data.candidates) && data.candidates.length) {
      root.appendChild(this.domainList(data));
      root.appendChild(el('div', 'cc-arch-group', `Unregistered documents (${data.candidates.length})`));
      for (const c of data.candidates) root.appendChild(this.candidateCard(c, data));
    }
    if (Array.isArray(data.rows) && data.rows.length) this.appendRows(root, data.rows);
    target.replaceChildren(root);
  }

  stateCard(data) {
    const card = el('div', `cc-arch-card${data.state === 'present' ? '' : data.state === 'present-with-problems' || data.state === 'present-elsewhere' ? ' cc-arch-warn' : data.state === 'absent' ? '' : ' cc-arch-bad'}`);
    card.classList.add('cc-arch-state');
    card.dataset.state = data.state;
    if (data.state === 'present') card.appendChild(el('p', null, `${data.rows.length} registered document(s); validation found no problems.`));
    else if (data.state === 'present-with-problems') card.appendChild(el('p', null, `${data.rows.length} registered document(s); validation found ${data.problems.length} problem(s).`));
    else if (data.state === 'present-elsewhere') {
      card.appendChild(el('p', null, `No index at ${data.indexPath}, but ${data.elsewherePath} looks like one. ` +
        'Set failsafe.architecture.indexPath to that path to use it; FailSafe does not move or copy it.'));
    } else card.appendChild(el('p', null, STATE_TEXT[data.state] || data.state));
    if (data.state === 'absent') {
      const actions = el('div', 'cc-arch-actions');
      actions.appendChild(button('Bootstrap index', 'cc-arch-bootstrap', () => this.bootstrap()));
      card.appendChild(actions);
    }
    return card;
  }

  /** #531 slice 2: authority findings with provenance (unregistered documents have their own cards below). */
  authoritySection(data) {
    const a = data.authority;
    const findings = (a.findings || []).filter((f) => FINDING_LABEL[f.kind]);
    const section = el('div', 'cc-arch-authority');
    section.appendChild(el('div', 'cc-arch-group', `Authority (${findings.length})`));
    section.appendChild(el('p', 'cc-arch-authority-scope', AUTHORITY_SCOPE_LINE));
    const p = a.provenance || {};
    const prov = el('p', 'cc-arch-line cc-arch-provenance',
      `Index ${p.indexPath || data.indexPath} sha256 ${short(p.indexSha256)} · HEAD ${p.sourceSha ? short(p.sourceSha) : p.sourceShaReason || 'unavailable'}`);
    prov.dataset.indexSha256 = p.indexSha256 || '';
    prov.dataset.sourceSha = p.sourceSha || '';
    section.appendChild(prov);
    if (!findings.length) section.appendChild(el('p', 'cc-arch-line', 'No conflicting or missing authority was found.'));
    for (const f of findings) section.appendChild(this.findingCard(f, data));
    return section;
  }

  findingCard(f, data) {
    const [label, cls] = FINDING_LABEL[f.kind];
    const card = el('div', `cc-arch-card cc-arch-finding ${cls === 'cc-arch-pill-bad' ? 'cc-arch-bad' : 'cc-arch-warn'}`);
    card.dataset.kind = f.kind;
    const head = el('div', 'cc-arch-head');
    head.appendChild(pill(label, cls));
    if (f.domainKey !== undefined) head.appendChild(el('strong', null, reviewDomain(f.domainKey)));
    card.appendChild(head);
    let reason = f.detail || '';
    if (f.kind === 'canonical-missing') reason = `The canonical document is ${DOC_STATE_TEXT[f.reason] || f.reason}.`;
    if (f.kind === 'dangling-supersession') reason = `${(f.rows[0] || {}).id || 'A row'} ${DANGLING_TEXT[f.reason] || f.reason}${f.ref ? ` (${f.ref})` : ''}.`;
    if (Array.isArray(f.codePoints) && f.codePoints.length) reason = `${reason} Code points: ${f.codePoints.join(', ')}.`;
    card.appendChild(el('p', null, reason));
    for (const r of f.rows || []) {
      const row = el('div', 'cc-arch-row cc-arch-finding-row');
      row.dataset.line = String(r.line);
      row.dataset.sha256 = r.docSha256 || '';
      row.appendChild(el('span', 'cc-arch-id', r.id));
      row.appendChild(el('span', 'cc-arch-path', r.docPath || '(no safe link)'));
      row.appendChild(el('span', null, `line ${r.line}`));
      row.appendChild(el('span', 'cc-arch-hash', `sha256 ${short(r.docSha256)}`));
      card.appendChild(row);
    }
    const actions = el('div', 'cc-arch-actions');
    const canPropose = data.ledger === 'available' && PROPOSABLE.has(data.state);
    if (f.kind === 'conflicting-canonical') {
      for (const r of f.rows) if (r.docPath) actions.appendChild(button(`Use existing: open ${r.docPath}`, 'cc-arch-btn-link cc-arch-open', () => this.open(r.docPath)));
      if (canPropose) {
        for (const a of f.rows) {
          for (const b of f.rows) {
            if (a === b || !a.docPath) continue;
            actions.appendChild(button(`Propose: ${a.id} superseded by ${b.id}`, 'cc-arch-supersede-pair',
              () => this.submit({ path: a.docPath, action: 'supersede', supersededBy: b.id })));
          }
        }
      }
    } else if (data.indexPath) {
      actions.appendChild(button('Open index', 'cc-arch-btn-link cc-arch-open', () => this.open(data.indexPath)));
    }
    card.appendChild(actions);
    return card;
  }

  problemsCard(problems) {
    const card = el('div', 'cc-arch-card cc-arch-warn cc-arch-problems');
    card.appendChild(el('div', 'cc-arch-group', `Problems (${problems.length})`));
    for (const p of problems) {
      const line = el('div', 'cc-arch-line cc-arch-problem');
      line.appendChild(el('span', 'cc-arch-code', p.code));
      line.appendChild(document.createTextNode(p.detail));
      card.appendChild(line);
    }
    return card;
  }

  /** The registered domain cells, offered byte-for-byte in every candidate's domain input. */
  domainList(data) {
    const list = el('datalist');
    list.id = DATALIST_ID;
    const cells = data.authority && Array.isArray(data.authority.domains)
      ? data.authority.domains.flatMap((d) => d.cells || [])
      : (data.rows || []).map((r) => r.domain);
    for (const c of [...new Set(cells)]) {
      const o = document.createElement('option');
      o.setAttribute('value', c);
      list.appendChild(o);
    }
    return list;
  }

  candidateCard(candidate, data) {
    const card = el('div', 'cc-arch-card cc-arch-candidate');
    card.dataset.path = candidate.path;
    const head = el('div', 'cc-arch-head');
    head.appendChild(el('strong', null, candidate.path));
    head.appendChild(pill('No registry row', 'cc-arch-pill-warn'));
    card.appendChild(head);
    const suggestions = Array.isArray(candidate.suggestions) ? candidate.suggestions : [];
    card.appendChild(el('p', null, suggestions.length
      ? 'Possible overlap by name (string match, not proof of the same content). Amending an existing document is the default:'
      : 'No registered document shares words with this path.'));
    const actions = el('div', 'cc-arch-actions');
    for (const s of suggestions) {
      actions.appendChild(button(`Use existing: open ${s}`, 'cc-arch-btn-link cc-arch-open', () => this.open(s)));
    }
    card.appendChild(actions);
    if (PROPOSABLE.has(data.state)) card.appendChild(this.registrationForm(candidate.path, data));
    if (this.conflict && this.conflict.path === candidate.path) card.appendChild(this.alternatives(this.conflict, data));
    return card;
  }

  registrationForm(path, data) {
    const draft = this.drafts.get(path) || { domain: '', status: 'proposed' };
    this.drafts.set(path, draft);
    const form = el('div', 'cc-arch-form');
    const input = el('input', 'cc-arch-domain');
    input.type = 'text';
    input.placeholder = 'Domain';
    input.setAttribute('aria-label', `Domain for ${path}`);
    input.setAttribute('list', DATALIST_ID);
    input.value = draft.domain;
    const select = el('select', 'cc-arch-status');
    select.setAttribute('aria-label', `Status for ${path}`);
    for (const s of REGISTER_STATUSES) {
      const o = el('option', null, s);
      o.value = s;
      select.appendChild(o);
    }
    select.value = draft.status;
    const propose = button('Propose registration', 'cc-arch-propose',
      () => this.submit({ path, action: 'register', domain: draft.domain, status: draft.status }, propose));
    const ledgerOk = data.ledger === 'available';
    if (!ledgerOk) propose.title = 'The FailSafe ledger is unavailable, so a proposal could not be recorded or decided.';
    const sync = () => { propose.disabled = !ledgerOk || draft.domain.length === 0; };
    input.addEventListener('input', () => { draft.domain = input.value; sync(); });
    select.addEventListener('change', () => { draft.status = select.value; });
    sync();
    form.append(input, select, propose);
    return form;
  }

  /** After a canonical-exists refusal: use the existing document, register as descriptive, or supersede every canonical row. */
  alternatives(conflict, data) {
    const box = el('div', 'cc-arch-actions cc-arch-alternatives');
    for (const r of conflict.existing) {
      if (r.docPath) box.appendChild(button(`Use existing: open ${r.docPath}`, 'cc-arch-btn-link cc-arch-alt-open', () => this.open(r.docPath)));
    }
    if (data.ledger === 'available') {
      box.appendChild(button('Register as descriptive', 'cc-arch-alt-descriptive',
        () => this.submit({ path: conflict.path, action: 'register', domain: conflict.domain, status: 'descriptive' })));
      const ids = conflict.existing.map((r) => r.id);
      box.appendChild(button(`Propose superseding ${ids.join(', ')}`, 'cc-arch-alt-supersede',
        () => this.submit({ path: conflict.path, action: 'register', domain: conflict.domain, status: 'canonical', supersedes: ids })));
    }
    return box;
  }

  appendRows(root, rows) {
    const groups = new Map();
    for (const r of rows) {
      const key = STATUS_ORDER.includes(r.status) ? r.status : 'other';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    }
    for (const status of [...STATUS_ORDER, 'other']) {
      const list = groups.get(status);
      if (!list) continue;
      root.appendChild(el('div', 'cc-arch-group', `${status} (${list.length})`));
      const card = el('div', 'cc-arch-card cc-arch-rows');
      card.dataset.status = status;
      for (const r of list) {
        const row = el('div', 'cc-arch-row');
        row.appendChild(el('span', 'cc-arch-id', r.id));
        row.appendChild(el('span', null, r.domain));
        row.appendChild(el('span', 'cc-arch-path', r.docPath || '(no safe link)'));
        if (r.docPath) row.appendChild(button('Open', 'cc-arch-btn-link cc-arch-open', () => this.open(r.docPath)));
        card.appendChild(row);
      }
      root.appendChild(card);
    }
  }

  async bootstrap() {
    const { status, data } = await postJson('/api/actions/architecture-index/bootstrap', { mode: 'create' });
    this.message = bootstrapMessage(status, data);
    await this.refresh();
  }

  /** Post a proposal; a canonical-exists refusal keeps its alternatives on the candidate's card. */
  async submit(body, btn) {
    if (btn) btn.disabled = true;
    const { status, data } = await postJson('/api/actions/architecture-index/propose', body);
    this.message = proposeMessage(status, data);
    this.conflict = status === 409 && data.conflict === 'canonical-exists'
      ? { path: body.path, domain: body.domain, existing: Array.isArray(data.existing) ? data.existing : [] }
      : null;
    if (status === 202) this.drafts.delete(body.path);
    await this.refresh();
  }

  async open(path) {
    const { status, data } = await postJson('/api/actions/architecture-index/open', { path });
    if (status !== 200) {
      this.message = [data.error || `Could not open ${path} (${status}).`, true];
      await this.refresh();
    }
  }

  onEvent(evt) {
    if (evt && evt.type === 'architecture.index.changed' && this._tgMounted !== false) void this.refresh();
  }
}
