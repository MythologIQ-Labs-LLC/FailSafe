// Functional tests for the sentinel-mode value leaf (B-EM-1, FX584).
// Pure function — no DOM, no imports. Sink: returned string value.
//
// SentinelMode = "heuristic" | "llm-assisted" | "hybrid"
// (src/shared/types/sentinel.ts:13). The corrected fallback is 'heuristic';
// the prior '|| observe' fallback was a category error ('observe' is a
// GovernanceMode, never a SentinelMode).

import { strict as assert } from 'assert';
// @ts-expect-error JS module import in TS test context
import { sentinelModeValue } from '../../../src/roadmap/ui/modules/sentinel-mode.js';

suite('sentinel-mode leaf (FX584)', () => {
  test('FX584.1 sentinelModeValue("hybrid") returns "hybrid"', () => {
    assert.equal(sentinelModeValue('hybrid'), 'hybrid');
  });

  test('FX584.2 sentinelModeValue(undefined) returns "heuristic" (never "observe")', () => {
    const out = sentinelModeValue(undefined);
    assert.equal(out, 'heuristic');
    assert.notEqual(out, 'observe');
  });

  test('FX584.3 sentinelModeValue("llm-assisted") returns "llm-assisted"', () => {
    assert.equal(sentinelModeValue('llm-assisted'), 'llm-assisted');
  });
});
