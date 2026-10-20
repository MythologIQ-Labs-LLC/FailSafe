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
