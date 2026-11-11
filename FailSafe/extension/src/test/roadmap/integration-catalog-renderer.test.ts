// Structural (jsdom) tests for IntegrationCatalogRenderer (GH #167 UI).
// NOTE: jsdom verifies STRUCTURE only — the visual surface still requires Chrome
// verification per feedback_design_reference_required (done separately).

import { strict as assert } from 'assert';
import { JSDOM } from 'jsdom';
// @ts-expect-error untyped JS module
import { IntegrationCatalogRenderer } from '../../../src/roadmap/ui/modules/integration-catalog-renderer.js';

const CATALOG = {
  integrations: [
    { id: 'continue', label: 'Continue', category: 'Agent CLI', summary: 'Governed Continue runs.', docsId: 'continue', configHint: 'Set API key.', enabled: true, configured: true, state: 'configured-unverified', missingKeys: [] },
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
      assert.equal(ctx.doc.querySelectorAll('.cc-intcat-pill-configured').length, 1, 'continue configured, not health-proven');
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

// #479 H5 (structure only; the visual check is the Playwright spec):
// evidence-derived pills, labels by evidence kind, the last-result line and the
// separate verified/failing/unverified counts.
suite('IntegrationCatalogRenderer evidence states (#479 H5, jsdom structural)', () => {
  const at = '2026-10-15T12:00:00.000Z';
  const base = { summary: 's', configHint: 'h', enabled: true, configured: true, missingKeys: [] };
  const EVIDENCE = {
    integrations: [
      { ...base, id: 'jira', label: 'Jira', category: 'Issue Tracker', docsId: 'jira', state: 'contract-verified', evidenceKind: 'service', capabilities: ['issue-preview', 'intent-draft'], lastResult: { result: 'contract-verified', checkedAt: at } },
      { ...base, id: 'sarif', label: 'SARIF Import', category: 'Security Scanning', docsId: 'sarif', state: 'contract-verified', evidenceKind: 'file', capabilities: ['risk-ingest'], lastResult: { result: 'contract-verified', checkedAt: at } },
      { ...base, id: 'aider', label: 'Aider', category: 'Agent CLI', docsId: 'aider', state: 'connected', evidenceKind: 'process', capabilities: ['isolated-run'], lastResult: { result: 'connected', checkedAt: at } },
      { ...base, id: 'sentry', label: 'Sentry', category: 'Error Monitoring', docsId: 'sentry', state: 'failing', evidenceKind: 'service', capabilities: ['risk-ingest'], lastResult: { result: 'failing', category: 'auth', checkedAt: at } },
      { ...base, id: 'linear', label: 'Linear', category: 'Issue Tracker', docsId: 'linear', state: 'stale', evidenceKind: 'service', capabilities: ['issue-preview'], lastResult: { result: 'contract-verified', checkedAt: at } },
      { ...base, id: 'slack', label: 'Slack', category: 'Notifications', docsId: 'slack', state: 'configured-unverified', evidenceKind: 'service', capabilities: ['notify'] },
    ],
  };
  const card = (doc: Document, id: string) => doc.querySelector(`.cc-intcat-card[data-id="${id}"]`)!;

  test('pills and labels follow the state and the evidence kind', async () => {
    const ctx = setupDom(async () => ({ ok: true, json: async () => EVIDENCE }));
    try {
      await new IntegrationCatalogRenderer('integrations').render();
      const d = ctx.doc;
      assert.equal(card(d, 'jira').querySelector('.cc-intcat-pill-observed')?.textContent, 'Last response matched expected format');
      assert.equal(card(d, 'sarif').querySelector('.cc-intcat-pill-observed')?.textContent, 'Last import parsed');
      assert.equal(card(d, 'aider').querySelector('.cc-intcat-pill-observed')?.textContent, 'Last process started');
      assert.equal(card(d, 'sentry').querySelector('.cc-intcat-pill-failing')?.textContent, 'Failing');
      assert.equal(card(d, 'linear').querySelector('.cc-intcat-pill-stale')?.textContent, 'Stale');
      assert.equal(card(d, 'slack').querySelector('.cc-intcat-pill-configured')?.textContent, 'Configured · unverified');
      assert.equal(card(d, 'sentry').querySelector('.cc-intcat-pill-observed'), null, 'a failing card never shows the verified pill');
    } finally { ctx.cleanup(); }
  });

  test('last-result line names the failure in words; capabilities and the SARIF docs link render', async () => {
    const ctx = setupDom(async () => ({ ok: true, json: async () => EVIDENCE }));
    try {
      await new IntegrationCatalogRenderer('integrations').render();
      const d = ctx.doc;
      assert.match(card(d, 'sentry').querySelector('.cc-intcat-last')?.textContent ?? '', /Observed: Failing: authentication was refused/);
      assert.match(card(d, 'linear').querySelector('.cc-intcat-last')?.textContent ?? '', /stale: older than 7 days/);
      assert.equal(card(d, 'slack').querySelector('.cc-intcat-last'), null, 'no evidence, no last-result line');
      assert.equal(card(d, 'jira').querySelector('.cc-intcat-caps')?.textContent, 'Implemented path (not live-qualified): preview issues, create intent drafts');
      assert.match(card(d, 'sarif').querySelector('.cc-intcat-docs')?.getAttribute('href') ?? '', /sarif\/README\.md$/);
    } finally { ctx.cleanup(); }
  });

  test('successful single-call evidence never claims an integration is production-ready or value-proven', async () => {
    const ctx = setupDom(async () => ({ ok: true, json: async () => EVIDENCE }));
    try {
      await new IntegrationCatalogRenderer('integrations').render();
      const body = ctx.doc.querySelector('.cc-intcat')?.textContent ?? '';
      assert.match(body, /A recent call is not end-to-end qualification or proof of customer value/);
      assert.match(body, /Implemented path \(not live-qualified\):/);
      assert.match(body, /Value impact: not measured/);
      assert.doesNotMatch(body, /3 verified by their last call/);
      assert.doesNotMatch(card(ctx.doc, 'jira').textContent ?? '', /Operational|Live connection/);
    } finally { ctx.cleanup(); }
  });

  test('the header counts verified, failing and unverified separately', async () => {
    const ctx = setupDom(async () => ({ ok: true, json: async () => EVIDENCE }));
    try {
      await new IntegrationCatalogRenderer('integrations').render();
      assert.match(ctx.doc.querySelector('.cc-intcat-sub')?.textContent ?? '', /6 integrations — 3 observed connection or format results, 1 failing, 2 configured but unverified or stale\./);
    } finally { ctx.cleanup(); }
  });
});
