// #476: SHIELD receipt v1 (canonical JSON, HMAC signature, digest, strict parse).

import { strict as assert } from 'assert';
import * as crypto from 'crypto';
import {
  canonicalJson, parseShieldReceipt, receiptDigest, signShieldReceipt, verifyShieldReceiptSignature,
  type ShieldReceipt, type ShieldReceiptBody,
} from '../../../integrations/shield-receipts/shield-receipt';

const KEY = Buffer.alloc(32, 9);
const BODY: ShieldReceiptBody = {
  schema: 'failsafe.shield-receipt/v1', apiHost: 'api.github.com', repo: 'acme/failsafe',
  commitSha: 'a'.repeat(40), sessionId: '2026-10-15T0230-8e09f0', qorVersion: '0.176.1',
  audit: { verdict: 'PASS', riskGrade: 'L3', target: 'plan-v607-rc1.md', payloadSha256: 'b'.repeat(64) },
  substantiate: { verdict: 'PASS', planPath: 'plan-v607-rc1.md', payloadSha256: 'c'.repeat(64), merkleSeal: 'd'.repeat(64), ledgerEntry: 644 },
  issuedAt: '2026-10-15T05:00:00.000Z', alg: 'HMAC-SHA256',
};

function withField(path: string[], value: unknown): ShieldReceiptBody {
  const copy = JSON.parse(JSON.stringify(BODY));
  let o = copy;
  for (const k of path.slice(0, -1)) o = o[k];
  o[path[path.length - 1]] = value;
  return copy;
}

suite('shield-receipt (#476)', () => {
  test('canonicalJson is key-order independent and has no whitespace', () => {
    const a = canonicalJson({ b: 1, a: { d: 'x y', c: [1, 2] } });
    const b = canonicalJson({ a: { c: [1, 2], d: 'x y' }, b: 1 });
    assert.equal(a, b);
    assert.equal(a, '{"a":{"c":[1,2],"d":"x y"},"b":1}');
  });

  test('canonicalJson refuses non-finite numbers, undefined and non-plain objects', () => {
    assert.throws(() => canonicalJson({ a: NaN }));
    assert.throws(() => canonicalJson({ a: Infinity }));
    assert.throws(() => canonicalJson({ a: undefined }));
    assert.throws(() => canonicalJson({ a: new Date(0) }));
  });

  test('sign then verify succeeds', () => {
    assert.equal(verifyShieldReceiptSignature(signShieldReceipt(BODY, KEY), KEY), true);
    assert.equal(verifyShieldReceiptSignature(signShieldReceipt(BODY, KEY), Buffer.alloc(32, 8)), false);
  });

  const FIELDS: Array<[string[], unknown]> = [
    [['schema'], 'failsafe.shield-receipt/v2'], [['apiHost'], 'ghe.acme.com'], [['repo'], 'acme/other'],
    [['commitSha'], 'e'.repeat(40)], [['sessionId'], 'other'], [['qorVersion'], '0.175.0'],
    [['audit', 'verdict'], 'VETO'], [['audit', 'riskGrade'], 'L1'], [['audit', 'target'], 'x.md'],
    [['audit', 'payloadSha256'], 'f'.repeat(64)], [['substantiate', 'verdict'], 'VETO'],
    [['substantiate', 'planPath'], 'x.md'], [['substantiate', 'payloadSha256'], 'f'.repeat(64)],
    [['substantiate', 'merkleSeal'], 'f'.repeat(64)], [['substantiate', 'ledgerEntry'], 645],
    [['issuedAt'], '2026-10-15T05:00:01.000Z'], [['alg'], 'HMAC-SHA512'],
  ];
  for (const [p, v] of FIELDS) {
    test(`changing signed field ${p.join('.')} fails verification`, () => {
      const signed = signShieldReceipt(BODY, KEY);
      const tampered = { ...withField(p, v), sig: signed.sig } as ShieldReceipt;
      assert.equal(verifyShieldReceiptSignature(tampered, KEY), false);
    });
  }

  for (const [label, sig] of [['63 characters', 'a'.repeat(63)], ['uppercase hex', 'A'.repeat(64)], ['non-hex', 'z'.repeat(64)]]) {
    test(`a sig of ${label} fails without throwing`, () => {
      assert.equal(verifyShieldReceiptSignature({ ...BODY, sig } as ShieldReceipt, KEY), false);
    });
  }

  test('parseShieldReceipt round-trips a signed receipt', () => {
    const signed = signShieldReceipt(BODY, KEY);
    assert.deepEqual(parseShieldReceipt(JSON.stringify(signed)), signed);
  });

  const BAD: Array<[string, () => unknown]> = [
    ['an extra field', () => ({ ...signShieldReceipt(BODY, KEY), extra: 1 })],
    ['an extra nested field', () => ({ ...signShieldReceipt(withField(['audit', 'extra'], 1), KEY) })],
    ['a missing field', () => { const r: Record<string, unknown> = { ...signShieldReceipt(BODY, KEY) }; delete r.repo; return r; }],
    ['a 39-character commitSha', () => signShieldReceipt(withField(['commitSha'], 'a'.repeat(39)), KEY)],
    ['an uppercase SHA', () => signShieldReceipt(withField(['commitSha'], 'A'.repeat(40)), KEY)],
    ['riskGrade 7', () => signShieldReceipt(withField(['audit', 'riskGrade'], 7), KEY)],
    ['ledgerEntry 0', () => signShieldReceipt(withField(['substantiate', 'ledgerEntry'], 0), KEY)],
    ['an uppercase repo', () => signShieldReceipt(withField(['repo'], 'Acme/Failsafe'), KEY)],
  ];
  for (const [label, make] of BAD) {
    test(`parseShieldReceipt returns null for ${label}`, () => {
      assert.equal(parseShieldReceipt(JSON.stringify(make())), null);
    });
  }
  test('parseShieldReceipt returns null for non-JSON and arrays', () => {
    assert.equal(parseShieldReceipt('nope'), null);
    assert.equal(parseShieldReceipt('[]'), null);
  });

  test('receiptDigest is sha256 of canonicalJson of the full receipt and tracks sig', () => {
    const signed = signShieldReceipt(BODY, KEY);
    const expected = crypto.createHash('sha256').update(canonicalJson(signed), 'utf8').digest('hex');
    assert.equal(receiptDigest(signed), expected);
    assert.notEqual(receiptDigest({ ...signed, sig: 'f'.repeat(64) }), expected);
  });
});
