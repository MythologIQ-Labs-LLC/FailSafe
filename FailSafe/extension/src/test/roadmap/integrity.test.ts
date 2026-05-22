// Functional tests for integrity module (FX162 + integrity helpers).
// Pure HTML-string generators + derivation logic. Sink: returned HTML/objects.

import { strict as assert } from 'assert';
import { JSDOM } from 'jsdom';
import {
  renderIntegrityCard,
  renderUnattributedCard,
  derivePolicies,
// @ts-expect-error JS module import in TS test context
} from '../../../src/roadmap/ui/modules/integrity.js';

function setupDom() {
  const dom = new JSDOM();
  (globalThis as { document?: unknown }).document = dom.window.document;
  return () => { (globalThis as { document?: unknown }).document = undefined; };
}

suite('integrity module (FX162 + helpers)', () => {
  let restore: () => void;
  setup(() => { restore = setupDom(); });
  teardown(() => { restore(); });

  test('FX162 renderIntegrityCard — empty list returns empty string', () => {
    const html = renderIntegrityCard([]);
    assert.equal(html, '');
  });

  test('FX162 renderIntegrityCard — renders one row per item with status color', () => {
    const html = renderIntegrityCard([
      { label: 'Verified events', status: 'authoritative', basis: 'ledger receipts' },
      { label: 'IDE telemetry', status: 'inferred', basis: 'observed file writes' },
      { label: 'Unknown source', status: 'unknown', basis: 'no evidence' },
    ]);
    assert.match(html, /Verified events/);
    // Status text is lowercase in HTML; visual uppercase comes from CSS text-transform.
    assert.match(html, />authoritative</);
    assert.match(html, /var\(--accent-green\)/);
    assert.match(html, /IDE telemetry/);
    assert.match(html, />inferred</);
    assert.match(html, /var\(--accent-gold\)/);
    assert.match(html, /Unknown source/);
    assert.match(html, />unknown</);
  });

  test('FX162 renderIntegrityCard — escapes HTML in label/basis (xss guard)', () => {
    const html = renderIntegrityCard([
      { label: '<script>alert(1)</script>', status: 'unknown', basis: '<img onerror=x>' },
    ]);
    assert.ok(!html.includes('<script>alert(1)</script>'));
    assert.ok(!html.includes('<img onerror=x>'));
    assert.ok(html.includes('&lt;script&gt;'));
  });

  test('FX162 renderIntegrityCard — unknown status falls back to muted color', () => {
    const html = renderIntegrityCard([
      { label: 'Mystery', status: 'novel-status', basis: '?' },
    ]);
    assert.match(html, /var\(--text-muted\)/);
  });

  test('renderUnattributedCard — empty/zero-count returns empty string', () => {
    assert.equal(renderUnattributedCard(undefined), '');
    assert.equal(renderUnattributedCard({}), '');
    assert.equal(renderUnattributedCard({ count: 0 }), '');
  });

  test('renderUnattributedCard — caps recent list at 5', () => {
    const recent = Array.from({ length: 8 }, (_, i) => ({
      type: 'FILE_MODIFIED', decision: 'observed', artifactPath: `/p/${i}`,
    }));
    const html = renderUnattributedCard({ count: 8, recent });
    // Count occurrences of "/p/" — should be 5 only
    const matches = html.match(/\/p\/\d/g) || [];
    assert.equal(matches.length, 5);
  });

  test('renderUnattributedCard — defaults type/decision/path when missing', () => {
    const html = renderUnattributedCard({ count: 1, recent: [{}] });
    assert.match(html, /FILE_MODIFIED/);
    assert.match(html, /observed/);
    assert.match(html, /unknown path/);
  });

  test('renderUnattributedCard — escapes HTML in artifactPath', () => {
    const html = renderUnattributedCard({
      count: 1,
      recent: [{ artifactPath: '<img src=x onerror=alert(1)>' }],
    });
    assert.ok(!html.includes('<img src=x onerror=alert(1)>'));
    assert.ok(html.includes('&lt;img'));
  });

  test('derivePolicies — explicit activePolicies wins', () => {
    const out = derivePolicies({ activePolicies: [{ name: 'X', id: 'x' }] });
    assert.deepEqual(out, [{ name: 'X', id: 'x' }]);
  });

  test('derivePolicies — explicit policies (legacy) wins when activePolicies absent', () => {
    const out = derivePolicies({ policies: [{ name: 'Y', id: 'y' }] });
    assert.deepEqual(out, [{ name: 'Y', id: 'y' }]);
  });

  test('derivePolicies — empty hub data derives from defaults: sentinel mode + idle', () => {
    // B-EM-1: the derived row reflects sentinel.mode; the corrected fallback is
    // 'heuristic' (a valid SentinelMode) — never the GovernanceMode 'observe'.
    const out = derivePolicies({});
    assert.equal(out.length, 1);
    assert.match(out[0].name, /Sentinel Mode: Heuristic/);
    assert.equal(out[0].id, 'sentinel-mode');
  });

  test('derivePolicies — sentinel mode is capitalized in derived label', () => {
    const out = derivePolicies({ sentinelStatus: { mode: 'hybrid' } });
    assert.match(out[0].name, /Sentinel Mode: Hybrid/);
  });

  test('derivePolicies — non-IDLE governance phase adds SHIELD phase entry', () => {
    const out = derivePolicies({ governancePhase: { current: 'PLAN' } });
    assert.ok(out.some((p: { name: string; id: string }) => p.id === 'shield-phase' && /S\.H\.I\.E\.L\.D\. Phase: PLAN/.test(p.name)));
  });

  test('derivePolicies — IDLE governance phase does NOT add SHIELD phase entry', () => {
    const out = derivePolicies({ governancePhase: { current: 'IDLE' } });
    assert.equal(out.some((p: { id: string }) => p.id === 'shield-phase'), false);
  });

  test('derivePolicies — activeAlerts each become their own derived policy', () => {
    const out = derivePolicies({
      governancePhase: {
        current: 'GATE',
        activeAlerts: [
          { id: 'alert-1', message: 'Coverage gap detected' },
          { id: 'alert-2', message: 'L3 review pending' },
        ],
      },
    });
    assert.ok(out.some((p: { id: string; name: string }) => p.id === 'alert-1' && p.name === 'Coverage gap detected'));
    assert.ok(out.some((p: { id: string; name: string }) => p.id === 'alert-2'));
  });

  test('derivePolicies — first nextStep becomes a "Next:" derived policy', () => {
    const out = derivePolicies({
      governancePhase: { current: 'IMPLEMENT', nextSteps: ['Run tests', 'Substantiate'] },
    });
    const nextEntry = out.find((p: { id: string }) => p.id === 'next-step');
    assert.ok(nextEntry);
    assert.match(nextEntry!.name, /Next: Run tests/);
  });
});
