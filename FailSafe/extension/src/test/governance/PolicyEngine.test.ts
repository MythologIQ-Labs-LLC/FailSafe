// Functional tests for PolicyEngine (FX297).

import { strict as assert } from 'assert';
import { PolicyEngine } from '../../qorelogic/policies/PolicyEngine';

function makeConfigProvider(workspaceRoot?: string): any {
  return {
    getWorkspaceRoot: () => workspaceRoot,
    getConfig: () => ({}),
  };
}

suite('PolicyEngine (FX297)', () => {
  test('FX297 classifyRisk — auth/password/crypto/payment in path → L3', () => {
    const e = new PolicyEngine(makeConfigProvider());
    assert.equal(e.classifyRisk('src/auth/login.ts'), 'L3');
    assert.equal(e.classifyRisk('src/payment/billing.ts'), 'L3');
    assert.equal(e.classifyRisk('src/crypto/encrypt.ts'), 'L3');
    assert.equal(e.classifyRisk('src/admin/secret.ts'), 'L3');
  });

  test('FX297 classifyRisk — content trigger CREATE TABLE → L3', () => {
    const e = new PolicyEngine(makeConfigProvider());
    assert.equal(e.classifyRisk('src/foo.ts', 'CREATE TABLE users(...)'), 'L3');
    assert.equal(e.classifyRisk('src/foo.ts', 'authenticate(user)'), 'L3');
  });

  test('FX297 classifyRisk — component/util/helper/service → L2', () => {
    const e = new PolicyEngine(makeConfigProvider());
    assert.equal(e.classifyRisk('src/components/Button.tsx'), 'L2');
    assert.equal(e.classifyRisk('src/utils/format.ts'), 'L2');
    assert.equal(e.classifyRisk('src/services/api.ts'), 'L2');
  });

  test('FX297 classifyRisk — content trigger function/class → L2', () => {
    const e = new PolicyEngine(makeConfigProvider());
    assert.equal(e.classifyRisk('src/random.ts', 'function foo() {}'), 'L2');
    assert.equal(e.classifyRisk('src/random.ts', 'class Bar {}'), 'L2');
  });

  test('FX297 classifyRisk — .md/.txt/test/spec → L1', () => {
    const e = new PolicyEngine(makeConfigProvider());
    assert.equal(e.classifyRisk('README.md'), 'L1');
    assert.equal(e.classifyRisk('docs/notes.txt'), 'L1');
    assert.equal(e.classifyRisk('src/foo.test.ts'), 'L1');
    assert.equal(e.classifyRisk('src/foo.spec.ts'), 'L1');
  });

  test('FX297 classifyRisk — generic code file with no triggers → L2 default', () => {
    const e = new PolicyEngine(makeConfigProvider());
    assert.equal(e.classifyRisk('src/random.ts'), 'L2');
  });

  test('FX297 classifyRisk — L3 takes precedence over L2', () => {
    const e = new PolicyEngine(makeConfigProvider());
    // 'service' (L2) + 'auth' (L3) — L3 wins
    assert.equal(e.classifyRisk('src/services/auth.ts'), 'L3');
  });

  test('FX297 getVerificationRequirements — L1 → autoApprove sentinel sampling', () => {
    const e = new PolicyEngine(makeConfigProvider());
    const r = e.getVerificationRequirements('L1');
    assert.equal(r.autoApprove, true);
    assert.equal(r.approvalAuthority, 'sentinel');
    assert.equal(r.verification, 'sampling_10_percent');
  });

  test('FX297 getVerificationRequirements — L2 → no autoApprove + full sentinel pass', () => {
    const e = new PolicyEngine(makeConfigProvider());
    const r = e.getVerificationRequirements('L2');
    assert.equal(r.autoApprove, false);
    assert.equal(r.approvalAuthority, 'sentinel');
    assert.equal(r.verification, 'full_sentinel_pass');
  });

  test('FX297 getVerificationRequirements — L3 → overseer + formal_plus_human', () => {
    const e = new PolicyEngine(makeConfigProvider());
    const r = e.getVerificationRequirements('L3');
    assert.equal(r.autoApprove, false);
    assert.equal(r.approvalAuthority, 'overseer');
    assert.equal(r.verification, 'formal_plus_human');
  });

  test('FX297 getVerificationRate — normal mode = 1.0 across all grades', () => {
    const e = new PolicyEngine(makeConfigProvider());
    e.setOperationalMode('normal');
    assert.equal(e.getVerificationRate('L1'), 1.0);
    assert.equal(e.getVerificationRate('L2'), 1.0);
    assert.equal(e.getVerificationRate('L3'), 1.0);
  });

  test('FX297 getVerificationRate — lean mode samples L1 at 10%', () => {
    const e = new PolicyEngine(makeConfigProvider());
    e.setOperationalMode('lean');
    assert.equal(e.getVerificationRate('L1'), 0.1);
    assert.equal(e.getVerificationRate('L2'), 1.0);
    assert.equal(e.getVerificationRate('L3'), 1.0);
  });

  test('FX297 getVerificationRate — surge mode defers L1 to 0', () => {
    const e = new PolicyEngine(makeConfigProvider());
    e.setOperationalMode('surge');
    assert.equal(e.getVerificationRate('L1'), 0);
    assert.equal(e.getVerificationRate('L2'), 1.0);
  });

  test('FX297 getVerificationRate — safe mode only L3 active', () => {
    const e = new PolicyEngine(makeConfigProvider());
    e.setOperationalMode('safe');
    assert.equal(e.getVerificationRate('L1'), 0);
    assert.equal(e.getVerificationRate('L2'), 0);
    assert.equal(e.getVerificationRate('L3'), 1.0);
  });

  test('FX297 calculateSCI — empty sources → hardRejection threshold (35)', () => {
    const e = new PolicyEngine(makeConfigProvider());
    assert.equal(e.calculateSCI([]), 35);
  });

  test('FX297 calculateSCI — T1 source (rfc/ieee/iso/arxiv) weights 100', () => {
    const e = new PolicyEngine(makeConfigProvider());
    assert.equal(e.calculateSCI(['rfc-1234']), 100);
    assert.equal(e.calculateSCI(['arxiv:1234']), 100);
  });

  test('FX297 calculateSCI — T2 source (owasp/docs) weights 90', () => {
    const e = new PolicyEngine(makeConfigProvider());
    assert.equal(e.calculateSCI(['owasp.org']), 90);
    assert.equal(e.calculateSCI(['docs.example.com']), 90);
  });

  test('FX297 calculateSCI — T3 (blog/medium/dev.to) weights 70', () => {
    const e = new PolicyEngine(makeConfigProvider());
    assert.equal(e.calculateSCI(['some-blog']), 70);
    assert.equal(e.calculateSCI(['medium.com/x']), 70);
  });

  test('FX297 calculateSCI — unknown source defaults to T4 = 45', () => {
    const e = new PolicyEngine(makeConfigProvider());
    assert.equal(e.calculateSCI(['random-website']), 45);
  });

  test('FX297 calculateSCI — multiple sources averaged', () => {
    const e = new PolicyEngine(makeConfigProvider());
    // T1 (100) + T4 (45) → avg 72.5
    assert.equal(e.calculateSCI(['rfc-1234', 'random-website']), 72.5);
  });

  test('FX297 getPolicyHash — deterministic + 16-char hex', () => {
    const e = new PolicyEngine(makeConfigProvider());
    const h1 = e.getPolicyHash();
    const h2 = e.getPolicyHash();
    assert.equal(h1, h2);
    assert.equal(h1.length, 16);
    assert.match(h1, /^[0-9a-f]{16}$/);
  });

  test('FX297 setOperationalMode + getOperationalMode round-trip', () => {
    const e = new PolicyEngine(makeConfigProvider());
    assert.equal(e.getOperationalMode(), 'normal');
    e.setOperationalMode('lean');
    assert.equal(e.getOperationalMode(), 'lean');
  });
});
