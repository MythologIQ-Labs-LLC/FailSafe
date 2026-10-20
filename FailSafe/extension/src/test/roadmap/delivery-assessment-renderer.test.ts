// #532 part B (plan-532b LD8/LD10): structural (jsdom) tests for the Workspace "Delivery" sub-view.
// jsdom checks structure only; the visual surface is checked in the installed VSIX (screenshots).
//
// Chips per status (recorded info, passing ok, failing fail, stale warn, missing bad, unavailable
// muted), records with hashes, ids, sha and tree, the fixed scope line, markup in repository strings
// stays text, and no link or unlink buttons for a sealed (archived) intent.
// plan-532c LD9: six steps with the review step, the legend, the "complete is not reachable" line,
// the intent decision labelled "not a review" with the forgeability note, governance kind and
// outcome, "Linked by" from the edge origin, and the Failing pill.

import { strict as assert } from 'assert';
import { JSDOM } from 'jsdom';
// @ts-expect-error untyped JS module
import { DeliveryAssessmentRenderer, DELIVERY_SCOPE_LINE } from '../../../src/roadmap/ui/modules/delivery-assessment-renderer.js';

const SCOPE = 'This assessment uses only the links you recorded here and evidence already in the FailSafe ledger. ' +
  'Nothing is inferred and nothing leaves this machine. Receipts are unavailable until the ledger repair (#467). ' +
  'Recorded means the evidence is present, not that it passed.';

const ACTIVE = '11111111-1111-4111-8111-111111111111';
const SEALED = '22222222-2222-4222-8222-222222222222';
const SHA = 'a'.repeat(40);
const TREE = 'b'.repeat(40);
const SHA2 = '9'.repeat(40);

const DECISION_NOTE = 'Recorded in the local intent history; the chain shows the entry is unchanged since it was chained, not who wrote it.';
let decision: { status: string; actor: string; timestamp: string; entryHash: string } | null = null;
let overall = 'incomplete';

function view(id: string, linkable: boolean, purpose: string) {
  const vetoed = decision?.status === 'VETO';
  return {
    integrity: 'valid', found: true, linkable,
    intent: {
      id, purpose, status: linkable ? 'PULSE' : 'SEALED', active: linkable, sealed: !linkable,
      createdBy: 'user', createdAt: '2026-10-17T00:00:00.000Z', createdEntryHash: 'e'.repeat(64), decision,
    },
    edges: [
      { edge: 'implements', target: 'runtime', provenance: { docPath: '<b>docs/RUNTIME.md</b>' }, linkedAt: 't', actor: 'user', entryHash: 'h1' },
      { edge: 'committed-under', target: SHA, provenance: { sha: SHA, tree: TREE, branch: 'main' }, linkedAt: 't', actor: 'user', entryHash: 'h2' },
    ],
    assessment: {
      intentId: id, overall, gaps: ['architecture', 'review', 'governance'], completeReachable: false, completeBlockedBy: ['B320', 'B321'],
      steps: [
        { key: 'issue', label: 'External issue', status: 'recorded', reason: 'r', records: [{ source: 'jira', key: 'PROJ-7', contentSha256: 'c'.repeat(64), createdEntryHash: 'e'.repeat(64) }] },
        { key: 'architecture', label: 'Governing architecture', status: 'stale', reason: 'changed', records: [{ target: 'runtime', docPath: '<b>docs/RUNTIME.md</b>', docSha256: 'd'.repeat(64), sourceSha: SHA, status: 'stale', currentSha256: 'f'.repeat(64), via: 'workspace-delivery' }] },
        { key: 'code', label: 'Implementation', status: 'recorded', reason: 'r', records: [{ sha: SHA, tree: TREE, branch: 'main', status: 'recorded', files: ['src/a.ts', '<i>x</i>'], filesTruncated: false, via: 'governed-commit', action: 'organize' }] },
        { key: 'review', label: 'Review', status: vetoed ? 'failing' : 'missing',
          reason: vetoed ? 'Intent vetoed by judge at t.' : 'FailSafe records no review of the implementation yet: no command records a review verdict (B320) and no governance event names the commit it evaluated (B321).',
          records: decision ? [{ decision: vetoed ? 'vetoed' : 'approved for implementation (not a review)', status: decision.status, actor: decision.actor, timestamp: decision.timestamp, entryHash: decision.entryHash, provenance: DECISION_NOTE }] : [] },
        { key: 'governance', label: 'Governance evidence', status: 'recorded', reason: 'r', records: [
          { entryId: 7, eventType: 'GOVERNANCE_PAUSED', timestamp: 't', entryHash: 'g'.repeat(64), matchedBy: 'intentId', value: id, kind: 'policy-decision', outcome: 'denied', chain: 'unknown' },
        ] },
        { key: 'receipt', label: 'Delivery receipt', status: 'unavailable', reason: 'Blocked on the damaged ledger (#467), B216.', records: [] },
      ],
    },
  };
}

