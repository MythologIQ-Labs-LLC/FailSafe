// #476: the TypeScript mirror of qor-logic gate_provenance (sign, payload_digest,
// sidecar verification). The golden vector was computed by the installed
// qor-logic 0.176.1 Python implementation.

import { strict as assert } from 'assert';
import {
  normalizeLf, qorPayloadDigest, qorSign, verifyQorArtifact,
} from '../../../integrations/shield-receipts/qor-provenance';

const GOLDEN_KEY = Buffer.alloc(32, 1);
const GOLDEN_DATA = Buffer.from('{"a":1}\r\n');
const GOLDEN_TAG = '944fd9e5e2eda0c93e9cfbcedef542719321fcf2ec9a8b744c3d85bc847add07';
const GOLDEN_DIGEST = 'e346432021b04179518d9614f3560ccd71354a4ee101ddcb893d6959a9d6301c';
const KEY = Buffer.alloc(32, 7);
const EXPECT = { sessionId: 's1', phase: 'audit' };

function sidecar(raw: Buffer, over: Record<string, unknown> = {}, key = KEY): string {
  return JSON.stringify({
    alg: 'HMAC-SHA256', session_id: 's1', phase: 'audit',
    payload_sha256: qorPayloadDigest(raw), hmac_tag: qorSign('audit', 's1', raw, key), ...over,
  });
}

suite('qor-provenance (#476)', () => {
  test('golden vector matches qor-logic gate_provenance', () => {
    assert.equal(qorSign('audit', 's1', GOLDEN_DATA, GOLDEN_KEY), GOLDEN_TAG);
    assert.equal(qorPayloadDigest(GOLDEN_DATA), GOLDEN_DIGEST);
  });

  test('normalizeLf turns CRLF into LF only', () => {
    assert.equal(normalizeLf(Buffer.from('a\r\nb\rc\n')).toString(), 'a\nb\rc\n');
  });

  test('the same artifact verifies with CRLF and with LF', () => {
    const lf = Buffer.from('{\n  "verdict": "PASS"\n}\n');
    const crlf = Buffer.from('{\r\n  "verdict": "PASS"\r\n}\r\n');
    const side = sidecar(lf);
    assert.deepEqual(verifyQorArtifact(lf, side, EXPECT, KEY), { kind: 'ok', payloadSha256: qorPayloadDigest(lf) });
    assert.equal(verifyQorArtifact(crlf, side, EXPECT, KEY).kind, 'ok');
  });

  test('one flipped byte is a payload failure', () => {
    const raw = Buffer.from('{"verdict":"PASS"}');
    const side = sidecar(raw);
    const flipped = Buffer.from(raw); flipped[3] ^= 1;
    assert.equal(verifyQorArtifact(flipped, side, EXPECT, KEY).kind, 'payload');
  });

  const raw = Buffer.from('{"verdict":"PASS"}');
  const INVALID: Array<[string, string]> = [
    ['plan sidecar replayed as audit', sidecar(raw, { phase: 'plan' })],
    ['different session_id', sidecar(raw, { session_id: 's2' })],
    ["alg 'none'", sidecar(raw, { alg: 'none' })],
    ['63-character tag', sidecar(raw, { hmac_tag: 'a'.repeat(63) })],
    ['uppercase digest', sidecar(raw, { payload_sha256: qorPayloadDigest(raw).toUpperCase() })],
    ['not JSON', 'not json'],
    ['an array', '[]'],
  ];
  for (const [label, side] of INVALID) {
    test(`sidecar-invalid: ${label}`, () => {
      assert.equal(verifyQorArtifact(raw, side, EXPECT, KEY).kind, 'sidecar-invalid');
    });
  }

  test('a tag made with another key is an hmac failure; no key is key-absent', () => {
    const side = sidecar(raw, {}, Buffer.alloc(32, 8));
    assert.equal(verifyQorArtifact(raw, side, EXPECT, KEY).kind, 'hmac');
    assert.equal(verifyQorArtifact(raw, side, EXPECT, undefined).kind, 'key-absent');
  });

  test('a wrong digest is a payload failure even with no key', () => {
    const side = sidecar(raw, { payload_sha256: 'f'.repeat(64) });
    assert.equal(verifyQorArtifact(raw, side, EXPECT, undefined).kind, 'payload');
  });
});
