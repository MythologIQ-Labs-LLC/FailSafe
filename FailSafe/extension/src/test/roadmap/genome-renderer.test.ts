// Functional tests for the Shadow Genome UI renderer (FX169 + FX408 view filter).
// Uses jsdom + a fetch stub to drive `GenomeRenderer.render()` and inspect the
// resulting DOM. Sink: real container.innerHTML reads.

import { strict as assert } from 'assert';
import { JSDOM } from 'jsdom';
// @ts-expect-error JS module import in TS test context
import { GenomeRenderer } from '../../../src/roadmap/ui/modules/genome.js';

interface FakeFetchResponse {
  ok: boolean;
  json: () => Promise<unknown>;
}

function setupDom(): { dom: JSDOM; container: Element } {
  const dom = new JSDOM('<!DOCTYPE html><div id="genome-container"></div>');
  (global as { window?: unknown }).window = dom.window as unknown;
  (global as { document?: unknown }).document = dom.window.document;
  const container = dom.window.document.getElementById('genome-container');
  if (!container) throw new Error('Failed to mount genome container');
  return { dom, container };
}

function makeFetchStub(response: unknown, ok = true): () => Promise<FakeFetchResponse> {
  return async () => ({ ok, json: async () => response });
}

function teardownDom(): void {
  (global as { window?: unknown }).window = undefined;
  (global as { document?: unknown }).document = undefined;
  (global as { fetch?: unknown }).fetch = undefined;
}

