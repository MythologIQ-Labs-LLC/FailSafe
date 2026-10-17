// #532 part B (plan-532b LD8/LD10): structural (jsdom) tests for the Workspace "Delivery" sub-view.
// jsdom checks structure only; the visual surface is checked in the installed VSIX (screenshots).
//
// Chips per status (recorded ok, stale warn, missing bad, unavailable muted), records with hashes,
// ids, sha and tree, the fixed scope line, markup in repository strings stays text, and no link or
// unlink buttons for a sealed (archived) intent.

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

function view(id: string, linkable: boolean, purpose: string) {
  return {
    integrity: 'valid', found: true, linkable,
    intent: { id, purpose, status: linkable ? 'PULSE' : 'SEALED', active: linkable, sealed: !linkable },
    edges: [
      { edge: 'implements', target: 'runtime', provenance: { docPath: '<b>docs/RUNTIME.md</b>' }, linkedAt: 't', actor: 'user', entryHash: 'h1' },
      { edge: 'committed-under', target: SHA, provenance: { sha: SHA, tree: TREE, branch: 'main' }, linkedAt: 't', actor: 'user', entryHash: 'h2' },
    ],
    assessment: {
      intentId: id, overall: 'incomplete', gaps: ['architecture', 'governance'],
      steps: [
        { key: 'issue', label: 'Issue', status: 'recorded', reason: 'r', records: [{ source: 'jira', key: 'PROJ-7', contentSha256: 'c'.repeat(64), createdEntryHash: 'e'.repeat(64) }] },
        { key: 'architecture', label: 'Architecture', status: 'stale', reason: 'changed', records: [{ target: 'runtime', docPath: '<b>docs/RUNTIME.md</b>', docSha256: 'd'.repeat(64), sourceSha: SHA, status: 'stale', currentSha256: 'f'.repeat(64) }] },
        { key: 'code', label: 'Code', status: 'recorded', reason: 'r', records: [{ sha: SHA, tree: TREE, branch: 'main', status: 'recorded', files: ['src/a.ts', '<i>x</i>'], filesTruncated: false }] },
        { key: 'governance', label: 'Governance evidence', status: 'missing', reason: 'none', records: [] },
        { key: 'receipt', label: 'Receipt', status: 'unavailable', reason: 'Blocked on the damaged ledger (#467), B216.', records: [] },
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
  architecture: { state: 'present', rows: [{ id: 'runtime', domain: 'runtime', docPath: 'docs/architecture/RUNTIME.md', status: 'canonical' }] },
  commits: { state: 'ok', head: SHA, branch: 'main', commits: [{ sha: SHA, subject: 'seed <script>alert(1)</script>' }] },
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
  test('five steps with a chip per status, the overall outcome and its gaps', async () => {
    const ctx = setupDom();
    try {
      await new DeliveryAssessmentRenderer('workspace').refresh();
      const d = ctx.doc;
      const steps = [...d.querySelectorAll('.cc-dlv-step')].map((s) => [s.getAttribute('data-key'), s.getAttribute('data-status')]);
      assert.deepEqual(steps, [['issue', 'recorded'], ['architecture', 'stale'], ['code', 'recorded'], ['governance', 'missing'], ['receipt', 'unavailable']]);
      const chip = (key: string) => d.querySelector(`.cc-dlv-step[data-key="${key}"] .cc-dlv-pill`)!;
      assert.match(chip('issue').className, /cc-dlv-pill-ok/);
      assert.match(chip('architecture').className, /cc-dlv-pill-warn/);
      assert.match(chip('governance').className, /cc-dlv-pill-bad/);
      assert.match(chip('receipt').className, /cc-dlv-pill-muted/);
      assert.match(d.querySelector('.cc-dlv-overall')?.textContent ?? '', /Incomplete/);
      assert.match(d.querySelector('.cc-dlv-overall')?.textContent ?? '', /Architecture, Governance evidence/);
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

  test('the active intent offers Link architecture, Link commit and Unlink; each posts once with the picked target', async () => {
    const ctx = setupDom();
    try {
      const r = new DeliveryAssessmentRenderer('workspace');
      await r.refresh();
      const d = ctx.doc;
      assert.equal(d.querySelectorAll('.cc-dlv-unlink').length, 2);
      (d.querySelector('.cc-dlv-link-arch') as HTMLButtonElement).click();
      await new Promise((res) => setTimeout(res, 20));
      (d.querySelector('.cc-dlv-link-commit') as HTMLButtonElement).click();
      await new Promise((res) => setTimeout(res, 20));
      assert.deepEqual(ctx.posted, [
        { url: '/api/actions/delivery/link', body: { intentId: ACTIVE, edge: 'implements', target: 'runtime' } },
        { url: '/api/actions/delivery/link', body: { intentId: ACTIVE, edge: 'committed-under', target: SHA } },
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
