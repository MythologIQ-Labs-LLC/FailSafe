import { strict as assert } from 'assert';
import { JSDOM } from 'jsdom';
import { normalizePhaseProgress } from '../../../src/roadmap/ui/modules/phase-progress.js';

suite('normalizePhaseProgress: well-formed inputs', () => {
  test('120 planned, 53 completed → 53/120, 44% adherence', () => {
    const result = normalizePhaseProgress({ plansStarted: 120, sessionsCompleted: 53 });
    assert.deepEqual(result, { planned: 120, completed: 53, adherence: 44 });
  });

  test('5 planned, 5 completed → 5/5, 100% adherence', () => {
    const result = normalizePhaseProgress({ plansStarted: 5, sessionsCompleted: 5 });
    assert.deepEqual(result, { planned: 5, completed: 5, adherence: 100 });
  });

  test('0 planned, 0 completed → 0/0, 0% adherence', () => {
    const result = normalizePhaseProgress({ plansStarted: 0, sessionsCompleted: 0 });
    assert.deepEqual(result, { planned: 0, completed: 0, adherence: 0 });
  });
});

suite('normalizePhaseProgress: anomalous inputs', () => {
  test('completed > planned → planned floored to completed (no impossible math)', () => {
    // The bug from #47: ledger has 4 substantiations but 0 gate tribunals.
    // Result must show 4/4 (100% adherence) rather than 4/0.
    const result = normalizePhaseProgress({ plansStarted: 0, sessionsCompleted: 4 });
    assert.deepEqual(result, { planned: 4, completed: 4, adherence: 100 });
  });

  test('completed = planned + 1 → planned floored to completed', () => {
    const result = normalizePhaseProgress({ plansStarted: 9, sessionsCompleted: 10 });
    assert.deepEqual(result, { planned: 10, completed: 10, adherence: 100 });
  });
});

suite('normalizePhaseProgress: defensive coercion', () => {
  test('null summary → all-zero shape', () => {
    assert.deepEqual(normalizePhaseProgress(null), { planned: 0, completed: 0, adherence: 0 });
  });

  test('undefined summary → all-zero shape', () => {
    assert.deepEqual(normalizePhaseProgress(undefined), { planned: 0, completed: 0, adherence: 0 });
  });

  test('string number inputs → coerced cleanly, no NaN propagation', () => {
    const result = normalizePhaseProgress({ plansStarted: '7', sessionsCompleted: '3' });
    assert.deepEqual(result, { planned: 7, completed: 3, adherence: 43 });
  });

  test('non-numeric junk → coerced to 0 (no NaN)', () => {
    const result = normalizePhaseProgress({ plansStarted: 'oops', sessionsCompleted: undefined });
    assert.deepEqual(result, { planned: 0, completed: 0, adherence: 0 });
  });

  test('negative inputs → coerced to 0', () => {
    const result = normalizePhaseProgress({ plansStarted: -5, sessionsCompleted: -2 });
    assert.deepEqual(result, { planned: 0, completed: 0, adherence: 0 });
  });
});

// ---------- B198 additions: OperationsRenderer fresh-data re-render ----------

async function renderOps(hub: any): Promise<{ html: string; renderer: any; dom: JSDOM }> {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="ops-root"></div></body></html>', { url: 'http://localhost:9999' });
  const prevWin = (global as any).window;
  const prevDoc = (global as any).document;
  (global as any).window = dom.window;
  (global as any).document = dom.window.document;
  try {
    // @ts-expect-error untyped JS module
    const mod = await import('../../../src/roadmap/ui/modules/operations.js');
    const renderer = new mod.OperationsRenderer('ops-root', { client: null });
    await renderer.render(hub);
    return { html: dom.window.document.getElementById('ops-root')!.innerHTML, renderer, dom };
  } finally {
    (global as any).window = prevWin;
    (global as any).document = prevDoc;
  }
}

suite('OperationsRenderer B198 — fresh-data re-render', () => {
  test('re-render with new hub reflects updated phase counts (v2 not v1)', async () => {
    const v1 = { ledgerSummary: { plansStarted: 6, sessionsCompleted: 3 }, runState: {}, recentCheckpoints: {}, sentinelStatus: {} };
    const v2 = { ledgerSummary: { plansStarted: 6, sessionsCompleted: 5 }, runState: {}, recentCheckpoints: {}, sentinelStatus: {} };
    const { renderer, dom } = await renderOps(v1);
    // First render should show 3/6.
    assert.match(dom.window.document.getElementById('ops-root')!.innerHTML, /3\s*\/\s*6/, 'first render must show 3/6');
    // Re-render with v2 in same renderer.
    const prevWin = (global as any).window;
    const prevDoc = (global as any).document;
    (global as any).window = dom.window;
    (global as any).document = dom.window.document;
    try {
      await renderer.render(v2);
    } finally {
      (global as any).window = prevWin;
      (global as any).document = prevDoc;
    }
    const after = dom.window.document.getElementById('ops-root')!.innerHTML;
    assert.match(after, /5\s*\/\s*6/, 'second render must reflect v2 (5/6), not stale v1 (3/6)');
    assert.ok(!/3\s*\/\s*6/.test(after), 'stale v1 (3/6) must NOT appear after re-render with v2');
  });

  test('destroy() is idempotent and clears cached hub + roadmap', async () => {
    const hub = { ledgerSummary: { plansStarted: 4, sessionsCompleted: 2 }, runState: {}, recentCheckpoints: {}, sentinelStatus: {} };
    const { renderer } = await renderOps(hub);
    renderer.destroy();
    assert.equal(renderer.hubData, null, 'hubData cleared after destroy');
    assert.equal(renderer.roadmap, null, 'roadmap cleared after destroy');
    assert.doesNotThrow(() => renderer.destroy(), 'second destroy must not throw');
  });
});
