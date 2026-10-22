// Lane E (plan-e-console-ui-xss) rows X24-X26, X29-X32: Shadow Genome graph,
// LLM status, voice settings, the Genome unresolved table, the hash-route tab
// selector (S21), the shared escape table and the http(s) URL allowlist.

import { strict as assert } from 'assert';
// @ts-expect-error JS module import in TS test context
import { renderGenomeMode } from '../../roadmap/ui/modules/shadow-genome-graph.js';
// @ts-expect-error JS module import in TS test context
import { LlmStatusRenderer } from '../../roadmap/ui/modules/llm-status.js';
// @ts-expect-error JS module import in TS test context
import { renderVoiceSettings } from '../../roadmap/ui/modules/voice-settings.js';
// @ts-expect-error JS module import in TS test context
import { GenomeRenderer } from '../../roadmap/ui/modules/genome.js';
// @ts-expect-error JS module import in TS test context
import * as deeplink from '../../roadmap/ui/modules/command-center-deeplink.js';
// @ts-expect-error JS module import in TS test context
import * as skillUtils from '../../roadmap/ui/modules/skill-utils.js';
// @ts-expect-error JS module import in TS test context
import { escapeHtml } from '../../roadmap/ui/modules/brainstorm-templates.js';
import { escapeHtml as serverEscapeHtml } from '../../shared/utils/htmlSanitizer';
import { TAG, DQ, JSURL, assertInert, installDom, settle } from './xssProbe';

suite('Lane E XSS: Shadow Genome graph, LLM status, voice settings, Genome (X24-X26, X29)', () => {
  let restore: () => void;
  let doc: Document;
  setup(() => {
    const env = installDom('<div id="g"></div><div class="cc-bs-llm-indicator"></div>');
    restore = env.restore;
    doc = env.dom.window.document;
  });
  teardown(() => restore());

  test('X24 graph node: hostile ledger title, id and type round-trip through aria-label and data-node (S17)', () => {
    const root = doc.getElementById('g')!;
    root.innerHTML = renderGenomeMode(
      { graph: { nodes: [{ id: DQ, type: 'governance', label: DQ }, { id: 'f1', type: DQ, label: 'x' }], edges: [] }, incidents: [] },
      { view: 'graph', zoom: 1, selectedId: null },
    );
    assertInert(root);
    const nodes = root.querySelectorAll('g.sg-node');
    assert.equal(nodes.length, 2);
    assert.equal(nodes[0].getAttribute('data-node'), DQ);
    assert.equal(nodes[0].getAttribute('aria-label'), `governance: ${DQ}`);
    assert.equal(nodes[1].getAttribute('aria-label'), `${DQ}: x`);
  });

  test('X25 LLM tier list: an unknown priority id from localStorage stays text (S19)', () => {
    const store = { getLlmPriority: () => [TAG, 'server'], setLlmPriority: () => undefined };
    const r = new LlmStatusRenderer({ isNativeAiAvailable: false, pipeline: null, loadingStatus: 'idle' }, store, () => undefined);
    r.render(null);
    const root = doc.querySelector('.cc-bs-llm-indicator')!;
    assertInert(root, { allowOn: ['onclick'] });
    assert.ok(root.textContent!.includes(TAG));
  });

  test('X26 push-to-talk key from localStorage stays text (S20)', () => {
    const root = doc.getElementById('g')!;
    const store = { get: (k: string) => (k === 'ptt-key' ? TAG : undefined), set: () => undefined };
    root.innerHTML = renderVoiceSettings(store);
    assertInert(root);
    assert.equal(root.querySelector('.cc-settings-ptt-display')!.textContent, TAG);
  });

  test('X29 Genome unresolved table renders a numeric entry id (genome.js:98, fold 12)', async () => {
    (globalThis as Record<string, unknown>).fetch = async () => ({
      ok: true,
      json: async () => ({ patterns: [], allPatterns: [], unresolved: [{ id: 123456789, failureMode: 'SPEC_DRIFT', remediationStatus: 'unresolved' }] }),
    });
    const r = new GenomeRenderer('g');
    await r.render();
    await settle();
    assert.ok(doc.getElementById('g')!.textContent!.includes('12345678'), 'the first 8 characters of the id render');
  });
});

