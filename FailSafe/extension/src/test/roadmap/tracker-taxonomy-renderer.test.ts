// #548 (T7) — Workspace › Taxonomy editor, jsdom structural tests. Save must keep
// every field the editor does not edit, only a successful Save may move the editor's
// baseline (so a repeated or retried Save never copies one row's fields onto
// another), a failed load hides Save, and the Console drift block renders as text.
// NOTE: jsdom verifies structure only; the visual check is done separately.

import { strict as assert } from 'assert';
import { JSDOM } from 'jsdom';
// @ts-expect-error untyped JS module
import { TrackerTaxonomyRenderer } from '../../../src/roadmap/ui/modules/tracker-taxonomy-renderer.js';

interface FakeResponse { ok: boolean; status: number; json: () => Promise<unknown> }
type Responder = (url: string, init?: { method?: string; body?: string }) => Promise<FakeResponse>;
interface G { window?: unknown; document?: unknown; fetch?: unknown }

const json = (body: unknown, status = 200): FakeResponse => ({ ok: status < 400, status, json: async () => body });

function config() {
  return {
    programs: [{ key: 'core', name: 'Core', accent: '#0f0' }, { key: 'rt', name: 'Runtime', accent: '#f00' }],
    verticals: [
      { key: 'core', name: 'Core', accent: '#0f0', summary: 'S-core', functionality: ['**A** a'], backend: ['B-core'],
        components: [{ c: 'x', w: 'y', a: 'public' }], crossCutting: true },
      { key: 'rt', name: 'Runtime', accent: '#f00', summary: 'S-rt', functionality: ['**R** r'], backend: ['B-rt'] },
      { key: 'ops', name: 'Ops', accent: '#00f', summary: 'S-ops', functionality: ['**O** o'] },
    ],
    agents: [{ key: 'core', name: 'Core', program: 'core', vertical: 'core', patterns: ['core'], evidence: ['v1.0'] }],
  };
}

const DRIFTED = {
  applies: true, matched: 7, consoleVerticals: 7, drifted: 4, unmatched: ['roadmap'],
  verticals: [
    { key: 'monitor', name: 'Monitor', declared: true, missing: [], extra: [], outOfOrder: false },
    { key: 'learn', name: 'Learn', declared: false, missing: ['Learn'], extra: [], outOfOrder: false },
    { key: 'agents', name: 'Agents', declared: true, missing: [], extra: [], outOfOrder: true },
    { key: 'governance', name: 'Governance', declared: true, missing: ['Shadow Genome'], extra: [], outOfOrder: false },
    { key: 'workspace', name: 'Workspace', declared: true, missing: [], extra: ['Roadmap'], outOfOrder: false },
  ],
};
const CLEAN = { applies: true, matched: 7, consoleVerticals: 7, drifted: 0, unmatched: [], verticals: [] };

function setupDom(responder: Responder) {
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body><div id="workspace"></div></body></html>', { url: 'http://localhost:9999' });
  const g = global as unknown as G;
  const prev = { window: g.window, document: g.document, fetch: g.fetch };
  const posts: Array<Record<string, any>> = [];
  g.window = dom.window;
  g.document = dom.window.document;
  g.fetch = async (url: string, init?: { method?: string; body?: string }) => {
    if (init?.method === 'POST') posts.push(JSON.parse(init.body || '{}'));
    return responder(url, init);
  };
  const doc = dom.window.document as unknown as Document;
  return {
    doc,
    posts,
    rows: (kind: string) => [...doc.querySelectorAll(`.cc-tax-section[data-kind="${kind}"] .cc-tax-row`)] as HTMLElement[],
    input: (row: Element, field: string) => row.querySelector(`[data-field="${field}"]`) as HTMLInputElement,
    cleanup: () => { g.window = prev.window; g.document = prev.document; g.fetch = prev.fetch; },
  };
}

/** GET answers `getBody`; POSTs answer the queued responses in order (default ok). */
function serve(getBody: unknown, postQueue: Array<() => Promise<FakeResponse>> = []): Responder {
  return async (_url, init) => {
    if (init?.method !== 'POST') return json(getBody);
    const next = postQueue.shift();
    return next ? next() : json({ ok: true, written: ['docs/roadmap/tracker-config.yaml'], drift: CLEAN });
  };
}

async function mount(responder: Responder) {
  const ctx = setupDom(responder);
  const r = new TrackerTaxonomyRenderer('workspace');
  await r.render();
  return { ctx, r };
}

