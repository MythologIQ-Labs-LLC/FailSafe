// Functional tests for DEFAULT_PATTERNS heuristic catalog (FX348).

import { strict as assert } from 'assert';
import { DEFAULT_PATTERNS } from '../../sentinel/patterns/heuristics';

suite('Default heuristic patterns (FX348)', () => {
  test('FX348 — DEFAULT_PATTERNS array has all required pattern shape fields', () => {
    assert.ok(DEFAULT_PATTERNS.length >= 7);
    for (const p of DEFAULT_PATTERNS) {
      assert.ok(typeof p.id === 'string' && p.id.length > 0);
      assert.ok(typeof p.name === 'string');
      assert.ok(typeof p.category === 'string');
      assert.ok(['critical', 'high', 'medium', 'low'].includes(p.severity));
      assert.ok(typeof p.pattern === 'string');
      assert.ok(typeof p.enabled === 'boolean');
    }
  });

  test('FX348 INJ001 SQL Injection — matches concatenation in execute/query/raw', () => {
    const p = DEFAULT_PATTERNS.find(x => x.id === 'INJ001')!;
    assert.equal(p.severity, 'critical');
    assert.equal(p.cwe, 'CWE-89');
    const re = new RegExp(p.pattern, 'i');
    assert.match('db.execute("SELECT * FROM x WHERE id = " + userId)', re);
    assert.match('conn.query("UPDATE " + table + " SET")', re);
  });

  test('FX348 INJ002 Command Injection — matches exec/spawn/system with template literal', () => {
    const p = DEFAULT_PATTERNS.find(x => x.id === 'INJ002')!;
    assert.equal(p.severity, 'critical');
    assert.equal(p.cwe, 'CWE-78');
    const re = new RegExp(p.pattern, 'i');
    assert.match('exec(`ls ${userInput}`)', re);
    assert.match('spawn(`echo ${cmd}`)', re);
  });

  test('FX348 SEC001 Hardcoded API Key — matches api_key with long literal', () => {
    const p = DEFAULT_PATTERNS.find(x => x.id === 'SEC001')!;
    assert.equal(p.severity, 'critical');
    assert.equal(p.cwe, 'CWE-798');
    const re = new RegExp(p.pattern, 'i');
    assert.match('const api_key = "sk1234567890abcdefghijK"', re);
    assert.match('API_KEY = "ABCDEF0123456789ABCDEFGHIJ"', re);
  });

  test('FX348 SEC002 Hardcoded Password — matches password with 8+ chars literal', () => {
    const p = DEFAULT_PATTERNS.find(x => x.id === 'SEC002')!;
    assert.equal(p.severity, 'critical');
    const re = new RegExp(p.pattern, 'i');
    assert.match('password = "supersecret123"', re);
    assert.match('passwd:"longerThan8"', re);
  });

  test('FX348 PII001 SSN — matches NNN-NN-NNNN format', () => {
    const p = DEFAULT_PATTERNS.find(x => x.id === 'PII001')!;
    assert.equal(p.severity, 'high');
    const re = new RegExp(p.pattern, 'i');
    assert.match('SSN: 123-45-6789', re);
  });

  test('FX348 PII002 Credit Card — matches Visa/MC/Amex patterns', () => {
    const p = DEFAULT_PATTERNS.find(x => x.id === 'PII002')!;
    const re = new RegExp(p.pattern, 'i');
    // Visa (4xxx)
    assert.match('card: 4532015112830366', re);
    // Mastercard (51-55)
    assert.match('card: 5425233430109903', re);
    // Amex (34/37)
    assert.match('card: 374245455400126', re);
  });

  test('FX348 CMP001_HEURISTIC — flags deeply nested braces (declared as ReDoS-prone catalog entry)', () => {
    const p = DEFAULT_PATTERNS.find(x => x.id === 'CMP001_HEURISTIC')!;
    assert.equal(p.severity, 'medium');
    assert.equal(p.category, 'complexity');
    // The pattern itself has nested quantifier shape; PatternLoader catches ReDoS-prone ones.
    // Validate shape only — actual matching tested via integration.
    assert.ok(typeof p.pattern === 'string');
  });

  test('FX348 every pattern has remediation guidance + falsePositiveRate', () => {
    for (const p of DEFAULT_PATTERNS) {
      assert.ok(typeof p.remediation === 'string' && p.remediation.length > 0, `${p.id} missing remediation`);
      assert.ok(typeof p.falsePositiveRate === 'number' && p.falsePositiveRate >= 0 && p.falsePositiveRate <= 1, `${p.id} bad falsePositiveRate`);
    }
  });

  test('FX348 — all pattern IDs are unique', () => {
    const ids = DEFAULT_PATTERNS.map(p => p.id);
    const uniq = new Set(ids);
    assert.equal(uniq.size, ids.length);
  });

  test('FX348 — categories restricted to known set', () => {
    const knownCategories = new Set(['injection', 'secrets', 'pii', 'complexity']);
    for (const p of DEFAULT_PATTERNS) {
      assert.ok(knownCategories.has(p.category), `${p.id} has unexpected category ${p.category}`);
    }
  });
});