suite('Lane E XSS: hash-route tab selector (X30, S21)', () => {
  let restore: () => void;
  let doc: Document;
  setup(() => {
    const env = installDom('<button class="tab-btn" data-target="governance"></button>');
    restore = env.restore;
    doc = env.dom.window.document;
  });
  teardown(() => restore());

  for (const tab of ['"]', '\\', 'a"b', 'governance']) {
    test(`X30 tabButtonSelector(${JSON.stringify(tab)}) is a valid selector that matches only that tab`, () => {
      assert.equal(typeof deeplink.tabButtonSelector, 'function', 'tabButtonSelector is exported');
      const btn = doc.createElement('button');
      btn.className = 'tab-btn';
      btn.setAttribute('data-target', tab);
      doc.body.appendChild(btn);
      const found = doc.querySelector(deeplink.tabButtonSelector(tab));
      assert.equal(found, tab === 'governance' ? doc.querySelector('.tab-btn') : btn);
    });
  }
});

suite('Lane E XSS: shared escape table and URL allowlist (X31, X32)', () => {
  const table: Array<[string, string]> = [['&', '&amp;'], ['<', '&lt;'], ['>', '&gt;'], ['"', '&quot;']];

  test('X31 the client escapeHtml maps & < > " \' (brainstorm-templates.js:4)', () => {
    for (const [raw, enc] of table) assert.equal(escapeHtml(raw), enc);
    assert.equal(escapeHtml("'"), '&#39;');
  });

  test('X31 the server escapeHtml maps & < > " \' (htmlSanitizer.ts:6)', () => {
    for (const [raw, enc] of table) assert.equal(serverEscapeHtml(raw), enc);
    assert.equal(serverEscapeHtml("'"), '&#039;');
  });

  test('X31 every module-local escape helper output is quote-safe (skill-utils escHtml)', () => {
    const { restore } = installDom();
    try {
      assert.equal(skillUtils.escHtml(`a"b'c<d>&`), 'a&quot;b&#39;c&lt;d&gt;&amp;');
      assert.equal(skillUtils.escHtml(null), '');
      assert.equal(skillUtils.escHtml(undefined), '');
    } finally { restore(); }
  });

  const refused = [
    JSURL, 'JaVaScRiPt:window.x=1', ' \x01javascript:window.x=1', 'java\tscript:window.x=1',
    'java\nscript:window.x=1', 'data:text/html,<script>window.x=1</script>', 'vbscript:msgbox(1)', '',
  ];
  const allowed = ['https://github.com/a/b', 'http://example.com/x', '/relative/path', 'relative', '#anchor'];

  for (const url of refused) {
    test(`X32 safeHttpUrl refuses ${JSON.stringify(url)}`, () => {
      assert.equal(typeof skillUtils.safeHttpUrl, 'function', 'safeHttpUrl is exported');
      assert.equal(skillUtils.safeHttpUrl(url), '');
    });
  }
  for (const url of allowed) {
    test(`X32 safeHttpUrl allows ${JSON.stringify(url)}`, () => {
      assert.equal(typeof skillUtils.safeHttpUrl, 'function', 'safeHttpUrl is exported');
      assert.equal(skillUtils.safeHttpUrl(url), url);
    });
  }
  test('X32 safeHttpUrl refuses non-strings', () => {
    assert.equal(typeof skillUtils.safeHttpUrl, 'function', 'safeHttpUrl is exported');
    for (const v of [null, undefined, 42, {}]) assert.equal(skillUtils.safeHttpUrl(v), '');
  });
});
