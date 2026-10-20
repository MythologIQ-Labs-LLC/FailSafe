// #531 slice 2 (plan-531b LD9/LD10): structural (jsdom) tests for the Architecture view's authority
// section and the registration form. jsdom checks structure only; the visual surface is checked in
// the installed VSIX (screenshots).
//
// Finding cards with line, hash and code points; the provenance line and the fixed authority scope
// line; markup in repository strings stays text; pair buttons for a conflict; domain and status in
// the posted body; conflict alternatives, pending and wedge messages after a 409; no proposal or
// supersession buttons when the ledger is unavailable.

import { strict as assert } from 'assert';
import { JSDOM } from 'jsdom';
// @ts-expect-error untyped JS module
import { ArchitectureIndexRenderer, AUTHORITY_SCOPE_LINE } from '../../../src/roadmap/ui/modules/architecture-index-renderer.js';

const SCOPE = "FailSafe compares the registry's declared domains, statuses, links and supersedes lists as written. " +
  'It does not judge whether two documents, or two domain names, mean the same thing. ' +
  "A canonical document's domain and every new domain must use plain ASCII letters, digits, spaces and . _ / & ( ) -; " +
  'a non-ASCII domain already in the index can be reused only for proposed, descriptive or historical documents, typed exactly, ' +
  'and is shown with its code points. Edits made outside FailSafe are found when this view refreshes.';

const INDEX = 'docs/ARCHITECTURE_INDEX.md';
const NOTES = 'docs/architecture/<i>NOTES</i>.md';
const ref = (id: string, domain: string, docPath: string | null, line: number, docSha256: string | null, status = 'canonical', docState = 'present') =>
  ({ id, domain, docPath, line, docSha256, status, docState });

function snapshot(ledger: 'available' | 'unavailable' = 'available') {
  return {
    state: 'present-with-problems', indexPath: INDEX, ledger, checkedAt: '2026-10-19T10:00:00.000Z',
    rows: [
      { id: 'runtime', domain: 'runtime', docPath: 'docs/architecture/RUNTIME.md', status: 'canonical', line: 8 },
      { id: 'runtime-b', domain: '<b>Runtime</b>', docPath: 'docs/architecture/B.md', status: 'canonical', line: 9 },
      { id: 'cyr', domain: 'runtim\u0435', docPath: 'docs/architecture/CYR.md', status: 'descriptive', line: 10 },
    ],
    problems: [{ code: 'conflicting-canonical', detail: 'domain "runtime" has two canonical documents' }],
    candidates: [{ path: NOTES, suggestions: ['docs/architecture/RUNTIME.md'] }],
    authority: {
      state: 'present-with-problems',
      provenance: { indexPath: INDEX, indexSha256: 'a'.repeat(64), sourceSha: 'b'.repeat(40), checkedAt: '2026-10-19T10:00:00.000Z' },
      domains: [{ key: 'runtime', cells: ['runtime', '<b>Runtime</b>'], canonical: ['runtime', 'runtime-b'], proposed: [] },
        { key: 'runtim\u0435', cells: ['runtim\u0435'], canonical: [], proposed: [] }],
      findings: [
        { kind: 'conflicting-canonical', domainKey: 'runtime', detail: 'two canonical rows',
          rows: [ref('runtime', 'runtime', 'docs/architecture/RUNTIME.md', 8, 'c'.repeat(64)), ref('runtime-b', '<b>Runtime</b>', 'docs/architecture/B.md', 9, 'd'.repeat(64))] },
        { kind: 'canonical-missing', domainKey: 'gone', reason: 'not-on-disk', detail: 'missing',
          rows: [ref('gone', 'gone', 'docs/architecture/GONE.md', 11, null, 'canonical', 'not-on-disk')] },
        { kind: 'domain-non-ascii', domainKey: 'runtim\u0435', codePoints: ['U+0435'], detail: 'non-ASCII',
          rows: [ref('cyr', 'runtim\u0435', 'docs/architecture/CYR.md', 10, 'e'.repeat(64), 'descriptive')] },
      ],
    },
  };
}

interface G { window?: unknown; document?: unknown; fetch?: unknown }
interface Posted { url: string; body: Record<string, unknown> }

function setupDom(ledger: 'available' | 'unavailable' = 'available') {
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body><div id="workspace"></div></body></html>', { url: 'http://localhost:9999' });
  const g = global as unknown as G;
  const prev = { window: g.window, document: g.document, fetch: g.fetch };
  const posted: Posted[] = [];
  const responses: Array<{ status: number; body: Record<string, unknown> }> = [];
  g.window = dom.window;
  g.document = dom.window.document;
  g.fetch = async (url: string, init?: { method?: string; body?: string }) => {
    if (init?.method === 'POST') {
      posted.push({ url, body: JSON.parse(init.body ?? '{}') });
      const r = responses.shift() ?? { status: 202, body: { ok: true, approvalId: 'l3-9', ledgerEntryId: 9 } };
      return { ok: r.status < 300, status: r.status, json: async () => r.body };
    }
    return { ok: true, status: 200, json: async () => snapshot(ledger) };
  };
  return {
    doc: dom.window.document as unknown as Document, posted, responses, window: dom.window,
    cleanup: () => { g.window = prev.window; g.document = prev.document; g.fetch = prev.fetch; },
  };
}

