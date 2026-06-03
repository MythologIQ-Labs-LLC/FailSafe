// Structural (jsdom) tests for McpCatalogRenderer (B-INT-13/14 UI).
// NOTE: jsdom verifies STRUCTURE only — the visual surface still requires Chrome
// verification per feedback_design_reference_required (not run here).

import { strict as assert } from 'assert';
import { JSDOM } from 'jsdom';
// @ts-expect-error untyped JS module
import { McpCatalogRenderer } from '../../../src/roadmap/ui/modules/mcp-catalog-renderer.js';

const CATALOG = {
  entries: [
    { id: 'context7', name: 'Context7', description: 'docs', install: { command: 'npx', args: ['-y', '@upstash/context7-mcp'] }, risk: { level: 'low', score: 1, signals: [] } },
    { id: 'mermaid', name: 'Mermaid Chart', description: 'diagrams', install: { command: 'npx', args: ['-y', 'mcp-mermaid'] }, risk: { level: 'low', score: 1, signals: [] } },
  ],
};

interface G { window?: unknown; document?: unknown; fetch?: unknown }
function setupDom(fetchImpl: (url: string, init?: unknown) => Promise<unknown>): { cleanup: () => void; doc: Document } {
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body><div id="integrations"></div></body></html>', { url: 'http://localhost:9999' });
  const g = global as unknown as G;
  const prev = { window: g.window, document: g.document, fetch: g.fetch };
  g.window = dom.window;
  g.document = dom.window.document;
  g.fetch = fetchImpl;
  return {
    doc: dom.window.document as unknown as Document,
    cleanup: () => { g.window = prev.window; g.document = prev.document; g.fetch = prev.fetch; },
  };
}

suite('McpCatalogRenderer (B-INT-13/14, jsdom structural)', () => {
  test('renders a card per catalog entry with risk badge + install button + command', async () => {
    const ctx = setupDom(async () => ({ ok: true, json: async () => CATALOG }));
    try {
      await new McpCatalogRenderer('integrations').render();
      const cards = ctx.doc.querySelectorAll('.cc-mcp-card');
      assert.equal(cards.length, 2);
      assert.equal(ctx.doc.querySelectorAll('.cc-mcp-install').length, 2);
      assert.equal(ctx.doc.querySelectorAll('.cc-mcp-risk-low').length, 2);
      assert.ok(ctx.doc.body.innerHTML.includes('@upstash/context7-mcp'));
      assert.ok(ctx.doc.body.innerHTML.includes('mcp-mermaid'));
      assert.ok(ctx.doc.getElementById('cc-mcp-style'), 'scoped style injected once');
    } finally { ctx.cleanup(); }
  });

  test('install button is confirm-then-POST (no silent install)', async () => {
    const calls: string[] = [];
    const ctx = setupDom(async (url: string) => {
      calls.push(url);
      if (url === '/api/v1/mcp/catalog') return { ok: true, json: async () => CATALOG };
      return { ok: true, json: async () => ({ ok: true, added: true }) };
    });
    try {
      await new McpCatalogRenderer('integrations').render();
      const btn = ctx.doc.querySelector('.cc-mcp-install') as HTMLButtonElement;
      // first click → confirm state, NO POST
      btn.click();
      assert.equal(btn.textContent, 'Confirm install');
      assert.equal(btn.dataset.confirm, '1');
      assert.ok(!calls.includes('/api/actions/mcp-install'), 'no POST on first click');
      // second click → POST install
      btn.click();
      await new Promise((r) => setTimeout(r, 0));
      assert.ok(calls.includes('/api/actions/mcp-install'), 'POST on confirm click');
    } finally { ctx.cleanup(); }
  });

  test('catalog fetch failure renders a non-empty error state (no throw)', async () => {
    const ctx = setupDom(async () => { throw new Error('network down'); });
    try {
      await new McpCatalogRenderer('integrations').render();
      assert.ok(ctx.doc.querySelector('.cc-mcp'));
      assert.ok(/Could not load catalog/.test(ctx.doc.body.innerHTML));
    } finally { ctx.cleanup(); }
  });
});
