// Functional tests for CacheInstrumentation (FX313), CacheSizeMonitor (FX314),
// NoveltyAccuracyMonitor (FX312).

import { strict as assert } from 'assert';
import { CacheInstrumentation } from '../../governance/CacheInstrumentation';
import { CacheSizeMonitor } from '../../governance/CacheSizeMonitor';
import { NoveltyAccuracyMonitor } from '../../governance/NoveltyAccuracyMonitor';
import { LRUCache } from '../../shared/LRUCache';

suite('CacheInstrumentation (FX313)', () => {
  test('FX313 — recordHit increments hits for that cache name', () => {
    const c = new CacheInstrumentation();
    c.recordHit('foo');
    c.recordHit('foo');
    assert.deepEqual(c.getMetrics().foo, { hits: 2, misses: 0 });
  });

  test('FX313 — recordMiss increments misses for that cache name', () => {
    const c = new CacheInstrumentation();
    c.recordMiss('foo');
    c.recordMiss('foo');
    c.recordMiss('foo');
    assert.deepEqual(c.getMetrics().foo, { hits: 0, misses: 3 });
  });

  test('FX313 — different cache names are tracked independently', () => {
    const c = new CacheInstrumentation();
    c.recordHit('a');
    c.recordMiss('b');
    const m = c.getMetrics();
    assert.deepEqual(m.a, { hits: 1, misses: 0 });
    assert.deepEqual(m.b, { hits: 0, misses: 1 });
  });

  test('FX313 — getMetrics returns a shallow copy (top-level keys mutation-safe)', () => {
    const c = new CacheInstrumentation();
    c.recordHit('x');
    const snap = c.getMetrics();
    c.recordHit('y'); // adds new top-level key — should not appear in snap
    assert.equal(snap.y, undefined, 'shallow copy: new top-level key should not appear in prior snapshot');
    assert.ok(c.getMetrics().y, 'new key visible on fresh getMetrics call');
  });
});

suite('CacheSizeMonitor (FX314)', () => {
  test('FX314 — empty caches → 0 bytes total', () => {
    const m = new CacheSizeMonitor();
    const fp = new LRUCache<string, unknown>(10);
    const nv = new LRUCache<string, unknown>(10);
    const r = m.buildMetrics(fp, nv);
    assert.deepEqual(r, { fingerprintCacheBytes: 0, noveltyCacheBytes: 0, totalBytes: 0 });
  });

  test('FX314 — non-empty cache produces nonzero byte estimate', () => {
    const m = new CacheSizeMonitor();
    const fp = new LRUCache<string, unknown>(10);
    fp.set('a', { hash: 'aaa', size: 100, type: 'ts', path: 'a.ts', timestamp: 1 }, 60000);
    const nv = new LRUCache<string, unknown>(10);
    const r = m.buildMetrics(fp, nv);
    assert.ok(r.fingerprintCacheBytes > 0);
    assert.equal(r.noveltyCacheBytes, 0);
    assert.equal(r.totalBytes, r.fingerprintCacheBytes);
  });

  test('FX314 — estimateCacheSizeBytes scales linearly with entries', () => {
    const m = new CacheSizeMonitor();
    const c1 = new LRUCache<string, unknown>(10);
    c1.set('a', 'x', 60000);
    const single = m.estimateCacheSizeBytes(c1);
    c1.set('b', 'x', 60000);
    c1.set('c', 'x', 60000);
    const triple = m.estimateCacheSizeBytes(c1);
    assert.ok(triple > single, 'three entries should weigh more than one');
  });

  test('FX314 — circular value falls back to 0 (JSON.stringify throws)', () => {
    const m = new CacheSizeMonitor();
    const cache = new LRUCache<string, unknown>(10);
    const circular: any = {};
    circular.self = circular;
    cache.set('c', circular, 60000);
    // Should not throw; the circular value contributes 0
    const bytes = m.estimateCacheSizeBytes(cache);
    assert.equal(bytes, 0);
  });
});

suite('NoveltyAccuracyMonitor (FX312)', () => {
  test('FX312 — recordEvaluation increments correct novelty bucket', () => {
    const n = new NoveltyAccuracyMonitor();
    n.recordEvaluation('low', 'high');
    n.recordEvaluation('low', 'high');
    n.recordEvaluation('medium', 'medium');
    n.recordEvaluation('high', 'low');
    const m = n.getMetrics();
    assert.equal(m.lowCount, 2);
    assert.equal(m.mediumCount, 1);
    assert.equal(m.highCount, 1);
    assert.equal(m.totalEvaluations, 4);
  });

  test('FX312 — averageConfidence — single high observation = 1.0', () => {
    const n = new NoveltyAccuracyMonitor();
    n.recordEvaluation('low', 'high');
    assert.equal(n.getMetrics().averageConfidence, 1.0);
  });

  test('FX312 — averageConfidence — single low observation = 0.0', () => {
    const n = new NoveltyAccuracyMonitor();
    n.recordEvaluation('high', 'low');
    assert.equal(n.getMetrics().averageConfidence, 0.0);
  });

  test('FX312 — averageConfidence — running mean of high(1.0) + low(0.0) = 0.5', () => {
    const n = new NoveltyAccuracyMonitor();
    n.recordEvaluation('low', 'high');
    n.recordEvaluation('high', 'low');
    assert.equal(n.getMetrics().averageConfidence, 0.5);
  });

  test('FX312 — averageConfidence — weighted across 3 obs (high+medium+low) = 0.5', () => {
    const n = new NoveltyAccuracyMonitor();
    n.recordEvaluation('low', 'high');     // 1.0
    n.recordEvaluation('medium', 'medium'); // 0.5
    n.recordEvaluation('high', 'low');      // 0.0
    assert.equal(n.getMetrics().averageConfidence, 0.5);
  });

  test('FX312 — initial state — totalEvaluations 0, all counts 0, avgConf 0', () => {
    const n = new NoveltyAccuracyMonitor();
    assert.deepEqual(n.getMetrics(), {
      totalEvaluations: 0, lowCount: 0, mediumCount: 0, highCount: 0, averageConfidence: 0,
    });
  });

  test('FX312 — getMetrics returns a snapshot copy', () => {
    const n = new NoveltyAccuracyMonitor();
    n.recordEvaluation('low', 'high');
    const snap = n.getMetrics();
    n.recordEvaluation('high', 'low');
    assert.equal(snap.totalEvaluations, 1);
    assert.equal(n.getMetrics().totalEvaluations, 2);
  });
});
