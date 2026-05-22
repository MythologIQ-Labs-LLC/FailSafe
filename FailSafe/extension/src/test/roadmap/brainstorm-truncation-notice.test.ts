// jsdom UI test for the B132 brainstorm truncation notice (FX585.4).
// Drives BrainstormGraph.addNode against a stubbed fetch and asserts the
// concrete `.bs-truncation-notice` element is (or is not) inserted near
// the graph toolbar depending on the response `labelTruncated` flag.

import { strict as assert } from 'assert';
import { JSDOM } from 'jsdom';
// @ts-expect-error JS module import in TS test context
import { BrainstormGraph } from '../../../src/roadmap/ui/modules/brainstorm-graph.js';

interface DomHandle { dom: JSDOM; restore: () => void; }

function installDom(): DomHandle {
  // The notice anchors to `.cc-bs-toolbar`; provide it inside a host parent
  // exactly as renderShell() lays it out.
  const dom = new JSDOM(
    '<!DOCTYPE html><div id="workspace"><div class="cc-bs-toolbar"></div></div>',
  );
  const g = globalThis as Record<string, unknown>;
  const prevDoc = g.document;
  const prevWin = g.window;
  g.document = dom.window.document;
  g.window = dom.window;
  return {
    dom,
    restore: () => { g.document = prevDoc; g.window = prevWin; },
  };
}

function installFetch(body: unknown): () => void {
  const g = globalThis as { fetch?: unknown };
  const original = g.fetch;
  g.fetch = async () => ({ ok: true, status: 200, json: async () => body });
  return () => { g.fetch = original; };
}

function makeStore(): { get: (k: string) => unknown; set: (k: string, v: unknown) => void } {
  const data = new Map<string, unknown>();
  return { get: (k) => data.get(k), set: (k, v) => { data.set(k, v); } };
}

suite('Brainstorm truncation notice (B132, FX585.4)', () => {
  let domHandle: DomHandle;
  let fetchRestore: () => void = () => undefined;

  setup(() => { domHandle = installDom(); });
  teardown(() => { fetchRestore(); domHandle.restore(); });

  test('FX585.4 addNode — labelTruncated:true response renders .bs-truncation-notice', async () => {
    fetchRestore = installFetch({
      id: 'n1', label: 'x'.repeat(200), type: 'Feature',
      labelTruncated: true, labelOriginalLength: 250,
    });
    const graph = new BrainstormGraph({ store: makeStore() });
    await graph.addNode('x'.repeat(250), 'Feature');

    const notice = domHandle.dom.window.document.querySelector('.bs-truncation-notice');
    assert.ok(notice, '.bs-truncation-notice must be inserted when labelTruncated is true');
    assert.match(
      String(notice?.textContent),
      /Label shortened to 200 characters\./,
      'notice carries the user-facing truncation message',
    );
    // Inserted adjacent to the toolbar (visible affordance near the toolbar).
    const toolbar = domHandle.dom.window.document.querySelector('.cc-bs-toolbar');
    assert.equal(
      toolbar?.nextElementSibling,
      notice,
      'notice is inserted directly after the graph toolbar',
    );
  });

  test('FX585.4 addNode — response without labelTruncated renders NO notice', async () => {
    fetchRestore = installFetch({ id: 'n2', label: 'short', type: 'Feature' });
    const graph = new BrainstormGraph({ store: makeStore() });
    await graph.addNode('short', 'Feature');

    const notice = domHandle.dom.window.document.querySelector('.bs-truncation-notice');
    assert.equal(notice, null, 'no notice when the response is not flagged truncated');
  });

  test('FX585.4 notice is dismissible — clicking the dismiss button removes it', async () => {
    fetchRestore = installFetch({
      id: 'n3', label: 'x'.repeat(200), type: 'Feature',
      labelTruncated: true, labelOriginalLength: 300,
    });
    const graph = new BrainstormGraph({ store: makeStore() });
    await graph.addNode('x'.repeat(300), 'Feature');

    const doc = domHandle.dom.window.document;
    const dismiss = doc.querySelector('.bs-truncation-notice-dismiss') as HTMLElement | null;
    assert.ok(dismiss, 'dismiss control is present (non-blocking, user-clearable)');
    dismiss?.click();
    assert.equal(
      doc.querySelector('.bs-truncation-notice'),
      null,
      'notice removed after dismiss click',
    );
  });
});
