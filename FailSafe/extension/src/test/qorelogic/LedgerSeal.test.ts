// #473 LD1/LD4: v3 canonical seal over every data column, typed cells,
// domain-separated MAC, parsed (never inferred) versions.

import { strict as assert } from 'assert';
import * as crypto from 'crypto';
import {
  GENESIS_PREV_HASH, SoaLedgerRow, V3_COLUMNS, canonicalV3, parseSignature, sealV3, v3EntryHash,
} from '../../qorelogic/ledger/LedgerSeal';

const SECRET = 'b'.repeat(64);

function v3Row(): SoaLedgerRow {
  return {
    id: 7, timestamp: '2026-10-15T00:00:00.000Z', event_type: 'AUDIT_FAIL', agent_did: 'did:t:a',
    agent_trust_at_action: 0.4, model_version: 'm', artifact_path: 'src/a.ts', artifact_hash: 'sha256:aa',
    risk_grade: 'L3', verification_method: 'heuristic', verification_result: 'FAIL', sentinel_confidence: 0.9,
    overseer_did: 'did:t:o', overseer_decision: 'REJECTED', gdpr_trigger: 0, payload: '{"k":1}',
    entry_hash: '', prev_hash: GENESIS_PREV_HASH, signature: '', schema_version: 3, extension_version: '',
  };
}

function changed(value: unknown): unknown {
  if (typeof value === 'number') { return value + 1; }
  if (typeof value === 'string') { return value + 'x'; }
  return 'x';
}

suite('LedgerSeal (#473 LD1/LD4)', () => {
  test('changing any one of the 19 bound columns changes the v3 entry hash', () => {
    const base = v3EntryHash(v3Row());
    assert.equal(V3_COLUMNS.length, 19);
    for (const column of V3_COLUMNS) {
      const row = v3Row() as unknown as Record<string, unknown>;
      row[column] = changed(row[column]);
      assert.notEqual(v3EntryHash(row as unknown as SoaLedgerRow), base, `${column} must be bound by the v3 seal`);
    }
  });

  test('NULL, Infinity and -Infinity are three distinct cells', () => {
    const hashes = [null, Infinity, -Infinity].map((v) => v3EntryHash({ ...v3Row(), agent_trust_at_action: v as number | null }));
    assert.equal(new Set(hashes).size, 3);
  });

  test('the number 1 and the string 1 are distinct cells', () => {
    const asNumber = v3EntryHash({ ...v3Row(), schema_version: 1 });
    const asString = v3EntryHash({ ...v3Row(), schema_version: '1' as unknown as number });
    assert.notEqual(asNumber, asString);
  });

  test('undefined, bigint, boolean and plain objects are rejected, never coerced', () => {
    for (const bad of [undefined, BigInt(1), true, { a: 1 }]) {
      const row = { ...v3Row(), model_version: bad as unknown as string };
      assert.throws(() => canonicalV3(row), TypeError, `${typeof bad} must throw`);
    }
  });

  test('the v3 MAC differs from an HMAC over the bare entry hash', () => {
    const { entryHash, signature } = sealV3(v3Row(), SECRET);
    const bare = crypto.createHmac('sha256', SECRET).update(entryHash).digest('hex');
    assert.match(signature, /^v3:[0-9a-f]{64}$/);
    assert.notEqual(signature.slice(3), bare);
  });

  test('versions are parsed: v1 bare hex, v2:/v3: prefixes, anything else null', () => {
    const hex = 'a'.repeat(64);
    assert.equal(parseSignature(hex)?.version, 'v1');
    assert.equal(parseSignature(`v2:${hex}`)?.version, 'v2');
    assert.equal(parseSignature(`v3:${hex}`)?.version, 'v3');
    assert.equal(parseSignature(`v9:${hex}`), null);
    assert.equal(parseSignature(`V2:${hex}`), null);
    assert.equal(parseSignature(hex.toUpperCase()), null);
  });
});
