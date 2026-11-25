// Shared jsdom fixture for the Workspace "Delivery" renderer suites (#532, plan-b320, #703):
// two intents (ACTIVE linkable, SEALED read-only), their assessment views, the link candidates, a
// fake fetch that records every request, and deterministic waits for asynchronous renderer work.

import { JSDOM } from 'jsdom';

export const SCOPE = 'This assessment uses only the links you recorded here and evidence already in the FailSafe ledger. ' +
  'Nothing is inferred and nothing leaves this machine. Receipts are unavailable until the ledger repair (#467). ' +
  'Recorded means the evidence is present, not that it passed.';

export const ACTIVE = '11111111-1111-4111-8111-111111111111';
export const SEALED = '22222222-2222-4222-8222-222222222222';
export const SHA = 'a'.repeat(40);
export const TREE = 'b'.repeat(40);
export const SHA2 = '9'.repeat(40);

export const DECISION_NOTE = 'Recorded in the local intent history; the chain shows the entry is unchanged since it was chained, not who wrote it.';
export const AWAITING = 'Awaiting review: no PASS is recorded on a linked commit. Record a PASS or VETO on the newest linked commit (Workspace > Delivery, or the command FailSafe: Record a Delivery Review).';

interface FixtureState {
  decision: { status: string; actor: string; timestamp: string; entryHash: string } | null;
  overall: string;
  reachable: string[];
  reviewOverride: { status: string; reason: string; records: Array<Record<string, unknown>> } | null;
  /** #703: commits linked after SHA, oldest first; the review picker defaults to the newest. */
  extraLinked: string[];
  /** #703: serve SEALED as a second linkable intent, so it also shows review controls. */
  secondLinkable: boolean;
}
const INITIAL: FixtureState = { decision: null, overall: 'incomplete', reachable: [], reviewOverride: null, extraLinked: [], secondLinkable: false };
export const fx: FixtureState = { ...INITIAL };
export function resetFixture(): void { Object.assign(fx, INITIAL, { reachable: [], extraLinked: [] }); }

function reviewStep() {
  const { decision, reviewOverride } = fx;
  if (reviewOverride) return { key: 'review', label: 'Review', ...reviewOverride };
  const vetoed = decision?.status === 'VETO';
  return { key: 'review', label: 'Review', status: vetoed ? 'failing' : 'missing',
    reason: vetoed ? 'Intent vetoed by judge at t.' : AWAITING,
    records: decision ? [{ record: 'intent-decision', decision: vetoed ? 'vetoed' : 'approved for implementation (not a review)', status: decision.status, actor: decision.actor, timestamp: decision.timestamp, entryHash: decision.entryHash, provenance: DECISION_NOTE }] : [] };
}

export function view(id: string, linkable: boolean, purpose: string) {
  const { decision, overall, reachable } = fx;
  const commit = (sha: string) => ({ edge: 'committed-under', target: sha, provenance: { sha, tree: TREE, branch: 'main' }, linkedAt: 't', actor: 'user', entryHash: `h-${sha.slice(0, 4)}` });
  return {
    integrity: 'valid', found: true, linkable,
    intent: {
      id, purpose, status: linkable ? 'PULSE' : 'SEALED', active: linkable, sealed: !linkable,
      createdBy: 'user', createdAt: '2026-10-17T00:00:00.000Z', createdEntryHash: 'e'.repeat(64), decision,
    },
    edges: [
      { edge: 'implements', target: 'runtime', provenance: { docPath: '<b>docs/RUNTIME.md</b>' }, linkedAt: 't', actor: 'user', entryHash: 'h1' },
      { ...commit(SHA), entryHash: 'h2' },
      ...fx.extraLinked.map(commit),
    ],
    assessment: {
      intentId: id, overall, gaps: overall === 'evidence-complete-except-receipt' ? [] : ['architecture', 'review', 'governance'],
      completeReachable: reachable.length === 0, completeBlockedBy: reachable,
      steps: [
        { key: 'issue', label: 'External issue', status: 'recorded', reason: 'r', records: [{ source: 'jira', key: 'PROJ-7', contentSha256: 'c'.repeat(64), createdEntryHash: 'e'.repeat(64) }] },
        { key: 'architecture', label: 'Governing architecture', status: 'stale', reason: 'changed', records: [{ target: 'runtime', docPath: '<b>docs/RUNTIME.md</b>', docSha256: 'd'.repeat(64), sourceSha: SHA, status: 'stale', currentSha256: 'f'.repeat(64), via: 'workspace-delivery' }] },
        { key: 'code', label: 'Implementation', status: 'recorded', reason: 'r', records: [{ sha: SHA, tree: TREE, branch: 'main', status: 'recorded', files: ['src/a.ts', '<i>x</i>'], filesTruncated: false, via: 'governed-commit', action: 'organize' }] },
        reviewStep(),
        { key: 'governance', label: 'Governance evidence', status: 'recorded', reason: 'r', records: [
          { entryId: 7, eventType: 'GOVERNANCE_PAUSED', timestamp: 't', entryHash: 'g'.repeat(64), matchedBy: 'intentId', value: id, kind: 'policy-decision', outcome: 'denied', chain: 'unknown' },
        ] },
        { key: 'receipt', label: 'Delivery receipt', status: 'unavailable', reason: 'Blocked on the damaged ledger (#467), B216.', records: [] },
      ],
    },
  };
}