const INTENTS = {
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

interface G { window?: unknown; document?: unknown; fetch?: unknown }
interface Posted { url: string; body: Record<string, unknown> }

function setupDom(): { cleanup: () => void; doc: Document; posted: Posted[]; fetched: string[] } {
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
    const body = url === '/api/v1/delivery/intents' ? INTENTS
      : url === `/api/v1/delivery/intents/${ACTIVE}` ? view(ACTIVE, true, INTENTS.intents[0].purpose)
        : url === `/api/v1/delivery/intents/${SEALED}` ? view(SEALED, false, 'PROJ-6 — older')
          : url === '/api/v1/delivery/candidates' ? CANDIDATES : { error: 'unknown' };
    return { ok: true, status: 200, json: async () => body };
  };
  return {
    doc: dom.window.document as unknown as Document, posted, fetched,
    cleanup: () => { g.window = prev.window; g.document = prev.document; g.fetch = prev.fetch; },
  };
}

suite('DeliveryAssessmentRenderer (#532 LD8, jsdom structural)', () => {
  setup(() => { decision = null; overall = 'incomplete'; });

  test('six steps with a chip per status, the overall outcome, its gaps and why complete is not reachable', async () => {
    const ctx = setupDom();
    try {
      await new DeliveryAssessmentRenderer('workspace').refresh();
      const d = ctx.doc;
      const steps = [...d.querySelectorAll('.cc-dlv-step')].map((s) => [s.getAttribute('data-key'), s.getAttribute('data-status')]);
      assert.deepEqual(steps, [['issue', 'recorded'], ['architecture', 'stale'], ['code', 'recorded'], ['review', 'missing'], ['governance', 'recorded'], ['receipt', 'unavailable']]);
      const chip = (key: string) => d.querySelector(`.cc-dlv-step[data-key="${key}"] .cc-dlv-pill`)!;
      assert.match(chip('issue').className, /cc-dlv-pill-info/, 'recorded is not shown as a pass');
      assert.doesNotMatch(chip('issue').className, /cc-dlv-pill-ok/);
      assert.match(chip('architecture').className, /cc-dlv-pill-warn/);
      assert.match(chip('review').className, /cc-dlv-pill-bad/);
      assert.match(chip('receipt').className, /cc-dlv-pill-muted/);
      const o = d.querySelector('.cc-dlv-overall')?.textContent ?? '';
      assert.match(o, /Incomplete/);
      assert.match(o, /Governing architecture, Review, Governance evidence/);
      assert.match(o, /Complete is not reachable yet: FailSafe records no review of the implementation \(B320, B321\)\. The receipt also needs the ledger repair \(#467\)\./);
    } finally { ctx.cleanup(); }
  });

  test('the legend names all six statuses with distinct chips', async () => {
    const ctx = setupDom();
    try {
      await new DeliveryAssessmentRenderer('workspace').refresh();
      const pills = [...ctx.doc.querySelectorAll('.cc-dlv-legend .cc-dlv-pill')];
      assert.deepEqual(pills.map((p) => p.textContent), ['Recorded', 'Passing', 'Failing', 'Stale', 'Missing', 'Unavailable']);
      assert.equal(new Set(pills.map((p) => p.className)).size, 6, 'each status has its own chip class');
      assert.match(ctx.doc.querySelector('.cc-dlv-legend')?.textContent ?? '', /Recorded means present, not passed/);
    } finally { ctx.cleanup(); }
  });

  test('the intent decision: approved for implementation (not a review), with the provenance note; review stays missing', async () => {
    decision = { status: 'PASS', actor: 'judge', timestamp: '2026-10-19T00:00:00.000Z', entryHash: 'p'.repeat(64) };
    const ctx = setupDom();
    try {
      await new DeliveryAssessmentRenderer('workspace').refresh();
      const head = ctx.doc.querySelector('.cc-dlv-intent')?.textContent ?? '';
      assert.match(head, /Intent decision: approved for implementation \(not a review\)/);
      assert.match(head, /judge/);
      assert.ok(head.includes(DECISION_NOTE));
      assert.match(head, /Created by user/);
      assert.ok(head.includes('e'.repeat(64)));
      const review = ctx.doc.querySelector('.cc-dlv-step[data-key="review"]')!;
      assert.equal(review.getAttribute('data-status'), 'missing');
      assert.match(review.textContent ?? '', /B320/);
      assert.ok((review.textContent ?? '').includes('p'.repeat(64)));
    } finally { ctx.cleanup(); }
  });

  test('a vetoed intent: review Failing, the Failing pill, "vetoed" in the header', async () => {
    decision = { status: 'VETO', actor: 'judge', timestamp: 't', entryHash: 'v'.repeat(64) };
    overall = 'failing';
    const ctx = setupDom();
    try {
      await new DeliveryAssessmentRenderer('workspace').refresh();
      const d = ctx.doc;
      const chip = d.querySelector('.cc-dlv-step[data-key="review"] .cc-dlv-pill')!;
      assert.equal(chip.textContent, 'Failing');
      assert.match(chip.className, /cc-dlv-pill-fail/);
      assert.match(d.querySelector('.cc-dlv-step[data-key="review"]')?.textContent ?? '', /Intent vetoed/);
      const pill = d.querySelector('.cc-dlv-overall .cc-dlv-pill')!;
      assert.equal(pill.textContent, 'Failing');
      assert.match(d.querySelector('.cc-dlv-intent')?.textContent ?? '', /Intent decision: vetoed/);
    } finally { ctx.cleanup(); }
  });

  test('governance records show kind and outcome; edge records show who linked them', async () => {
    const ctx = setupDom();
    try {
      await new DeliveryAssessmentRenderer('workspace').refresh();
      const gov = ctx.doc.querySelector('.cc-dlv-step[data-key="governance"]')?.textContent ?? '';
      assert.match(gov, /Kind.*policy decision/);
      assert.match(gov, /Outcome.*denied/);
      assert.doesNotMatch(gov, /Matched by/);
      const code = ctx.doc.querySelector('.cc-dlv-step[data-key="code"]')?.textContent ?? '';
      assert.match(code, /Linked by.*FailSafe organize \(governed commit\)/);
      const arch = ctx.doc.querySelector('.cc-dlv-step[data-key="architecture"]')?.textContent ?? '';
      assert.match(arch, /Linked by.*Workspace > Delivery/);
    } finally { ctx.cleanup(); }
  });

  test('records show hashes, ids, sha and tree; the architecture record says HEAD at link time', async () => {
    const ctx = setupDom();
    try {
      await new DeliveryAssessmentRenderer('workspace').refresh();
      const text = ctx.doc.querySelector('.cc-dlv')?.textContent ?? '';
      for (const v of ['c'.repeat(64), 'e'.repeat(64), 'd'.repeat(64), 'f'.repeat(64), SHA, TREE, 'PROJ-7', 'src/a.ts']) {
        assert.ok(text.includes(v), `record value ${v.slice(0, 12)} shown`);
      }
      assert.match(text, /HEAD at link time/);
      assert.match(text, /Blocked on the damaged ledger \(#467\), B216\./);
    } finally { ctx.cleanup(); }
  });

  test('the fixed scope line is shown verbatim', async () => {
    const ctx = setupDom();
    try {
      await new DeliveryAssessmentRenderer('workspace').refresh();
      assert.equal(DELIVERY_SCOPE_LINE, SCOPE);
      assert.equal(ctx.doc.querySelector('.cc-dlv-scope')?.textContent, SCOPE);
    } finally { ctx.cleanup(); }
  });

  test('markup in purposes, paths, subjects and file names stays text', async () => {
    const ctx = setupDom();
    try {
      await new DeliveryAssessmentRenderer('workspace').refresh();
      const root = ctx.doc.querySelector('.cc-dlv')!;
      assert.equal(root.querySelectorAll('img, b, i, script').length, 0, 'no element was created from a string');
      assert.ok((root.textContent ?? '').includes('<b>docs/RUNTIME.md</b>'));
      assert.ok((root.textContent ?? '').includes('<img src=x onerror="window.__pwned=1">PROJ-7'));
      assert.ok((root.textContent ?? '').includes('seed <script>alert(1)</script>'));
    } finally { ctx.cleanup(); }
  });

  test('the active intent offers Link architecture, Link commit and Unlink; already-linked targets are not offered; each posts once', async () => {
    const ctx = setupDom();
    try {
      const r = new DeliveryAssessmentRenderer('workspace');
      await r.refresh();
      const d = ctx.doc;
      assert.equal(d.querySelectorAll('.cc-dlv-unlink').length, 2);
      const archOptions = [...d.querySelectorAll('.cc-dlv-arch-pick option')].map((o) => (o as HTMLOptionElement).value);
      assert.deepEqual(archOptions, ['storage'], 'the linked row is not offered again');
      const commitOptions = [...d.querySelectorAll('.cc-dlv-commit-pick option')].map((o) => (o as HTMLOptionElement).value);
      assert.deepEqual(commitOptions, [SHA2], 'the linked commit is not offered again');
      (d.querySelector('.cc-dlv-link-arch') as HTMLButtonElement).click();
      await new Promise((res) => setTimeout(res, 20));
      (d.querySelector('.cc-dlv-link-commit') as HTMLButtonElement).click();
      await new Promise((res) => setTimeout(res, 20));
      assert.deepEqual(ctx.posted, [
        { url: '/api/actions/delivery/link', body: { intentId: ACTIVE, edge: 'implements', target: 'storage' } },
        { url: '/api/actions/delivery/link', body: { intentId: ACTIVE, edge: 'committed-under', target: SHA2 } },
      ]);
      assert.ok(ctx.fetched.every((u) => u.startsWith('/api/')), 'every fetch target is relative');
    } finally { ctx.cleanup(); }
  });

  test('a sealed intent is read-only: no link or unlink buttons and no candidate fetch', async () => {
    const ctx = setupDom();
    try {
      const r = new DeliveryAssessmentRenderer('workspace');
      await r.refresh();
      const picker = ctx.doc.querySelector('.cc-dlv-picker') as HTMLSelectElement;
      picker.value = SEALED;
      picker.dispatchEvent(new (ctx.doc.defaultView as unknown as { Event: typeof Event }).Event('change'));
      await new Promise((res) => setTimeout(res, 50));
      const d = ctx.doc;
      assert.equal(d.querySelector('.cc-dlv')?.getAttribute('data-intent'), SEALED);
      assert.equal(d.querySelectorAll('.cc-dlv-link-arch, .cc-dlv-link-commit, .cc-dlv-unlink').length, 0);
      assert.match(d.querySelector('.cc-dlv')?.textContent ?? '', /sealed/i);
      const after = ctx.fetched.slice(ctx.fetched.lastIndexOf(`/api/v1/delivery/intents/${SEALED}`));
      assert.equal(after.includes('/api/v1/delivery/candidates'), false);
    } finally { ctx.cleanup(); }
  });
});
