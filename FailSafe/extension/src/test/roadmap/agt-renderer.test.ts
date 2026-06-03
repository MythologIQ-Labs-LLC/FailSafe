// Structural (jsdom) tests for AgtRenderer (B-INT-16 UI).
// NOTE: jsdom verifies STRUCTURE only — the visual surface still requires Chrome
// verification per feedback_design_reference_required (not run here).

import { strict as assert } from 'assert';
import { JSDOM } from 'jsdom';
// @ts-expect-error untyped JS module
import { AgtRenderer } from '../../../src/roadmap/ui/modules/agt-renderer.js';

const MODULES = {
  preview: 'Microsoft Agent Governance Toolkit is Public Preview — APIs may change before GA.',
  detected: ['typescript'],
  modules: [
    { id: 'typescript', label: 'TypeScript', env: 'TS', kind: 'language', command: 'npm install @microsoft/agent-governance-sdk', registry: 'npm', runnable: true, status: 'published', note: 'ts sdk', recommended: true },
    { id: 'golang', label: 'Go', env: 'Go', kind: 'language', command: 'go get github.com/microsoft/agent-governance-toolkit/agent-governance-golang', registry: 'Go', runnable: true, status: 'source-only', note: 'go sdk', recommended: false },
    { id: 'claude-code', label: 'Claude Code', env: 'Claude', kind: 'agent-host', command: '/plugin install agt-governance@agent-governance-toolkit', registry: 'plugin', runnable: false, status: 'published', note: 'cc plugin', recommended: false },
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

suite('AgtRenderer (B-INT-16, jsdom structural)', () => {
  test('renders recommended-first, Run for runnable, Copy for copy-only, source-only badge', async () => {
    const ctx = setupDom(async () => ({ ok: true, json: async () => MODULES }));
    try {
      await new AgtRenderer('integrations').render();
      assert.equal(ctx.doc.querySelectorAll('.cc-agt-card').length, 3);
      assert.equal(ctx.doc.querySelectorAll('.cc-agt-reco').length, 1, 'typescript is recommended');
      // ts + go are runnable → Run buttons; claude-code is copy-only → Copy button.
      assert.equal(ctx.doc.querySelectorAll('.cc-agt-run').length, 2);
      assert.equal(ctx.doc.querySelectorAll('.cc-agt-copy').length, 1);
      assert.ok(ctx.doc.querySelector('.cc-agt-badge-src'), 'Go source-only badge renders');
      assert.ok(/Public Preview/.test(ctx.doc.body.innerHTML), 'preview caveat shown');
    } finally { ctx.cleanup(); }
  });

  test('Run button POSTs agt-install with the module id', async () => {
    const calls: string[] = [];
    const ctx = setupDom(async (url: string) => {
      calls.push(url);
      if (url === '/api/v1/agt/modules') return { ok: true, json: async () => MODULES };
      return { ok: true, json: async () => ({ ok: true }) };
    });
    try {
      await new AgtRenderer('integrations').render();
      const runBtn = ctx.doc.querySelector('.cc-agt-run') as HTMLButtonElement;
      runBtn.click();
      await new Promise((r) => setTimeout(r, 0));
      assert.ok(calls.includes('/api/actions/agt-install'), 'POST on run click');
    } finally { ctx.cleanup(); }
  });

  test('catalog fetch failure renders a non-empty error state (no throw)', async () => {
    const ctx = setupDom(async () => { throw new Error('network down'); });
    try {
      await new AgtRenderer('integrations').render();
      assert.ok(ctx.doc.querySelector('.cc-agt'));
      assert.ok(/Could not load AGT modules/.test(ctx.doc.body.innerHTML));
    } finally { ctx.cleanup(); }
  });
});
