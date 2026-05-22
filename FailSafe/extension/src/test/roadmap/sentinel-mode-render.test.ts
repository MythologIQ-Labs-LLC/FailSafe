// jsdom render tests for the Sentinel-mode UI disambiguation (B-EM-1, FX584).
//
// FX584.4 — integrity.js derivePolicies renders the sentinel-sourced row as
//           "Sentinel Mode: …" and never as "Governance Mode: …".
// FX584.5 — operations.js renderMissionStrip prefixes the sentinel token
//           with "Sentinel".

import { strict as assert } from 'assert';
import { JSDOM } from 'jsdom';
// @ts-expect-error JS module import in TS test context
import { derivePolicies } from '../../../src/roadmap/ui/modules/integrity.js';
// @ts-expect-error JS module import in TS test context
import { OperationsRenderer } from '../../../src/roadmap/ui/modules/operations.js';

function setupDom() {
  const dom = new JSDOM('<!DOCTYPE html><div id="ops-root"></div>');
  (globalThis as { document?: unknown }).document = dom.window.document;
  return () => { (globalThis as { document?: unknown }).document = undefined; };
}

suite('sentinel-mode render disambiguation (FX584)', () => {
  let restore: () => void;
  setup(() => { restore = setupDom(); });
  teardown(() => { restore(); });

  test('FX584.4 integrity derivePolicies renders "Sentinel Mode:" for the sentinel value', () => {
    const out = derivePolicies({ sentinelStatus: { mode: 'hybrid' } });
    const row = out.find((p: { id: string }) => p.id === 'sentinel-mode');
    assert.ok(row, 'expected a sentinel-mode derived policy row');
    assert.equal(row.name, 'Sentinel Mode: Hybrid');
  });

  test('FX584.4 integrity derivePolicies never labels the sentinel value "Governance Mode:"', () => {
    const out = derivePolicies({ sentinelStatus: { mode: 'hybrid' } });
    for (const p of out) {
      assert.ok(!String(p.name).includes('Governance Mode:'),
        'sentinel-sourced row must not carry the "Governance Mode:" label');
    }
  });

  test('FX584.4 integrity derivePolicies falls back to "heuristic", never "observe"', () => {
    const out = derivePolicies({ sentinelStatus: {} });
    const row = out.find((p: { id: string }) => p.id === 'sentinel-mode');
    assert.ok(row, 'expected a sentinel-mode derived policy row');
    assert.equal(row.name, 'Sentinel Mode: Heuristic');
    assert.ok(!String(row.name).toLowerCase().includes('observe'));
  });

  test('FX584.5 operations mission strip prefixes the sentinel token with "Sentinel"', () => {
    const ops = new OperationsRenderer('ops-root');
    const html = ops.renderMissionStrip({ currentPhase: 'Plan' }, { mode: 'hybrid', running: true });
    assert.match(html, /Sentinel hybrid/);
  });

  test('FX584.5 operations mission strip falls back to "Sentinel heuristic" when mode absent', () => {
    const ops = new OperationsRenderer('ops-root');
    const html = ops.renderMissionStrip({ currentPhase: 'Plan' }, { running: true });
    assert.match(html, /Sentinel heuristic/);
    assert.ok(!html.includes('observe'));
  });
});
