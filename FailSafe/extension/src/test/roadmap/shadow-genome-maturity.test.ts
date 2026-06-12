// FX890 — renderMaturity observed-count invariant (research-brief Phase 5, Issue 7).
// A pure render fn: a foreign/corrupted payload reporting all-zero maturity while the
// graph has failure nodes must NOT show "Observed 0" — it derives Observed from the
// failure count and marks the panel degraded.

import { strict as assert } from 'assert';
import { JSDOM } from 'jsdom';
// @ts-expect-error untyped JS module
import { renderMaturity } from '../../roadmap/ui/modules/shadow-genome-panels.js';

function withDom<T>(fn: () => T): T {
  const dom = new JSDOM('<!DOCTYPE html><body></body>');
  const prev = (global as { document?: unknown }).document;
  (global as { document: unknown }).document = dom.window.document;
  try { return fn(); } finally { (global as { document: unknown }).document = prev; }
}

function parse(html: string): Document {
  return new JSDOM(html).window.document;
}

suite('FX890 renderMaturity observed-count invariant', () => {
  test('all-zero maturity + failures present → Observed shows the failure count + degraded', () => {
    const html = withDom(() => renderMaturity({
      learningMaturity: [{ stage: 'Observed', count: 0 }, { stage: 'Classified', count: 0 }],
      summary: { unresolvedCount: 3 },
    }));
    assert.ok(html.includes('sg-maturity-degraded'), 'panel is marked degraded');
    const doc = parse(html);
    const row = doc.querySelector('[data-stage="Observed"]');
    assert.ok(row, 'Observed row addressable via data-stage');
    assert.equal(row!.querySelector('.sg-mat-num')!.textContent, '3', 'Observed derived from failure count, not 0');
  });

  test('sourced maturity → rendered verbatim, no degrade', () => {
    const html = withDom(() => renderMaturity({
      learningMaturity: [{ stage: 'Observed', count: 5 }, { stage: 'Classified', count: 2 }],
      summary: { unresolvedCount: 5 },
    }));
    assert.ok(!html.includes('sg-maturity-degraded'), 'not degraded when stages are sourced');
    const doc = parse(html);
    assert.equal(doc.querySelector('[data-stage="Observed"] .sg-mat-num')!.textContent, '5');
    assert.equal(doc.querySelector('[data-stage="Classified"] .sg-mat-num')!.textContent, '2');
  });

  test('all-zero maturity but NO failures → not degraded (honest empty)', () => {
    const html = withDom(() => renderMaturity({
      learningMaturity: [{ stage: 'Observed', count: 0 }],
      summary: { unresolvedCount: 0 },
    }));
    assert.ok(!html.includes('sg-maturity-degraded'), 'zero failures + zero maturity is honest, not degraded');
  });
});
