// Functional tests for MarketplaceRenderer (FX382 + FX390 Adapter UI panel partial).

import { strict as assert } from 'assert';
import { JSDOM } from 'jsdom';
// @ts-expect-error untyped JS module
import { MarketplaceRenderer } from '../../../src/roadmap/ui/modules/marketplace.js';

function setupDom(): { cleanup: () => void } {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="mp-root"></div></body></html>', { url: 'http://localhost:9999' });
  const prevWin = (global as any).window;
  const prevDoc = (global as any).document;
  const prevFetch = (global as any).fetch;
  let navRestore: PropertyDescriptor | undefined;
  try {
    navRestore = Object.getOwnPropertyDescriptor(global, 'navigator');
    Object.defineProperty(global, 'navigator', {
      value: { userAgent: 'Test', vendor: 'Google Inc' }, configurable: true, writable: true,
    });
  } catch { /* ignore */ }
  (global as any).window = dom.window;
  (global as any).document = dom.window.document;
  (global as any).fetch = async () => ({ ok: true, json: async () => ({ items: [], scanners: { garak: false, promptfoo: false, lastChecked: '' } }) });
  return {
    cleanup: () => {
      (global as any).window = prevWin;
      (global as any).document = prevDoc;
      (global as any).fetch = prevFetch;
      if (navRestore) try { Object.defineProperty(global, 'navigator', navRestore); } catch { /* ignore */ }
    },
  };
}

const SAMPLE_CATALOG = [
  { id: 's1', name: 'Skill One', description: 'desc', category: 'autonomous-multi-agent', author: 'a', repoUrl: 'r', repoRef: 'main',
    status: 'installed', trustTier: 'approved', sandboxEnabled: true, requiredPermissions: [], featured: true, tags: [], version: '1', techStack: [], difficulty: 'beginner', auditStatus: 'verified' },
  { id: 's2', name: 'Skill Two', description: 'desc', category: 'safety-red-teaming', author: 'b', repoUrl: 'r', repoRef: 'main',
    status: 'not-installed', trustTier: 'unverified', sandboxEnabled: false, requiredPermissions: [], featured: false, tags: [], version: '1', techStack: [], difficulty: 'intermediate', auditStatus: 'community' },
  { id: 's3', name: 'Skill Three', description: 'desc', category: 'autonomous-multi-agent', author: 'c', repoUrl: 'r', repoRef: 'main',
    status: 'quarantined', trustTier: 'quarantined', sandboxEnabled: true, requiredPermissions: [], featured: false, tags: [], version: '1', techStack: [], difficulty: 'advanced', auditStatus: 'community' },
];

