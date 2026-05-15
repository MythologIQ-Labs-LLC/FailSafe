// Functional tests for PolicySandbox (FX296).

import { strict as assert } from 'assert';
import { PolicySandbox } from '../../governance/PolicySandbox';

suite('PolicySandbox (FX296)', () => {
  test('FX296 dryRun — empty sandbox returns empty array', () => {
    const s = new PolicySandbox();
    assert.deepEqual(s.dryRun({}), []);
  });

  test('FX296 dryRun — every rule returns one result with matched flag', () => {
    const s = new PolicySandbox();
    s.addRule({ id: 'r1', condition: (c) => c.flag === true, action: 'block' });
    s.addRule({ id: 'r2', condition: () => true, action: 'allow' });
    const out = s.dryRun({ flag: true });
    assert.equal(out.length, 2);
    assert.deepEqual(out[0], { ruleId: 'r1', action: 'block', matched: true });
    assert.deepEqual(out[1], { ruleId: 'r2', action: 'allow', matched: true });
  });

  test('FX296 dryRun — rule conditions are evaluated against the supplied context', () => {
    const s = new PolicySandbox();
    s.addRule({ id: 'r1', condition: (c) => c.risk === 'L3', action: 'escalate' });
    assert.equal(s.dryRun({ risk: 'L1' })[0].matched, false);
    assert.equal(s.dryRun({ risk: 'L3' })[0].matched, true);
  });

  test('FX296 getEffectiveAction — empty sandbox returns "allow" by default', () => {
    const s = new PolicySandbox();
    assert.equal(s.getEffectiveAction({}), 'allow');
  });

  test('FX296 getEffectiveAction — first matching rule wins (short-circuit)', () => {
    const s = new PolicySandbox();
    s.addRule({ id: 'first', condition: () => true, action: 'block' });
    s.addRule({ id: 'second', condition: () => true, action: 'allow' });
    assert.equal(s.getEffectiveAction({}), 'block');
  });

  test('FX296 getEffectiveAction — non-matching rules do not affect outcome', () => {
    const s = new PolicySandbox();
    s.addRule({ id: 'r1', condition: (c) => c.foo === 'bar', action: 'block' });
    s.addRule({ id: 'r2', condition: (c) => c.qux === 'baz', action: 'escalate' });
    assert.equal(s.getEffectiveAction({ unrelated: true }), 'allow');
    assert.equal(s.getEffectiveAction({ foo: 'bar' }), 'block');
    assert.equal(s.getEffectiveAction({ qux: 'baz' }), 'escalate');
  });

  test('FX296 addRule — rules are evaluated in insertion order', () => {
    const s = new PolicySandbox();
    s.addRule({ id: 'r1', condition: (c) => !!c.flag, action: 'allow' });
    s.addRule({ id: 'r2', condition: (c) => !!c.flag, action: 'block' });
    assert.equal(s.getEffectiveAction({ flag: true }), 'allow', 'first inserted rule wins');
  });
});