export const INTENTS = {
  integrity: 'valid',
  intents: [
    { id: ACTIVE, purpose: '<img src=x onerror="window.__pwned=1">PROJ-7', type: 'feature', status: 'PULSE', createdAt: 't', active: true },
    { id: SEALED, purpose: 'PROJ-6 — older', type: 'feature', status: 'SEALED', createdAt: 't', active: false },
  ],
};
const CANDIDATES = {
  architecture: { state: 'present', rows: [
    { id: 'runtime', domain: 'runtime', docPath: 'docs/architecture/RUNTIME.md', status: 'canonical' },
    { id: 'storage', domain: 'storage', docPath: 'docs/architecture/STORAGE.md', status: 'proposed' },
  ] },
  commits: { state: 'ok', head: SHA2, branch: 'main', commits: [
    { sha: SHA2, subject: 'seed <script>alert(1)</script>' }, { sha: SHA, subject: 'older' },
  ] },
};

type FetchFn = (url: string, init?: { method?: string; body?: string }) => Promise<unknown>;
interface G { window?: unknown; document?: unknown; fetch?: unknown }
export interface Posted { url: string; body: Record<string, unknown> }

function getBody(url: string): unknown {
  if (url === '/api/v1/delivery/intents') return INTENTS;
  if (url === `/api/v1/delivery/intents/${ACTIVE}`) return view(ACTIVE, true, INTENTS.intents[0].purpose);
  if (url === `/api/v1/delivery/intents/${SEALED}`) return view(SEALED, fx.secondLinkable, 'PROJ-6 — older');
  return url === '/api/v1/delivery/candidates' ? CANDIDATES : { error: 'unknown' };
}

export function setupDom(): { cleanup: () => void; doc: Document; posted: Posted[]; fetched: string[] } {
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body><div id="workspace"></div></body></html>', { url: 'http://localhost:9999' });
  const g = global as unknown as G;
  const prev = { window: g.window, document: g.document, fetch: g.fetch };
  const posted: Posted[] = [];
  const fetched: string[] = [];
  g.window = dom.window;
  g.document = dom.window.document;
  g.fetch = async (url: string, init?: { method?: string; body?: string }) => {
    fetched.push(url);
    if (init?.method === 'POST') {
      posted.push({ url, body: JSON.parse(init.body ?? '{}') });
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    }
    const body = getBody(url);
    return { ok: true, status: 200, json: async () => body };
  };
  return {
    doc: dom.window.document as unknown as Document, posted, fetched,
    cleanup: () => { g.window = prev.window; g.document = prev.document; g.fetch = prev.fetch; },
  };
}