const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 20));
const click = async (el: Element | null): Promise<void> => { assert.ok(el, 'element exists'); (el as HTMLElement).click(); await settle(); await settle(); };

suite('ArchitectureIndexRenderer authority (#531 slice 2, jsdom structural)', () => {
  test('one card per finding with lines, hashes and code points; the provenance line; the fixed authority scope line', async () => {
    const ctx = setupDom();
    try {
      await new ArchitectureIndexRenderer('workspace').refresh();
      const d = ctx.doc;
      assert.equal(AUTHORITY_SCOPE_LINE, SCOPE);
      assert.equal(d.querySelector('.cc-arch-authority-scope')?.textContent, SCOPE);
      const cards = [...d.querySelectorAll('.cc-arch-authority .cc-arch-finding')];
      assert.deepEqual(cards.map((c) => c.getAttribute('data-kind')), ['conflicting-canonical', 'canonical-missing', 'domain-non-ascii']);
      const rows = [...cards[0].querySelectorAll('.cc-arch-finding-row')];
      assert.deepEqual(rows.map((r) => [r.getAttribute('data-line'), r.getAttribute('data-sha256')]), [['8', 'c'.repeat(64)], ['9', 'd'.repeat(64)]]);
      assert.match(cards[0].textContent ?? '', /line 8/);
      assert.match(cards[1].textContent ?? '', /not on disk/i);
      assert.match(cards[2].textContent ?? '', /U\+0435/);
      const prov = d.querySelector('.cc-arch-provenance')!;
      assert.equal(prov.getAttribute('data-index-sha256'), 'a'.repeat(64));
      assert.equal(prov.getAttribute('data-source-sha'), 'b'.repeat(40));
      assert.match(prov.textContent ?? '', /aaaaaaaaaaaa/);
      assert.match(prov.textContent ?? '', /bbbbbbbbbbbb/);
    } finally { ctx.cleanup(); }
  });

  test('markup in domains and paths stays text', async () => {
    const ctx = setupDom();
    try {
      await new ArchitectureIndexRenderer('workspace').refresh();
      const root = ctx.doc.querySelector('.cc-arch')!;
      assert.equal(root.querySelectorAll('b, i, script, img').length, 0);
      assert.ok((root.textContent ?? '').includes('<b>Runtime</b>'));
      assert.ok((root.textContent ?? '').includes(NOTES));
    } finally { ctx.cleanup(); }
  });

  test('a conflict offers pair supersession buttons that post the existing supersede action', async () => {
    const ctx = setupDom();
    try {
      await new ArchitectureIndexRenderer('workspace').refresh();
      const pairs = [...ctx.doc.querySelectorAll('.cc-arch-supersede-pair')];
      assert.deepEqual(pairs.map((p) => p.textContent), ['Propose: runtime superseded by runtime-b', 'Propose: runtime-b superseded by runtime']);
      await click(pairs[0]);
      assert.deepEqual(ctx.posted.map((p) => p.body), [{ path: 'docs/architecture/RUNTIME.md', action: 'supersede', supersededBy: 'runtime-b' }]);
    } finally { ctx.cleanup(); }
  });

  test('the registration form posts domain and status; a 409 conflict keeps its alternatives', async () => {
    const ctx = setupDom();
    try {
      const r = new ArchitectureIndexRenderer('workspace');
      await r.refresh();
      const d = ctx.doc;
      const card = d.querySelector('.cc-arch-candidate')!;
      const input = card.querySelector('input.cc-arch-domain') as HTMLInputElement;
      const select = card.querySelector('select.cc-arch-status') as HTMLSelectElement;
      const propose = card.querySelector('.cc-arch-propose') as HTMLButtonElement;
      assert.equal(select.value, 'proposed');
      assert.deepEqual([...select.options].map((o) => o.value), ['canonical', 'proposed', 'descriptive', 'historical']);
      const list = d.getElementById(input.getAttribute('list') ?? '')!;
      assert.deepEqual([...list.querySelectorAll('option')].map((o) => o.getAttribute('value')), ['runtime', '<b>Runtime</b>', 'runtim\u0435']);
      assert.equal(propose.disabled, true, 'no domain yet');
      input.value = 'runtime';
      input.dispatchEvent(new ctx.window.Event('input'));
      select.value = 'canonical';
      select.dispatchEvent(new ctx.window.Event('change'));
      assert.equal(propose.disabled, false);
      ctx.responses.push({ status: 409, body: { ok: false, conflict: 'canonical-exists', domain: 'runtime',
        existing: [{ id: 'runtime', docPath: 'docs/architecture/RUNTIME.md', line: 8 }], missing: ['runtime'],
        alternatives: ['use-existing', 'register-descriptive', 'supersede'] } });
      await click(propose);
      assert.deepEqual(ctx.posted[0].body, { path: NOTES, action: 'register', domain: 'runtime', status: 'canonical' });
      const alt = d.querySelector(`.cc-arch-candidate .cc-arch-alternatives`)!;
      assert.equal(alt.querySelector('.cc-arch-alt-open')?.textContent, 'Use existing: open docs/architecture/RUNTIME.md');
      assert.equal(alt.querySelector('.cc-arch-alt-descriptive')?.textContent, 'Register as descriptive');
      assert.equal(alt.querySelector('.cc-arch-alt-supersede')?.textContent, 'Propose superseding runtime');
      await click(alt.querySelector('.cc-arch-alt-descriptive'));
      assert.deepEqual(ctx.posted[1].body, { path: NOTES, action: 'register', domain: 'runtime', status: 'descriptive' });
    } finally { ctx.cleanup(); }
  });

  test('the supersede alternative names every canonical row; pending and wedge messages list ids, entries, lines and both exits', async () => {
    const ctx = setupDom();
    try {
      const r = new ArchitectureIndexRenderer('workspace');
      await r.refresh();
      const d = ctx.doc;
      const card = () => d.querySelector('.cc-arch-candidate')!;
      const fill = () => {
        const input = card().querySelector('input.cc-arch-domain') as HTMLInputElement;
        input.value = 'runtime';
        input.dispatchEvent(new ctx.window.Event('input'));
        const select = card().querySelector('select.cc-arch-status') as HTMLSelectElement;
        select.value = 'canonical';
        select.dispatchEvent(new ctx.window.Event('change'));
      };
      fill();
      ctx.responses.push({ status: 409, body: { ok: false, conflict: 'canonical-exists', domain: 'runtime',
        existing: [{ id: 'runtime', docPath: 'docs/architecture/RUNTIME.md', line: 8 }, { id: 'runtime-b', docPath: 'docs/architecture/B.md', line: 9 }],
        missing: ['runtime', 'runtime-b'], alternatives: ['use-existing', 'register-descriptive', 'supersede'] } });
      await click(card().querySelector('.cc-arch-propose'));
      ctx.responses.push({ status: 409, body: { ok: false, conflict: 'pending-authority', domain: 'runtime', pending: ['l3-1'],
        approvedNotInIndex: [{ entryId: 41, path: 'docs/architecture/S1.md', stillCanonical: [] },
          { entryId: 42, path: 'docs/architecture/RUNTIME.md', stillCanonical: ['runtime'] }],
        error: 'Approval recorded as ledger entry #41 is not in the index yet.' } });
      await click(card().querySelector('.cc-arch-alt-supersede'));
      assert.deepEqual(ctx.posted[1].body, { path: NOTES, action: 'register', domain: 'runtime', status: 'canonical', supersedes: ['runtime', 'runtime-b'] });
      const pending = d.querySelector('.cc-arch-result')?.textContent ?? '';
      assert.match(pending, /l3-1/);
      assert.match(pending, /#41/);
      assert.match(pending, /docs\/architecture\/S1\.md/);
      assert.match(pending, /#42/);
      assert.match(pending, /change runtime from canonical/);
      fill();
      ctx.responses.push({ status: 409, body: { ok: false, conflict: 'ambiguous-authority', reason: 'non-ascii-domain',
        rows: [{ id: 'cyr', docPath: 'docs/architecture/CYR.md', line: 10, domain: 'runtim\u0435' }],
        exits: ['rename-domain-to-ascii', 'change-status-from-canonical'] } });
      await click(card().querySelector('.cc-arch-propose'));
      const wedge = d.querySelector('.cc-arch-result')?.textContent ?? '';
      assert.match(wedge, /cyr/);
      assert.match(wedge, /line 10/);
      assert.match(wedge, /runtim\[U\+0435\]/);
      assert.match(wedge, /rename/i);
      assert.match(wedge, /status/i);
      fill();
      ctx.responses.push({ status: 409, body: { ok: false, conflict: 'ambiguous-authority', reason: 'bad-row', lines: [12], rows: [], exits: ['fix-row'] } });
      await click(card().querySelector('.cc-arch-propose'));
      const badRow = d.querySelector('.cc-arch-result')?.textContent ?? '';
      assert.match(badRow, /line 12/);
      assert.match(badRow, /cell/);
    } finally { ctx.cleanup(); }
  });

  test('with the ledger unavailable there is no enabled proposal and no supersession button', async () => {
    const ctx = setupDom('unavailable');
    try {
      await new ArchitectureIndexRenderer('workspace').refresh();
      const d = ctx.doc;
      const input = d.querySelector('.cc-arch-candidate input.cc-arch-domain') as HTMLInputElement;
      input.value = 'runtime notes';
      input.dispatchEvent(new ctx.window.Event('input'));
      const buttons = [...d.querySelectorAll('.cc-arch-propose')];
      assert.equal(buttons.length, 1);
      for (const b of buttons) assert.equal((b as HTMLButtonElement).disabled, true, 'a domain is typed; the ledger is what disables it');
      assert.equal(d.querySelectorAll('.cc-arch-supersede-pair').length, 0);
    } finally { ctx.cleanup(); }
  });
});