suite('#548 TrackerTaxonomyRenderer (jsdom)', () => {
  test('Save keeps every field the editor does not edit; the edit is saved', async () => {
    const { ctx, r } = await mount(serve({ config: config(), source: 'config' }));
    try {
      ctx.input(ctx.rows('verticals')[0], 'name').value = 'Core 2';
      await r.save();
      const [body] = ctx.posts;
      assert.deepEqual(body.verticals[0], { ...config().verticals[0], name: 'Core 2' });
      assert.deepEqual(body.verticals[1], config().verticals[1]);
      assert.deepEqual(body.agents[0], config().agents[0], 'agent evidence kept');
      assert.deepEqual(body.programs, config().programs);
    } finally { ctx.cleanup(); }
  });

  test('a cleared field and an unchecked cross-cutting box are removed, not restored', async () => {
    const { ctx, r } = await mount(serve({ config: config(), source: 'config' }));
    try {
      ctx.input(ctx.rows('programs')[0], 'accent').value = '';
      (ctx.rows('verticals')[0].querySelector('[data-field="crossCutting"]') as HTMLInputElement).checked = false;
      await r.save();
      assert.equal('accent' in ctx.posts[0].programs[0], false);
      assert.equal('crossCutting' in ctx.posts[0].verticals[0], false);
      assert.equal(ctx.posts[0].verticals[0].summary, 'S-core');
    } finally { ctx.cleanup(); }
  });

  test('a deleted row stays deleted, an added row has only its typed fields, a renamed key keeps its fields', async () => {
    const { ctx, r } = await mount(serve({ config: config(), source: 'config' }));
    try {
      (ctx.rows('verticals')[2].querySelector('[data-del]') as HTMLButtonElement).click();
      ctx.input(ctx.rows('verticals')[1], 'key').value = 'runtime';
      (ctx.doc.querySelector('[data-add="verticals"]') as HTMLButtonElement).click();
      const added = ctx.rows('verticals')[2];
      ctx.input(added, 'key').value = 'new';
      ctx.input(added, 'name').value = 'New';
      await r.save();
      const v = ctx.posts[0].verticals;
      assert.deepEqual(v.map((x: { key: string }) => x.key), ['core', 'runtime', 'new']);
      assert.deepEqual(v[1], { ...config().verticals[1], key: 'runtime' });
      assert.deepEqual(v[2], { key: 'new', name: 'New' });
    } finally { ctx.cleanup(); }
  });

  test('delete the first row, Save, edit, Save again: each row keeps its own fields', async () => {
    const { ctx, r } = await mount(serve({ config: config(), source: 'config' }));
    try {
      (ctx.rows('verticals')[0].querySelector('[data-del]') as HTMLButtonElement).click();
      await r.save();
      ctx.input(ctx.rows('verticals')[0], 'name').value = 'Runtime 2';
      await r.save();
      const second = ctx.posts[1].verticals;
      assert.deepEqual(second, [{ ...config().verticals[1], name: 'Runtime 2' }, config().verticals[2]]);
    } finally { ctx.cleanup(); }
  });

  test('failed Saves (403, 429, network error) change nothing; the retry keeps every field', async () => {
    const queue = [
      async () => json({ ok: false, error: 'refused' }, 403),
      async () => json({ error: 'Too many requests' }, 429),
      async () => { throw new Error('network down'); },
    ];
    const { ctx, r } = await mount(serve({ config: config(), source: 'config' }, queue));
    try {
      (ctx.rows('verticals')[0].querySelector('[data-del]') as HTMLButtonElement).click();
      ctx.input(ctx.rows('verticals')[1], 'name').value = 'Ops 2';
      for (let i = 0; i < 3; i += 1) {
        await r.save();
        assert.equal(ctx.rows('verticals').length, 2, `attempt ${i + 1}: the DOM keeps the operator's edits`);
        assert.match(ctx.doc.querySelector('#cc-tax-status')!.textContent || '', /refused|Too many|failed/i);
      }
      assert.deepEqual(r.config, config(), 'the baseline moves only on a successful Save');
      await r.save();
      assert.deepEqual(ctx.posts[3].verticals, [config().verticals[1], { ...config().verticals[2], name: 'Ops 2' }]);
    } finally { ctx.cleanup(); }
  });

  // #548 C6 (N-b, declared change): untouched rows the editor cannot show pass through
  // unchanged — this row used to pin that a keyless null row is dropped.
  test('rows that are not objects render; a touched one saves its inputs, untouched ones pass through', async () => {
    const cfg = config() as { verticals: unknown[] };
    cfg.verticals.push('x', null, 7);
    const { ctx, r } = await mount(serve({ config: cfg, source: 'config' }));
    try {
      const rows = ctx.rows('verticals');
      assert.equal(rows.length, 6);
      ctx.input(rows[3], 'key').value = 'x2';
      await r.save();
      assert.deepEqual(ctx.posts[0].verticals.slice(3), [{ key: 'x2' }, null, 7]);
    } finally { ctx.cleanup(); }
  });

  test('rows with a falsy or missing key are kept: untouched as loaded, touched with their edit', async () => {
    const cfg = config() as { verticals: unknown[] };
    cfg.verticals.push({ key: 0, name: 'Zero', summary: 'S0' }, { key: false, name: 'False' }, { name: 'No key', summary: 'S-none' });
    const { ctx, r } = await mount(serve({ config: cfg, source: 'config' }));
    try {
      ctx.input(ctx.rows('verticals')[3], 'name').value = 'Zero 2';
      await r.save();
      assert.deepEqual(ctx.posts[0].verticals.slice(3), [
        { key: 0, name: 'Zero 2', summary: 'S0' }, { key: false, name: 'False' }, { name: 'No key', summary: 'S-none' },
      ]);
    } finally { ctx.cleanup(); }
  });

  test('an untouched multi-line value is saved byte-identical (an input strips CR/LF from what it shows)', async () => {
    const cfg = config();
    cfg.programs[0].name = 'Line 1\nLine 2\r\n  indented ';
    const { ctx, r } = await mount(serve({ config: cfg, source: 'config' }));
    try {
      ctx.input(ctx.rows('programs')[1], 'name').value = 'Runtime 2';
      await r.save();
      assert.equal(ctx.posts[0].programs[0].name, 'Line 1\nLine 2\r\n  indented ');
      assert.equal(ctx.posts[0].programs[1].name, 'Runtime 2');
    } finally { ctx.cleanup(); }
  });

  test('a save whose directive write failed adopts the new fingerprint and baseline (no false 409 next)', async () => {
    const fp = 'a'.repeat(64);
    const written = 'd'.repeat(64);
    const queue = [async () => json({ ok: false, error: 'directive-write-failed', written: ['docs/roadmap/tracker-config.yaml'], fingerprint: written }, 500)];
    const { ctx, r } = await mount(serve({ config: config(), source: 'config', fingerprint: fp }, queue));
    try {
      (ctx.rows('verticals')[0].querySelector('[data-del]') as HTMLButtonElement).click();
      await r.save();
      assert.equal(r.fingerprint, written);
      assert.deepEqual(r.config.verticals, config().verticals.slice(1), 'the saved taxonomy is the new baseline');
      assert.match(ctx.doc.querySelector('#cc-tax-status')!.textContent || '', /directive record could not be written/);
      await r.save();
      assert.deepEqual(ctx.posts.map((b) => b.fingerprint), [fp, written]);
    } finally { ctx.cleanup(); }
  });

  test('a value with quotes survives the round trip through its input', async () => {
    const cfg = config();
    cfg.programs[0].name = 'He said "hi" & <b>left</b>';
    const { ctx, r } = await mount(serve({ config: cfg, source: 'config' }));
    try {
      const input = ctx.input(ctx.rows('programs')[0], 'name');
      assert.equal(input.value, 'He said "hi" & <b>left</b>', 'the input shows the whole value');
      assert.equal(ctx.doc.querySelectorAll('#workspace b').length, 0);
      input.value = `${input.value}!`;
      await r.save();
      assert.equal(ctx.posts[0].programs[0].name, 'He said "hi" & <b>left</b>!');
    } finally { ctx.cleanup(); }
  });

  test('Save sends the loaded fingerprint, then the one each successful Save returns', async () => {
    const first = 'a'.repeat(64);
    const second = 'b'.repeat(64);
    const queue = [async () => json({ ok: true, written: [], drift: CLEAN, fingerprint: second }), async () => json({ ok: true, written: [], drift: CLEAN, fingerprint: 'c'.repeat(64) })];
    const { ctx, r } = await mount(serve({ config: config(), source: 'config', fingerprint: first }, queue));
    try {
      await r.save();
      await r.save();
      assert.deepEqual(ctx.posts.map((b) => b.fingerprint), [first, second]);
    } finally { ctx.cleanup(); }
  });

  test('a 409 changed-on-disk Save says so, tells the operator to reload, and changes nothing', async () => {
    const fp = 'a'.repeat(64);
    const queue = [async () => json({ ok: false, error: 'changed-on-disk' }, 409)];
    const { ctx, r } = await mount(serve({ config: config(), source: 'config', fingerprint: fp }, queue));
    try {
      ctx.input(ctx.rows('verticals')[0], 'name').value = 'Core 2';
      await r.save();
      const status = ctx.doc.querySelector('#cc-tax-status')!.textContent || '';
      assert.match(status, /changed on disk/);
      assert.match(status, /Reload the Console/);
      assert.deepEqual(r.config, config(), 'baseline unchanged');
      assert.equal(r.fingerprint, fp, 'fingerprint unchanged');
      assert.equal(ctx.input(ctx.rows('verticals')[0], 'name').value, 'Core 2', 'the edit stays on screen');
    } finally { ctx.cleanup(); }
  });

  test('a row whose key is an object (odd toString) paints and is saved unchanged when untouched', async () => {
    const cfg = config() as { verticals: unknown[] };
    const odd = { key: { toString: 1 }, name: 'Odd', summary: 'S-odd' };
    cfg.verticals.push(odd);
    const { ctx, r } = await mount(serve({ config: cfg, source: 'config' }));
    try {
      assert.equal(ctx.rows('verticals').length, 4);
      await r.save();
      assert.deepEqual(ctx.posts[0].verticals[3], odd);
    } finally { ctx.cleanup(); }
  });

  test('the drift block lists each drifted vertical and names the file to edit', async () => {
    const { ctx } = await mount(serve({ config: config(), source: 'config', drift: DRIFTED }));
    try {
      const block = ctx.doc.querySelector('.cc-tax-drift') as HTMLElement;
      assert.equal(block.getAttribute('data-state'), 'drift');
      assert.match(block.textContent || '', /4 of 7 verticals differ/);
      assert.match(block.textContent || '', /docs\/roadmap\/tracker-config\.yaml/);
      const row = (k: string) => (ctx.doc.querySelector(`[data-drift-key="${k}"]`)?.textContent || '');
      assert.match(row('governance'), /missing: Shadow Genome/);
      assert.match(row('workspace'), /extra: Roadmap/);
      assert.match(row('agents'), /order differs/);
      assert.match(row('learn'), /not declared/);
      assert.equal(ctx.doc.querySelector('[data-drift-key="monitor"]'), null, 'a clean vertical has no row');
      assert.match(block.textContent || '', /Not Console verticals: roadmap/);
    } finally { ctx.cleanup(); }
    const derived = await mount(serve({ config: config(), source: 'derived', drift: DRIFTED }));
    try {
      assert.match(derived.ctx.doc.querySelector('.cc-tax-drift')!.textContent || '', /docs\/roadmap\/programs\.yaml/);
    } finally { derived.ctx.cleanup(); }
  });

  test('clean, partial and not-applicable states', async () => {
    const cases: Array<[unknown, string | null, RegExp | null]> = [
      [CLEAN, 'clean', /match the Console navigation \(7 of 7\)/],
      [{ ...CLEAN, applies: false, matched: 3 }, 'partial', /only 3 of 7 vertical keys match/],
      [{ ...CLEAN, applies: false, matched: 0 }, null, null],
      [undefined, null, null],
    ];
    for (const [drift, state, text] of cases) {
      const { ctx } = await mount(serve({ config: config(), source: 'config', drift }));
      try {
        const block = ctx.doc.querySelector('.cc-tax-drift');
        if (state === null) { assert.equal(block, null, JSON.stringify(drift)); continue; }
        assert.equal(block!.getAttribute('data-state'), state);
        assert.match(block!.textContent || '', text!);
      } finally { ctx.cleanup(); }
    }
  });

  test('drift survives a hub re-render, and repaints from the Save answer', async () => {
    const { ctx, r } = await mount(serve({ config: config(), source: 'config', drift: DRIFTED }));
    try {
      await r.render();
      r.paint();
      assert.equal(ctx.doc.querySelector('.cc-tax-drift')!.getAttribute('data-state'), 'drift');
      await r.save();
      assert.equal(ctx.doc.querySelector('.cc-tax-drift')!.getAttribute('data-state'), 'clean');
      assert.match(ctx.doc.querySelector('#cc-tax-status')!.textContent || '', /Saved/);
    } finally { ctx.cleanup(); }
  });

  test('markup in drift labels and keys renders as text', async () => {
    const evil = '<img src=x onerror=alert(1)>';
    const drift = { ...DRIFTED, unmatched: [evil], verticals: [{ key: 'governance', name: 'Governance', declared: true, missing: [], extra: [evil], outOfOrder: false }] };
    const { ctx } = await mount(serve({ config: config(), source: 'config', drift }));
    try {
      assert.equal(ctx.doc.querySelectorAll('img').length, 0);
      assert.ok((ctx.doc.querySelector('.cc-tax-drift')!.textContent || '').includes(evil));
    } finally { ctx.cleanup(); }
  });

  test('a failed load shows the error and offers no rows and no Save', async () => {
    const failures: Array<[string, Responder]> = [
      ['500 parse error', async () => json({ error: 'docs/roadmap/tracker-config.yaml exists but could not be parsed' }, 500)],
      ['network error', async () => { throw new Error('offline'); }],
      ['non-JSON body', async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad json'); } })],
      ['missing config', async () => json({ source: 'config' })],
    ];
    for (const [label, responder] of failures) {
      const { ctx } = await mount(responder);
      try {
        assert.ok(ctx.doc.querySelector('.cc-tax-error'), `${label}: error shown`);
        assert.equal(ctx.doc.querySelector('.cc-tax-save'), null, `${label}: no Save button`);
        assert.equal(ctx.doc.querySelectorAll('.cc-tax-row').length, 0, `${label}: no rows`);
      } finally { ctx.cleanup(); }
    }
  });
});

// B331 — the editor keeps a draft of the operator's rows across hub repaints, failed
// Saves and navigation; only a load, a successful (or directive-failed) Save, a Reload
// click or an applied foreign change starts a new draft generation. A change made on
// disk or in another Console window while edits are pending is a visible conflict.
const F0 = '0'.repeat(64);
const F1 = '1'.repeat(64);
const F2 = '2'.repeat(64);

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

function disk2() {
  const c = config();
  c.programs[0].name = 'Core (disk 2)';
  c.verticals[1].name = 'Runtime (disk 2)';
  return c;
}

/** GETs answer `gets` in order (the last repeats); POSTs answer `posts` in order. */
function scripted(gets: Array<() => Promise<FakeResponse>>, posts: Array<() => Promise<FakeResponse>> = []) {
  const counts = { get: 0, post: 0 };
  const responder: Responder = async (_url, init) => {
    if (init?.method === 'POST') {
      counts.post += 1;
      const next = posts.shift();
      return next ? next() : json({ ok: true, written: [], drift: CLEAN, fingerprint: F1 });
    }
    counts.get += 1;
    const next = gets.length > 1 ? gets.shift()! : gets[0];
    return next();
  };
  return { responder, counts };
}

const load = (cfg: unknown, fingerprint: string) => async () => json({ config: cfg, source: 'config', fingerprint, drift: CLEAN });

function typeInto(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new (input.ownerDocument.defaultView as unknown as typeof globalThis).Event('input', { bubbles: true }));
}

