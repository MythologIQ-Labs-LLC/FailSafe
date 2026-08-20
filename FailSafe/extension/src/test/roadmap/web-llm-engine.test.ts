// Regression tests for WebLlmEngine (#244 Tranche D).
// The module's own header states "extractGraph() MUST ALWAYS return usable
// nodes", but neither inference tier (native Gemini Nano prompt(), WASM
// Transformers.js pipeline()) carried a timeout of its own — a stalled model
// call hung extractGraph() forever, leaving Tier C (the guaranteed heuristic
// fallback) unreachable. These tests pin the fix: each tier is now bounded by
// `tierTimeoutMs` and a hung tier degrades to the next tier instead of
// hanging the caller indefinitely.

import { strict as assert } from 'assert';
// @ts-expect-error JS module without .d.ts
import { WebLlmEngine } from '../../../src/roadmap/ui/modules/web-llm-engine.js';

suite('WebLlmEngine — extractGraph() tier timeout (#244 Tranche D)', () => {
  test('a hung WASM pipeline (Tier B) degrades to heuristic Tier C within the bound, not forever', async () => {
    const engine = new WebLlmEngine({});
    engine.isReady = true;
    engine.tierTimeoutMs = 150;
    engine.pipeline = () => new Promise(() => { /* simulates a stalled WASM inference call */ });

    const start = Date.now();
    const result = await Promise.race([
      engine.extractGraph('we should build a risk mitigation plan'),
      new Promise((resolve) => setTimeout(() => resolve('OUTER_GUARD_TIMEOUT'), 3000)),
    ]);
    const elapsed = Date.now() - start;

    assert.notEqual(result, 'OUTER_GUARD_TIMEOUT', 'extractGraph() must not hang past its own tier timeout');
    assert.equal(result.status, 'heuristic-extracted');
    assert.ok(result.nodes.length > 0, 'heuristic fallback must still produce nodes');
    assert.ok(elapsed < 3000, `expected the bounded timeout (150ms) to win the race, took ${elapsed}ms`);
  });

  test('a hung native AI session (Tier A) degrades past it instead of hanging', async () => {
    const engine = new WebLlmEngine({});
    engine.isReady = true;
    engine.tierTimeoutMs = 150;
    engine.isNativeAiAvailable = true;
    engine._nativeLmFactory = { create: () => new Promise(() => { /* simulates a stalled native session */ }) };
    engine.pipeline = null; // no WASM tier configured — proves Tier A itself unblocks, not a WASM fallback race

    const start = Date.now();
    const result = await Promise.race([
      engine.extractGraph('another failure scenario'),
      new Promise((resolve) => setTimeout(() => resolve('OUTER_GUARD_TIMEOUT'), 3000)),
    ]);
    const elapsed = Date.now() - start;

    assert.notEqual(result, 'OUTER_GUARD_TIMEOUT', 'extractGraph() must not hang past its own tier timeout');
    assert.equal(result.status, 'heuristic-extracted');
    assert.ok(elapsed < 3000, `expected the bounded timeout (150ms) to win the race, took ${elapsed}ms`);
  });

  test('a fast, well-behaved pipeline is unaffected by the timeout wrapper', async () => {
    const engine = new WebLlmEngine({});
    engine.isReady = true;
    engine.tierTimeoutMs = 150;
    engine.pipeline = async () => [{
      generated_text: '```json\n{"nodes":[{"id":"n1","label":"x","type":"Idea"}],"edges":[]}\n```',
    }];

    const result = await engine.extractGraph('quick prompt');
    assert.equal(result.status, 'browser-extracted');
    assert.equal(result.nodes.length, 1);
  });
});