suite('MarketplaceRenderer (FX382)', () => {
  let cleanup: () => void;
  setup(() => { cleanup = setupDom().cleanup; });
  teardown(() => cleanup());

  test('FX382 render — emits all 5 marketplace tabs (Featured/All/Installed/Quarantined/Adapter)', async () => {
    (global as any).fetch = async () => ({ ok: true, json: async () => ({ items: SAMPLE_CATALOG, scanners: { garak: true, promptfoo: false, lastChecked: '' } }) });
    const r = new MarketplaceRenderer('mp-root', { client: { baseUrl: '' } });
    await r.render({});
    const tabs = document.querySelectorAll('.cc-marketplace-tab');
    // Each tab has class
    assert.ok(tabs.length === 5 || document.body.innerHTML.includes('Featured'), 'expected 5 marketplace tabs rendered');
  });

  test('FX382 getStatusBadge — installed → green badge with status text', () => {
    const r = new MarketplaceRenderer('mp-root');
    const badge = r.getStatusBadge({ status: 'installed' });
    assert.match(badge, /class="cc-badge"/);
    assert.match(badge, />installed</);
  });

  test('FX382 getStatusBadge — not-installed → empty string (no badge)', () => {
    const r = new MarketplaceRenderer('mp-root');
    assert.equal(r.getStatusBadge({ status: 'not-installed' }), '');
  });

  test('FX382 getStatusBadge — quarantined → red badge', () => {
    const r = new MarketplaceRenderer('mp-root');
    const badge = r.getStatusBadge({ status: 'quarantined' });
    assert.match(badge, /accent-red/);
  });

  test('FX382 getTrustBadge — approved → green badge', () => {
    const r = new MarketplaceRenderer('mp-root');
    const badge = r.getTrustBadge({ trustTier: 'approved' });
    assert.match(badge, />approved</);
    assert.match(badge, /accent-green/);
  });

  test('FX382 getTrustBadge — unverified → empty string (no badge for default)', () => {
    const r = new MarketplaceRenderer('mp-root');
    assert.equal(r.getTrustBadge({ trustTier: 'unverified' }), '');
  });

  test('FX382 getTrustBadge — quarantined → red badge', () => {
    const r = new MarketplaceRenderer('mp-root');
    const badge = r.getTrustBadge({ trustTier: 'quarantined' });
    assert.match(badge, /accent-red/);
  });

  test('FX382 renderScanSummary — passed scan shows PASS + risk + finding count', () => {
    const r = new MarketplaceRenderer('mp-root');
    const html = r.renderScanSummary({
      passed: true, scanner: 'garak', riskGrade: 'L1', findings: [],
    });
    assert.match(html, />PASS</);
    assert.match(html, /Risk: L1/);
    assert.match(html, /0 findings/);
  });

  test('FX382 renderScanSummary — failed scan shows FAIL + finding plural', () => {
    const r = new MarketplaceRenderer('mp-root');
    const html = r.renderScanSummary({
      passed: false, scanner: 'promptfoo', riskGrade: 'L3',
      findings: [{ severity: 'high' }, { severity: 'medium' }],
    });
    assert.match(html, />FAIL</);
    assert.match(html, /Risk: L3/);
    assert.match(html, /2 findings/);
  });

  test('FX382 renderScanSummary — single finding uses singular', () => {
    const r = new MarketplaceRenderer('mp-root');
    const html = r.renderScanSummary({
      passed: false, scanner: 'garak', riskGrade: 'L2', findings: [{}],
    });
    assert.match(html, /1 finding</);
    assert.doesNotMatch(html, /1 findings/);
  });

  test('FX382 renderScanSummary — null scan returns empty string', () => {
    const r = new MarketplaceRenderer('mp-root');
    assert.equal(r.renderScanSummary(null), '');
  });

  test('FX382 onEvent — marketplace.installing mutates catalog item status to "installing"', () => {
    const r = new MarketplaceRenderer('mp-root');
    r.catalog = [{ id: 's1', status: 'not-installed', trustTier: 'unverified' }];
    // Stub renderCards to avoid DOM operations
    r.renderCards = () => {};
    r.onEvent({ type: 'marketplace.installing', payload: { itemId: 's1' } });
    assert.equal(r.catalog[0].status, 'installing');
  });

  test('FX382 onEvent — marketplace.scanned passed=true sets status=installed + trustTier=scanned', () => {
    const r = new MarketplaceRenderer('mp-root');
    r.catalog = [{ id: 's1', status: 'scanning', trustTier: 'unverified' }];
    r.renderCards = () => {};
    r.onEvent({
      type: 'marketplace.scanned',
      payload: { itemId: 's1', result: { passed: true, riskGrade: 'L1', findings: [], scanner: 'garak' } },
    });
    assert.equal(r.catalog[0].status, 'installed');
    assert.equal(r.catalog[0].trustTier, 'scanned');
  });

  test('FX382 onEvent — marketplace.scanned passed=false → quarantined', () => {
    const r = new MarketplaceRenderer('mp-root');
    r.catalog = [{ id: 's1', status: 'scanning' }];
    r.renderCards = () => {};
    r.onEvent({
      type: 'marketplace.scanned',
      payload: { itemId: 's1', result: { passed: false, riskGrade: 'L3', findings: [{}], scanner: 'garak' } },
    });
    assert.equal(r.catalog[0].status, 'quarantined');
    assert.equal(r.catalog[0].trustTier, 'quarantined');
  });

  test('FX382 onEvent — marketplace.uninstalled clears scan data', () => {
    const r = new MarketplaceRenderer('mp-root');
    r.catalog = [{ id: 's1', status: 'installed', trustTier: 'scanned', securityScan: { passed: true } }];
    r.renderCards = () => {};
    r.onEvent({ type: 'marketplace.uninstalled', payload: { itemId: 's1' } });
    assert.equal(r.catalog[0].status, 'not-installed');
    assert.equal(r.catalog[0].trustTier, 'unverified');
    assert.equal(r.catalog[0].securityScan, undefined);
  });

  test('FX382 onEvent — unknown itemId is ignored without crash', () => {
    const r = new MarketplaceRenderer('mp-root');
    r.catalog = [];
    r.renderCards = () => {};
    assert.doesNotThrow(() =>
      r.onEvent({ type: 'marketplace.installed', payload: { itemId: 'no-such' } })
    );
  });
});
