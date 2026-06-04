// Structural (jsdom) tests for IntegrationCatalogRenderer (GH #167 UI).
// NOTE: jsdom verifies STRUCTURE only — the visual surface still requires Chrome
// verification per feedback_design_reference_required (done separately).

import { strict as assert } from 'assert';
import { JSDOM } from 'jsdom';
// @ts-expect-error untyped JS module
import { IntegrationCatalogRenderer } from '../../../src/roadmap/ui/modules/integration-catalog-renderer.js';

const CATALOG = {
  integrations: [
    { id: 'continue', label: 'Continue', category: 'Agent CLI', summary: 'Governed Continue runs.', docsId: 'continue', configHint: 'Set API key.', enabled: true, configured: true, state: 'active', missingKeys: [] },
    { id: 'aider', label: 'Aider', category: 'Agent CLI', summary: 'Governed Aider runs.', docsId: 'aider', configHint: 'Enable Aider.', enabled: false, configured: false, state: 'disabled', missingKeys: [] },
    { id: 'jira', label: 'Jira', category: 'Issue Tracker', summary: 'Imports Jira issues.', docsId: 'jira', configHint: 'Set token.', enabled: true, configured: false, state: 'needs-config', missingKeys: ['failsafe.integrations.jira.apiToken'] },
  ],
};

interface G { window?: unknown; document?: unknown; fetch?: unknown }
function setupDom(fetchImpl: (url: string, init?: unknown) => Promise<unknown>): { cleanup: () => void; doc: Document } {
  const dom = new JSDOM(
    '<!DOCTYPE html><html><head></head><body>' +
    '<button class="tab-btn" data-target="settings"></button>' +
    '<div id="integrations"></div></body></html>',
    { url: 'http://localhost:9999' },
  );
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

suite('IntegrationCatalogRenderer (GH #167, jsdom structural)', () => {
  test('renders one card per integration grouped by category with state pills', async () => {
    const ctx = setupDom(async () => ({ ok: true, json: async () => CATALOG }));
    try {
      await new IntegrationCatalogRenderer('integrations').render();
      assert.equal(ctx.doc.querySelectorAll('.cc-intcat-card').length, 3);
      assert.equal(ctx.doc.querySelectorAll('.cc-intcat-pill-active').length, 1, 'continue active');
      assert.equal(ctx.doc.querySelectorAll('.cc-intcat-pill-needs').length, 1, 'jira needs-config');
      assert.equal(ctx.doc.querySelectorAll('.cc-intcat-pill-disabled').length, 1, 'aider disabled');
      // two distinct category headers (Agent CLI, Issue Tracker)
      assert.equal(ctx.doc.querySelectorAll('.cc-intcat-group').length, 2);
    } finally { ctx.cleanup(); }
  });

  test('needs-config card lists the missing key (name only, no secret value)', async () => {
    const ctx = setupDom(async () => ({ ok: true, json: async () => CATALOG }));
    try {
      await new IntegrationCatalogRenderer('integrations').render();
      const missing = ctx.doc.querySelector('.cc-intcat-missing');
      assert.ok(missing, 'missing-keys line renders');
      assert.ok(/apiToken/.test(missing!.textContent || ''), 'names the missing key');
    } finally { ctx.cleanup(); }
  });

  test('Configure button jumps to the Settings tab', async () => {
    const ctx = setupDom(async () => ({ ok: true, json: async () => CATALOG }));
    try {
      let settingsClicked = false;
      const settingsTab = ctx.doc.querySelector('.tab-btn[data-target="settings"]') as HTMLButtonElement;
      settingsTab.addEventListener('click', () => { settingsClicked = true; });
      await new IntegrationCatalogRenderer('integrations').render();
      const btn = ctx.doc.querySelector('.cc-intcat-configure') as HTMLButtonElement;
      btn.click();
      assert.equal(settingsClicked, true, 'Configure navigates to Settings');
    } finally { ctx.cleanup(); }
  });

  test('does not leak a secret value even if one were present in the payload', async () => {
    // Defense-in-depth: the renderer must only ever display the catalog fields it
    // is given (names/summaries/state) — never echo a stray value. Inject a fake
    // token field and assert it never appears in the DOM.
    const poisoned = { integrations: [{ ...CATALOG.integrations[0], apiKey: 'sk_live_LEAK', missingKeys: [] }] };
    const ctx = setupDom(async () => ({ ok: true, json: async () => poisoned }));
    try {
      await new IntegrationCatalogRenderer('integrations').render();
      assert.ok(!/sk_live_LEAK/.test(ctx.doc.body.innerHTML), 'stray secret-like field is never rendered');
    } finally { ctx.cleanup(); }
  });

  test('fetch failure renders a non-empty error state (no throw)', async () => {
    const ctx = setupDom(async () => { throw new Error('network down'); });
    try {
      await new IntegrationCatalogRenderer('integrations').render();
      assert.ok(ctx.doc.querySelector('.cc-intcat'));
      assert.ok(/Could not load integrations/.test(ctx.doc.body.innerHTML));
    } finally { ctx.cleanup(); }
  });
});