suite('GenomeRenderer (FX169, FX408)', () => {
  setup(() => { setupDom(); });
  teardown(() => { teardownDom(); });

  test('FX169 render() — empty patterns + empty unresolved show "No failure patterns" empty state', async () => {
    (global as { fetch?: unknown }).fetch = makeFetchStub({ patterns: [], allPatterns: [], unresolved: [] });
    const renderer = new GenomeRenderer('genome-container');
    await renderer.render();
    const html = (global as { document?: { getElementById: (id: string) => Element } }).document!.getElementById('genome-container')!.innerHTML;
    assert.match(html, /No failure patterns/);
    assert.match(html, /No unresolved failure patterns/);
  });

  test('FX169 render() — populated patterns produce one card per pattern (capped at 12)', async () => {
    const patterns = Array.from({ length: 15 }, (_, i) => ({
      failureMode: i % 5 === 0 ? 'COMPLEXITY_VIOLATION' : 'GHOST_PATH',
      count: i + 1,
      component: `module-${i}`,
    }));
    (global as { fetch?: unknown }).fetch = makeFetchStub({
      patterns, allPatterns: patterns, unresolved: [],
    });
    const renderer = new GenomeRenderer('genome-container');
    await renderer.render();
    const html = (global as { document?: { getElementById: (id: string) => Element } }).document!.getElementById('genome-container')!.innerHTML;
    // Count cards via class marker
    const cardCount = (html.match(/class="cc-card"/g) || []).length;
    // 12 pattern cards (capped) + 1 unresolved-empty card = 13
    assert.equal(cardCount, 13, `Expected 12 pattern cards + 1 unresolved card; got ${cardCount}`);
  });

  test('FX169 render() — pattern card uses mode-specific accent color', async () => {
    (global as { fetch?: unknown }).fetch = makeFetchStub({
      patterns: [
        { failureMode: 'SECURITY_STUB', count: 5, component: 'auth' },
      ],
      allPatterns: [], unresolved: [],
    });
    const renderer = new GenomeRenderer('genome-container');
    await renderer.render();
    const html = (global as { document?: { getElementById: (id: string) => Element } }).document!.getElementById('genome-container')!.innerHTML;
    // SECURITY_STUB maps to var(--accent-red)
    assert.match(html, /var\(--accent-red\)/);
    assert.match(html, /SECURITY_STUB/);
    assert.match(html, /auth/);
  });

  test('FX169 render() — unresolved entries render as rows with truncated id + status badge', async () => {
    (global as { fetch?: unknown }).fetch = makeFetchStub({
      patterns: [],
      allPatterns: [],
      unresolved: [
        { id: 'sg-001-aaaaaaaaaaaa', failureMode: 'HALLUCINATION', remediationStatus: 'unresolved' },
        { id: 'sg-002-bbbbbbbbbbbb', failureMode: 'GHOST_PATH', remediationStatus: 'investigating' },
      ],
    });
    const renderer = new GenomeRenderer('genome-container');
    await renderer.render();
    const html = (global as { document?: { getElementById: (id: string) => Element } }).document!.getElementById('genome-container')!.innerHTML;
    assert.match(html, /HALLUCINATION/);
    assert.match(html, /GHOST_PATH/);
    assert.match(html, /unresolved/);
    assert.match(html, /investigating/);
    // ID truncated to 8 chars
    assert.match(html, /sg-001-a/);
    assert.equal(html.includes('sg-001-aaaaaaaaaaaa'), false, 'full ID should be truncated to 8 chars');
  });

  test('FX408 toggle button — initial state shows "Show All Patterns"', async () => {
    (global as { fetch?: unknown }).fetch = makeFetchStub({ patterns: [], allPatterns: [], unresolved: [] });
    const renderer = new GenomeRenderer('genome-container');
    await renderer.render();
    const html = (global as { document?: { getElementById: (id: string) => Element } }).document!.getElementById('genome-container')!.innerHTML;
    assert.match(html, /Show All Patterns/);
  });

  test('FX408 toggle button — click flips showAll and changes label to "Show Unresolved Only"', async () => {
    (global as { fetch?: unknown }).fetch = makeFetchStub({ patterns: [], allPatterns: [], unresolved: [] });
    const renderer = new GenomeRenderer('genome-container');
    await renderer.render();
    const doc = (global as { document?: Document }).document!;
    const toggle = doc.getElementById('genome-container')!.querySelector('.cc-genome-toggle') as HTMLElement;
    assert.ok(toggle, 'toggle button should be in DOM');
    toggle.click();
    // re-render is async; wait one tick
    await new Promise((r) => setTimeout(r, 50));
    const html = doc.getElementById('genome-container')!.innerHTML;
    assert.match(html, /Show Unresolved Only/);
  });

  test('FX408 showAll=true shows allPatterns instead of patterns', async () => {
    (global as { fetch?: unknown }).fetch = makeFetchStub({
      patterns: [{ failureMode: 'UNRESOLVED_ONLY', count: 1, component: 'a' }],
      allPatterns: [
        { failureMode: 'UNRESOLVED_ONLY', count: 1, component: 'a', remediationStatus: 'UNRESOLVED' },
        { failureMode: 'RESOLVED_TOO', count: 2, component: 'b', remediationStatus: 'RESOLVED' },
      ],
      unresolved: [],
    });
    const renderer = new GenomeRenderer('genome-container');
    await renderer.render();
    const doc = (global as { document?: Document }).document!;
    const html1 = doc.getElementById('genome-container')!.innerHTML;
    assert.match(html1, /UNRESOLVED_ONLY/);
    assert.equal(html1.includes('RESOLVED_TOO'), false, 'unresolved-only view should not include RESOLVED entries');

    // Toggle to showAll
    const toggle = doc.getElementById('genome-container')!.querySelector('.cc-genome-toggle') as HTMLElement;
    toggle.click();
    await new Promise((r) => setTimeout(r, 50));
    const html2 = doc.getElementById('genome-container')!.innerHTML;
    assert.match(html2, /RESOLVED_TOO/);
  });

  test('FX169 render() — fetch error is non-fatal; renders empty state', async () => {
    (global as { fetch?: unknown }).fetch = async () => { throw new Error('network down'); };
    const renderer = new GenomeRenderer('genome-container');
    await assert.doesNotReject(() => renderer.render());
    const html = (global as { document?: { getElementById: (id: string) => Element } }).document!.getElementById('genome-container')!.innerHTML;
    // Empty state still renders
    assert.match(html, /No failure patterns/);
  });

  test('FX169 destroy() — clears the container innerHTML', async () => {
    (global as { fetch?: unknown }).fetch = makeFetchStub({ patterns: [], allPatterns: [], unresolved: [] });
    const renderer = new GenomeRenderer('genome-container');
    await renderer.render();
    renderer.destroy();
    const html = (global as { document?: { getElementById: (id: string) => Element } }).document!.getElementById('genome-container')!.innerHTML;
    assert.equal(html, '', 'destroy should clear container');
  });

  test('FX169 onEvent() — re-renders when genome.failureArchived event arrives', async () => {
    let fetchCount = 0;
    (global as { fetch?: unknown }).fetch = async () => {
      fetchCount += 1;
      return { ok: true, json: async () => ({ patterns: [], allPatterns: [], unresolved: [] }) };
    };
    const renderer = new GenomeRenderer('genome-container');
    await renderer.render();
    const beforeCount = fetchCount;
    renderer.onEvent({ type: 'genome.failureArchived' });
    await new Promise((r) => setTimeout(r, 50));
    assert.ok(fetchCount > beforeCount, 'onEvent should trigger another fetch');
  });

  test('FX169 onEvent() — ignores unrelated event types', async () => {
    let fetchCount = 0;
    (global as { fetch?: unknown }).fetch = async () => {
      fetchCount += 1;
      return { ok: true, json: async () => ({ patterns: [], allPatterns: [], unresolved: [] }) };
    };
    const renderer = new GenomeRenderer('genome-container');
    await renderer.render();
    const beforeCount = fetchCount;
    renderer.onEvent({ type: 'something.else' });
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(fetchCount, beforeCount, 'unrelated events should not trigger re-render');
  });
});
