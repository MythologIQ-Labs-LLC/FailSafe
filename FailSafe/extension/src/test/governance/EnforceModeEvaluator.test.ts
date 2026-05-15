// Functional tests for EnforceModeEvaluator (extension of FX244 mode coverage).

import { strict as assert } from 'assert';
import { evaluateEnforceMode } from '../../governance/enforcement/EnforceModeEvaluator';
import { Logger } from '../../shared/Logger';

function makeAxiom(verdict: any): any {
  return { enforce: () => verdict };
}
const ALLOW = { status: 'ALLOW' as const };
const BLOCK = { status: 'BLOCK' as const, reason: 'blocked', violation: 'AX-VIOLATION' };

const CTX = (overrides: any = {}) => ({
  activeIntent: { id: 'intent-1', scope: { files: [] }, status: 'PASS' },
  action: { type: 'write', targetPath: 'src/x.ts' },
  ...overrides,
});

suite('EnforceModeEvaluator (FX244 EnforceMode)', () => {
  test('FX244 enforce — featureGate disabled → ALLOW with fallback message', () => {
    const r = evaluateEnforceMode(CTX(), {
      axiom1: makeAxiom(ALLOW), axiom2: makeAxiom(ALLOW), axiom3: makeAxiom(ALLOW),
      logger: new Logger('test'),
      featureGate: { isEnabled: () => false } as never,
    });
    assert.equal(r.status, 'ALLOW');
    assert.match(String(r.reason), /Lock-step.*not enabled/);
  });

  test('FX244 enforce — featureGate undefined → enforces normally (no fallback)', () => {
    const r = evaluateEnforceMode(CTX(), {
      axiom1: makeAxiom(ALLOW), axiom2: makeAxiom(ALLOW), axiom3: makeAxiom(ALLOW),
      logger: new Logger('test'),
      featureGate: undefined,
    });
    assert.equal(r.status, 'ALLOW');
    assert.match(String(r.reason), /within Intent.*intent-1.*scope/);
  });

  test('FX244 enforce — featureGate enabled + all 3 axioms pass → ALLOW', () => {
    const r = evaluateEnforceMode(CTX(), {
      axiom1: makeAxiom(ALLOW), axiom2: makeAxiom(ALLOW), axiom3: makeAxiom(ALLOW),
      logger: new Logger('test'),
      featureGate: { isEnabled: () => true } as never,
    });
    assert.equal(r.status, 'ALLOW');
  });

  test('FX244 enforce — axiom1 BLOCK short-circuits before axiom3 + axiom2', () => {
    let axiom2Called = 0, axiom3Called = 0;
    const ax2 = { enforce: () => { axiom2Called++; return ALLOW; } };
    const ax3 = { enforce: () => { axiom3Called++; return ALLOW; } };
    const r = evaluateEnforceMode(CTX(), {
      axiom1: makeAxiom(BLOCK), axiom2: ax2 as never, axiom3: ax3 as never,
      logger: new Logger('test'),
      featureGate: { isEnabled: () => true } as never,
    });
    assert.equal(r.status, 'BLOCK');
    assert.equal(axiom2Called, 0);
    assert.equal(axiom3Called, 0);
  });

  test('FX244 enforce — axiom3 BLOCK short-circuits before axiom2', () => {
    let axiom2Called = 0;
    const ax2 = { enforce: () => { axiom2Called++; return ALLOW; } };
    const r = evaluateEnforceMode(CTX(), {
      axiom1: makeAxiom(ALLOW), axiom2: ax2 as never, axiom3: makeAxiom(BLOCK),
      logger: new Logger('test'),
      featureGate: { isEnabled: () => true } as never,
    });
    assert.equal(r.status, 'BLOCK');
    assert.equal(axiom2Called, 0, 'axiom2 should NOT be called when axiom3 blocks');
  });

  test('FX244 enforce — axiom2 BLOCK after axiom1 + axiom3 pass returns BLOCK', () => {
    const r = evaluateEnforceMode(CTX(), {
      axiom1: makeAxiom(ALLOW), axiom2: makeAxiom(BLOCK), axiom3: makeAxiom(ALLOW),
      logger: new Logger('test'),
      featureGate: { isEnabled: () => true } as never,
    });
    assert.equal(r.status, 'BLOCK');
  });

  test('FX244 enforce — axiom evaluation order is 1 → 3 → 2', () => {
    const order: string[] = [];
    const ax1 = { enforce: () => { order.push('1'); return ALLOW; } };
    const ax2 = { enforce: () => { order.push('2'); return ALLOW; } };
    const ax3 = { enforce: () => { order.push('3'); return ALLOW; } };
    evaluateEnforceMode(CTX(), {
      axiom1: ax1 as never, axiom2: ax2 as never, axiom3: ax3 as never,
      logger: new Logger('test'),
      featureGate: { isEnabled: () => true } as never,
    });
    assert.deepEqual(order, ['1', '3', '2']);
  });

  test('FX244 enforce — populates intentId on ALLOW verdict', () => {
    const r = evaluateEnforceMode(CTX(), {
      axiom1: makeAxiom(ALLOW), axiom2: makeAxiom(ALLOW), axiom3: makeAxiom(ALLOW),
      logger: new Logger('test'),
      featureGate: { isEnabled: () => true } as never,
    });
    assert.equal((r as any).intentId, 'intent-1');
  });
});
