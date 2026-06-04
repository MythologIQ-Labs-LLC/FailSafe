// Structural (jsdom) tests for OpenDesignRenderer live-state probe (GH #166).
// Verifies the formerly hard-coded "disconnected/idle" strings are now driven by
// /api/integrations/open-design/status.

import { strict as assert } from 'assert';
import { JSDOM } from 'jsdom';
// @ts-expect-error untyped JS module
import { OpenDesignRenderer } from '../../../src/roadmap/ui/modules/open-design-renderer.js';

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

const flush = () => new Promise((r) => setTimeout(r, 0));

suite('OpenDesignRenderer live-state (GH #166, jsdom structural)', () => {
  test('renders the static shell synchronously (no hard-coded "disconnected" literal in markup)', async () => {
    const ctx = setupDom(async () => ({ ok: true, json: async () => ({ ok: true, connected: false, capabilities: [] }) }));
    try {
      const r = new OpenDesignRenderer('integrations');
      r.render();
      // Status block exists and is the live-driven container.
      assert.ok(ctx.doc.querySelector('.cc-od-status-block'), 'live status block present');
    } finally { ctx.cleanup(); }
  });

  test('probes the status endpoint and shows "connected" when the client is connected', async () => {
    const urls: string[] = [];
    const ctx = setupDom(async (url: string) => {
      urls.push(url);
      return { ok: true, json: async () => ({ ok: true, connected: true, capabilities: ['read'] }) };
    });
    try {
      new OpenDesignRenderer('integrations').render();
      await flush();
      assert.ok(urls.includes('/api/integrations/open-design/status'), 'status endpoint probed');
      const block = ctx.doc.querySelector('.cc-od-status-block')!;
      assert.ok(/MCP client:.*connected/s.test(block.innerHTML), 'live connected state');
      assert.ok(/Daemon:.*reachable/s.test(block.innerHTML), 'daemon reachable when connected');
      assert.ok(/SSE attach:.*attached/s.test(block.innerHTML), 'SSE attached when connected');
    } finally { ctx.cleanup(); }
  });

  test('shows "disconnected" when the probe reports not connected', async () => {
    const ctx = setupDom(async () => ({ ok: true, json: async () => ({ ok: true, connected: false, capabilities: [] }) }));
    try {
      new OpenDesignRenderer('integrations').render();
      await flush();
      const block = ctx.doc.querySelector('.cc-od-status-block')!;
      assert.ok(/MCP client:.*disconnected/s.test(block.innerHTML), 'live disconnected state');
    } finally { ctx.cleanup(); }
  });

  test('a failed probe degrades to disconnected without throwing', async () => {
    const ctx = setupDom(async () => { throw new Error('network down'); });
    try {
      new OpenDesignRenderer('integrations').render();
      await flush();
      const block = ctx.doc.querySelector('.cc-od-status-block')!;
      assert.ok(/disconnected/s.test(block.innerHTML), 'degrades to disconnected');
    } finally { ctx.cleanup(); }
  });
});