/** Dispatch a DOM event of `type` on `node` with the jsdom window's Event constructor. */
export function fire(doc: Document, node: Element, type: string): void {
  node.dispatchEvent(new (doc.defaultView as unknown as { Event: typeof Event }).Event(type, { bubbles: true }));
}

/**
 * Hold the first POST to `url` until release(); then it completes normally (`fail` 'none'), rejects
 * ('network') or answers HTTP 409 ('http'), the last two without reaching the recording fetch.
 * Later POSTs pass through. held() is true once the first POST reached the gate.
 * setupDom().cleanup restores the original fetch.
 */
export function holdPosts(url: string, fail: 'none' | 'network' | 'http' = 'none'): { release: () => void; held: () => boolean } {
  const g = global as unknown as { fetch: FetchFn };
  const prior = g.fetch;
  let release!: () => void;
  let held = false;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  g.fetch = async (u, init) => {
    if (!held && u === url && init?.method === 'POST') {
      held = true;
      await gate;
      if (fail === 'network') throw new Error('late network failure');
      if (fail === 'http') return { ok: false, status: 409, json: async () => ({ error: 'late refusal' }) };
    }
    return prior(u, init);
  };
  return { release, held: () => held };
}

/**
 * Suspend the first GET of `url`: started resolves when it reaches the gate; after release() it
 * completes normally, rejects with Error(failWith), or answers 200 with `body` instead.
 */
export function holdFirstGet(url: string, then: { failWith?: string; body?: unknown } = {}): { started: Promise<void>; release: () => void } {
  const g = global as unknown as { fetch: FetchFn };
  const prior = g.fetch;
  let announce!: () => void;
  let release!: () => void;
  let first = true;
  const started = new Promise<void>((resolve) => { announce = resolve; });
  const gate = new Promise<void>((resolve) => { release = resolve; });
  g.fetch = async (u, init) => {
    if (first && u === url && init?.method !== 'POST') {
      first = false;
      announce();
      await gate;
      if (then.failWith) throw new Error(then.failWith);
      if (then.body !== undefined) { await prior(u, init); return { ok: true, status: 200, json: async () => then.body }; } // recorded, then replaced
    }
    return prior(u, init);
  };
  return { started, release };
}

/**
 * Wrap obj[method]. The n-th call of the returned function resolves when the n-th call of the
 * method has settled, whether it is awaited before or after that call starts.
 */
export function settled(obj: Record<string, unknown>, method: string): () => Promise<void> {
  const original = (obj[method] as (...args: unknown[]) => Promise<unknown>).bind(obj);
  const waiters = new Map<number, () => void>();
  let done = 0;
  let asked = 0;
  obj[method] = async (...args: unknown[]) => {
    try { return await original(...args); } finally { done += 1; waiters.get(done)?.(); }
  };
  return () => {
    const n = ++asked;
    return n <= done ? Promise.resolve() : new Promise<void>((resolve) => { waiters.set(n, resolve); });
  };
}

// #703 review-form helpers shared by the review and switch suites.
export const REVIEW = '/api/actions/delivery/review';
export const SHA3 = '7'.repeat(40);
export const q = <T extends Element>(doc: Document, selector: string) => doc.querySelector(selector) as T;
export const value = (doc: Document, selector: string) => q<HTMLInputElement | HTMLSelectElement>(doc, selector).value;
export function typeNote(doc: Document, text: string): HTMLInputElement {
  const note = q<HTMLInputElement>(doc, '.cc-dlv-review-note');
  note.value = text;
  fire(doc, note, 'input');
  return note;
}
export function pick(doc: Document, selector: string, choice: string): void {
  const select = q<HTMLSelectElement>(doc, selector);
  select.value = choice;
  fire(doc, select, 'change');
}
/** A failing review step whose blocking records are trusted VETOs, each [ledger id, sealed commit]. */
export const vetoes = (...on: Array<[number, string]>) => ({
  status: 'failing', reason: 'Rejected by review: VETO',
  records: on.map(([id, commitSha]) => ({ record: 'blocking', kind: 'veto', id, hash: 'h'.repeat(64), label: 'Rejected by review: VETO.', verdict: 'VETO', commitSha, commitState: 'sealed' })),
});