const updated = (fingerprint: string) => ({ type: 'tracker.config.updated', payload: { written: [], fingerprint } });
const rowIds = (doc: Document) => [...doc.querySelectorAll('.cc-tax-row')].map((r) => r.getAttribute('data-row-id'));

suite('B331 TrackerTaxonomyRenderer draft (jsdom)', () => {
  test('J1: edits, a delete above them and an added row survive hub repaints; Save posts exactly them', async () => {
    const s = scripted([load(config(), F0)]);
    const { ctx, r } = await mount(s.responder);
    try {
      const ops = ctx.rows('verticals')[2];
      typeInto(ctx.input(ops, 'name'), 'Ops 2');
      typeInto(ctx.input(ops, 'key'), 'ops2');
      (ctx.rows('verticals')[0].querySelector('[data-del]') as HTMLButtonElement).click();
      (ctx.doc.querySelector('[data-add="verticals"]') as HTMLButtonElement).click();
      typeInto(ctx.input(ctx.rows('verticals')[2], 'key'), 'new');
      await r.render({ version: 'hub' });
      r.paint();
      r.onEvent({ type: 'risk.updated', payload: {} });
      await r.render({ version: 'hub-2' });
      const rows = ctx.rows('verticals');
      assert.deepEqual(rows.map((x) => ctx.input(x, 'key').value), ['rt', 'ops2', 'new']);
      assert.equal(ctx.input(rows[1], 'name').value, 'Ops 2');
      await r.save();
      assert.deepEqual(ctx.posts[0].verticals, [config().verticals[1], { ...config().verticals[2], key: 'ops2', name: 'Ops 2' }, { key: 'new' }]);
    } finally { ctx.cleanup(); }
  });

  test('J2: after a failed Save a hub repaint keeps the edits and the failure status', async () => {
    const s = scripted([load(config(), F0)], [async () => json({ ok: false, error: 'boom' }, 500)]);
    const { ctx, r } = await mount(s.responder);
    try {
      typeInto(ctx.input(ctx.rows('programs')[0], 'name'), 'Core 2');
      await r.save();
      await r.render({ version: 'hub' });
      r.paint();
      assert.equal(ctx.input(ctx.rows('programs')[0], 'name').value, 'Core 2');
      assert.match(ctx.doc.querySelector('#cc-tax-status')!.textContent || '', /boom/);
    } finally { ctx.cleanup(); }
  });

  test('J3: navigating away and back (destroy, container swap, render) keeps the edits', async () => {
    const s = scripted([load(config(), F0)]);
    const { ctx, r } = await mount(s.responder);
    try {
      typeInto(ctx.input(ctx.rows('programs')[1], 'name'), 'Runtime 2');
      r.destroy();
      const fresh = ctx.doc.createElement('div');
      ctx.doc.body.appendChild(fresh);
      r.container = fresh;
      await r.render({ version: 'hub' });
      const row = [...fresh.querySelectorAll('.cc-tax-section[data-kind="programs"] .cc-tax-row')][1];
      assert.equal((row.querySelector('[data-field="name"]') as HTMLInputElement).value, 'Runtime 2');
      assert.equal(s.counts.get, 1, 'no refetch on return');
    } finally { ctx.cleanup(); }
  });

  test('J4: a successful Save clears dirty and starts a new generation; an untouched next Save posts the saved config', async () => {
    const s = scripted([load(config(), F0)]);
    const { ctx, r } = await mount(s.responder);
    try {
      typeInto(ctx.input(ctx.rows('programs')[0], 'name'), 'Core 2');
      assert.equal(ctx.doc.querySelector('.cc-tax')!.getAttribute('data-dirty'), 'true');
      const before = rowIds(ctx.doc);
      await r.save();
      assert.equal(ctx.doc.querySelector('.cc-tax')!.getAttribute('data-dirty'), null);
      const after = rowIds(ctx.doc);
      assert.equal(after.some((id) => before.includes(id)), false, 'no row id survives a rebuild');
      await r.save();
      assert.deepEqual(ctx.posts[1], { ...ctx.posts[0], fingerprint: F1 });
    } finally { ctx.cleanup(); }
  });

  test('J4b: directive-write-failed starts a new generation from the saved config and adopts its fingerprint', async () => {
    const s = scripted([load(config(), F0)], [async () => json({ ok: false, error: 'directive-write-failed', written: [], fingerprint: F2 }, 500)]);
    const { ctx, r } = await mount(s.responder);
    try {
      typeInto(ctx.input(ctx.rows('programs')[0], 'name'), 'Core 2');
      const before = rowIds(ctx.doc);
      await r.save();
      assert.equal(r.fingerprint, F2);
      assert.equal(ctx.doc.querySelector('.cc-tax')!.getAttribute('data-dirty'), null);
      assert.equal(rowIds(ctx.doc).some((id) => before.includes(id)), false);
      assert.equal(ctx.input(ctx.rows('programs')[0], 'name').value, 'Core 2');
    } finally { ctx.cleanup(); }
  });

  test('J5: a 409 is a persistent conflict; nothing reloads until Reload is clicked', async () => {
    const s = scripted([load(config(), F0), load(disk2(), F2)], [
      async () => json({ ok: false, error: 'changed-on-disk' }, 409),
      async () => json({ ok: false, error: 'changed-on-disk' }, 409),
    ]);
    const { ctx, r } = await mount(s.responder);
    try {
      typeInto(ctx.input(ctx.rows('programs')[0], 'name'), 'Mine');
      await r.save();
      assert.ok(ctx.doc.querySelector('.cc-tax-conflict'));
      await r.render({ version: 'hub' });
      r.paint();
      assert.ok(ctx.doc.querySelector('.cc-tax-conflict'), 'the conflict survives a repaint');
      assert.equal(ctx.input(ctx.rows('programs')[0], 'name').value, 'Mine');
      await r.save();
      assert.equal(s.counts.post, 2);
      assert.deepEqual(ctx.posts.map((p) => p.fingerprint), [F0, F0]);
      assert.equal(s.counts.get, 1, 'no silent reload');
      (ctx.doc.querySelector('[data-act="reload"]') as HTMLButtonElement).click();
      await r.idle();
      assert.equal(s.counts.get, 2);
      assert.equal(ctx.doc.querySelector('.cc-tax-conflict'), null);
      assert.equal(ctx.input(ctx.rows('programs')[0], 'name').value, 'Core (disk 2)');
      assert.equal(ctx.doc.querySelector('.cc-tax')!.getAttribute('data-dirty'), null);
    } finally { ctx.cleanup(); }
  });

  test('J6: a hub payload carrying manifest-like data never changes the draft or fetches', async () => {
    const s = scripted([load(config(), F0)]);
    const { ctx, r } = await mount(s.responder);
    try {
      typeInto(ctx.input(ctx.rows('programs')[0], 'name'), 'Mine');
      await r.render({ tracker: { programs: [{ key: 'x', name: 'From the manifest' }] }, config: disk2() });
      assert.equal(ctx.input(ctx.rows('programs')[0], 'name').value, 'Mine');
      assert.equal(s.counts.get, 1);
    } finally { ctx.cleanup(); }
  });

  test('J7 (pin): repaints never duplicate handlers or touch the shared container', async () => {
    const s = scripted([load(config(), F0)]);
    const { ctx, r } = await mount(s.responder);
    try {
      let added = 0;
      const container = r.container as HTMLElement;
      const orig = container.addEventListener.bind(container);
      container.addEventListener = ((...a: Parameters<HTMLElement['addEventListener']>) => { added += 1; return orig(...a); }) as HTMLElement['addEventListener'];
      for (let i = 0; i < 5; i += 1) r.paint();
      (ctx.doc.querySelector('[data-add="programs"]') as HTMLButtonElement).click();
      assert.equal(ctx.rows('programs').length, 3);
      (ctx.doc.querySelector('[data-act="save"]') as HTMLButtonElement).click();
      await r.idle();
      assert.equal(s.counts.post, 1);
      assert.equal(added, 0);
    } finally { ctx.cleanup(); }
  });

  test('J8: a foreign change applies while clean, is a conflict while dirty, and own echoes are ignored', async () => {
    // Foreign while clean: refetch once and apply as a new generation.
    let s = scripted([load(config(), F0), load(disk2(), F2)], [async () => json({ ok: true, written: [], drift: CLEAN, fingerprint: F1 })]);
    let m = await mount(s.responder);
    try {
      const before = rowIds(m.ctx.doc);
      m.r.onEvent(updated(F2));
      await m.r.idle();
      assert.equal(s.counts.get, 2);
      assert.equal(m.ctx.input(m.ctx.rows('programs')[0], 'name').value, 'Core (disk 2)');
      assert.equal(m.ctx.input(m.ctx.rows('verticals')[1], 'name').value, 'Runtime (disk 2)');
      assert.equal(rowIds(m.ctx.doc).some((id) => before.includes(id)), false, 'no old-generation row id');
      await m.r.save();
      assert.deepEqual({ ...m.ctx.posts[0], fingerprint: undefined }, { ...disk2(), fingerprint: undefined });
      assert.equal(m.ctx.posts[0].fingerprint, F2);
    } finally { m.ctx.cleanup(); }

    // Foreign while dirty: a conflict, no fetch, the draft unchanged.
    s = scripted([load(config(), F0)]);
    m = await mount(s.responder);
    try {
      typeInto(m.ctx.input(m.ctx.rows('programs')[0], 'name'), 'Mine');
      m.r.onEvent(updated(F2));
      await m.r.idle();
      assert.equal(s.counts.get, 1);
      assert.ok(m.ctx.doc.querySelector('.cc-tax-conflict'));
      assert.equal(m.ctx.input(m.ctx.rows('programs')[0], 'name').value, 'Mine');
    } finally { m.ctx.cleanup(); }

    // Pin: the own echo after the Save answer is ignored.
    s = scripted([load(config(), F0)], [async () => json({ ok: true, written: [], drift: CLEAN, fingerprint: F1 })]);
    m = await mount(s.responder);
    try {
      typeInto(m.ctx.input(m.ctx.rows('programs')[0], 'name'), 'Mine');
      await m.r.save();
      m.r.onEvent(updated(F1));
      await m.r.idle();
      assert.equal(s.counts.get, 1);
      assert.equal(m.ctx.doc.querySelector('.cc-tax-conflict'), null);
    } finally { m.ctx.cleanup(); }

    // Pin: the own echo that arrives while the Save is in flight is held, then ignored.
    const pending = deferred<FakeResponse>();
    s = scripted([load(config(), F0)], [() => pending.promise]);
    m = await mount(s.responder);
    try {
      typeInto(m.ctx.input(m.ctx.rows('programs')[0], 'name'), 'Mine');
      const saving = m.r.save();
      m.r.onEvent(updated(F1));
      pending.resolve(json({ ok: true, written: [], drift: CLEAN, fingerprint: F1 }));
      await saving;
      await m.r.idle();
      assert.equal(s.counts.get, 1);
      assert.equal(m.ctx.doc.querySelector('.cc-tax-conflict'), null);
    } finally { m.ctx.cleanup(); }

    // The same echo during an untouched (clean) Save: compared on arrival it would look
    // foreign and trigger a reload; held, it is recognised once the Save answers.
    const pendingClean = deferred<FakeResponse>();
    s = scripted([load(config(), F0)], [() => pendingClean.promise]);
    m = await mount(s.responder);
    try {
      const saving = m.r.save();
      m.r.onEvent(updated(F1));
      await Promise.resolve();
      pendingClean.resolve(json({ ok: true, written: [], drift: CLEAN, fingerprint: F1 }));
      await saving;
      await m.r.idle();
      assert.equal(s.counts.get, 1, 'the in-flight echo did not trigger a reload');
      assert.equal(m.r.fingerprint, F1);
    } finally { m.ctx.cleanup(); }

    // After a failed Save, a foreign event held during it is a conflict.
    const failing = deferred<FakeResponse>();
    s = scripted([load(config(), F0)], [() => failing.promise]);
    m = await mount(s.responder);
    try {
      typeInto(m.ctx.input(m.ctx.rows('programs')[0], 'name'), 'Mine');
      const saving = m.r.save();
      m.r.onEvent(updated(F2));
      failing.resolve(json({ ok: false, error: 'boom' }, 500));
      await saving;
      await m.r.idle();
      assert.ok(m.ctx.doc.querySelector('.cc-tax-conflict'));
      assert.equal(m.ctx.input(m.ctx.rows('programs')[0], 'name').value, 'Mine');
    } finally { m.ctx.cleanup(); }
  });

  test('J9: one first load; a refetch that resolves after typing is not applied; own fingerprint is no conflict', async () => {
    const first = deferred<FakeResponse>();
    let s = scripted([() => first.promise]);
    const ctx = setupDom(s.responder);
    try {
      const r = new TrackerTaxonomyRenderer('workspace');
      const a = r.render();
      const b = r.render();
      first.resolve(json({ config: config(), source: 'config', fingerprint: F0, drift: CLEAN }));
      await Promise.all([a, b]);
      assert.equal(s.counts.get, 1, 'single-flight first load');
    } finally { ctx.cleanup(); }

    const refetch = deferred<FakeResponse>();
    s = scripted([load(config(), F0), () => refetch.promise, load(disk2(), F2)]);
    let m = await mount(s.responder);
    try {
      m.r.onEvent(updated(F2));
      typeInto(m.ctx.input(m.ctx.rows('programs')[0], 'name'), 'Typed meanwhile');
      refetch.resolve(json({ config: disk2(), source: 'config', fingerprint: F2, drift: CLEAN }));
      await m.r.idle();
      assert.equal(m.ctx.input(m.ctx.rows('programs')[0], 'name').value, 'Typed meanwhile', 'not applied over the edit');
      assert.ok(m.ctx.doc.querySelector('.cc-tax-conflict'));
      (m.ctx.doc.querySelector('[data-act="reload"]') as HTMLButtonElement).click();
      await m.r.idle();
      assert.equal(m.ctx.input(m.ctx.rows('programs')[0], 'name').value, 'Core (disk 2)');
    } finally { m.ctx.cleanup(); }

    s = scripted([load(config(), F0)]);
    m = await mount(s.responder);
    try {
      m.r.onEvent(updated(F2));
      await m.r.idle();
      assert.equal(s.counts.get, 2, 'refetched');
      assert.equal(m.ctx.doc.querySelector('.cc-tax-conflict'), null, 'the disk still has this editor\'s fingerprint');
    } finally { m.ctx.cleanup(); }
  });

  test('J10: inputs are disabled while a Save is in flight; a hung Save times out to "outcome unknown"', async () => {
    const pending = deferred<FakeResponse>();
    let s = scripted([load(config(), F0)], [() => pending.promise]);
    let m = await mount(s.responder);
    try {
      typeInto(m.ctx.input(m.ctx.rows('programs')[0], 'name'), 'Mine');
      const saving = m.r.save();
      await m.r.render({ version: 'hub' });
      const controls = [...m.ctx.doc.querySelectorAll('.cc-tax input, .cc-tax button')] as Array<HTMLInputElement | HTMLButtonElement>;
      assert.ok(controls.length > 0 && controls.every((c) => c.disabled), 'every control is disabled during the Save');
      pending.resolve(json({ ok: true, written: [], drift: CLEAN, fingerprint: F1 }));
      await saving;
      const after = [...m.ctx.doc.querySelectorAll('.cc-tax input, .cc-tax button')] as Array<HTMLInputElement | HTMLButtonElement>;
      assert.ok(after.every((c) => !c.disabled));
    } finally { m.ctx.cleanup(); }

    s = scripted([load(config(), F0)], [() => new Promise<FakeResponse>(() => { /* never answers */ })]);
    m = await mount(s.responder);
    try {
      m.r.saveTimeoutMs = 30;
      typeInto(m.ctx.input(m.ctx.rows('programs')[0], 'name'), 'Mine');
      await m.r.save();
      assert.match(m.ctx.doc.querySelector('#cc-tax-status')!.textContent || '', /outcome unknown/i);
      assert.equal(m.r.fingerprint, F0, 'the old fingerprint is kept');
      assert.equal(m.ctx.input(m.ctx.rows('programs')[0], 'name').value, 'Mine');
      assert.equal(m.ctx.input(m.ctx.rows('programs')[0], 'name').disabled, false, 're-enabled');
    } finally { m.ctx.cleanup(); }
  });

  test('J13: an edit the operator reverts (text and cross-cutting) is not dirty and is not posted', async () => {
    const s = scripted([load(config(), F0)]);
    const { ctx, r } = await mount(s.responder);
    try {
      const name = ctx.input(ctx.rows('programs')[0], 'name');
      typeInto(name, 'Corex');
      typeInto(name, 'Core');
      const xc = ctx.rows('verticals')[1].querySelector('[data-field="crossCutting"]') as HTMLInputElement;
      xc.checked = true;
      xc.dispatchEvent(new (xc.ownerDocument.defaultView as unknown as typeof globalThis).Event('input', { bubbles: true }));
      xc.checked = false;
      xc.dispatchEvent(new (xc.ownerDocument.defaultView as unknown as typeof globalThis).Event('input', { bubbles: true }));
      r.paint();
      assert.equal(ctx.doc.querySelector('.cc-tax')!.getAttribute('data-dirty'), null, 'reverted edits are not dirty');
      await r.save();
      const { fingerprint, ...posted } = ctx.posts[0];
      assert.equal(fingerprint, F0);
      assert.deepEqual(posted, config(), 'the loaded rows are posted unchanged');
    } finally { ctx.cleanup(); }
  });

  test('J12: Reload discards edits typed after the conflict appeared; no older generation is read back', async () => {
    const s = scripted([load(config(), F0), load(disk2(), F2)], [async () => json({ ok: false, error: 'changed-on-disk' }, 409)]);
    const { ctx, r } = await mount(s.responder);
    try {
      typeInto(ctx.input(ctx.rows('programs')[0], 'name'), 'Mine');
      await r.save();
      typeInto(ctx.input(ctx.rows('programs')[0], 'name'), 'Typed after the conflict');
      typeInto(ctx.input(ctx.rows('verticals')[0], 'name'), 'Also typed');
      (ctx.doc.querySelector('[data-act="reload"]') as HTMLButtonElement).click();
      await r.idle();
      assert.equal(ctx.input(ctx.rows('programs')[0], 'name').value, 'Core (disk 2)');
      assert.equal(ctx.input(ctx.rows('verticals')[0], 'name').value, 'Core');
      await r.save();
      assert.deepEqual({ ...ctx.posts[1], fingerprint: undefined }, { ...disk2(), fingerprint: undefined });
    } finally { ctx.cleanup(); }
  });

  test('J11: typing survives a hub payload with focus and caret kept; a forced repaint restores them', async () => {
    const s = scripted([load(config(), F0)]);
    const { ctx, r } = await mount(s.responder);
    try {
      const input = ctx.input(ctx.rows('programs')[0], 'name');
      input.focus();
      typeInto(input, 'Corx');
      input.setSelectionRange(2, 2);
      await r.render({ version: 'hub' });
      assert.equal(ctx.doc.activeElement, input, 'a hub payload does not replace the focused field');
      assert.equal(input.selectionStart, 2);
      r.paint();
      const now = ctx.doc.activeElement as HTMLInputElement;
      assert.equal(now.getAttribute('data-field'), 'name');
      assert.equal(now.value, 'Corx');
      assert.equal(now.selectionStart, 2, 'caret restored after a forced repaint');
    } finally { ctx.cleanup(); }
  });
});
