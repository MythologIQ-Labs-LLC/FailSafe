// #473 LD4/LD5/LD7/LD8/LD10: version-aware verification of soa_ledger rows,
// pinned by bytes from the real v6.0.5 and v6.0.6 writers.

import { strict as assert } from 'assert';
import Database from 'better-sqlite3';
import { AUDIT_COLUMNS, SoaLedgerRow } from '../../qorelogic/ledger/LedgerSeal';
import { verifyRows } from '../../qorelogic/ledger/LedgerVerifier';
import { activate, readAllRows } from '../../qorelogic/ledger/LedgerWriter';
import { GOLDEN, makeEnv, writeGoldenLedger } from './ledgerTestKit';

const goldenRows = (): SoaLedgerRow[] => GOLDEN.rows.map((r) => ({ ...r }));
const codes = (rows: SoaLedgerRow[]) => verifyRows(rows, GOLDEN.ledgerSecret).failures.map((f) => f.code);

async function activatedGolden(): Promise<SoaLedgerRow[]> {
  const env = makeEnv();
  try {
    await writeGoldenLedger(env.ledgerPath);
    const db = new Database(env.ledgerPath);
    try {
      const result = activate(db, GOLDEN.ledgerSecret, null);
      assert.equal(result.status, 'activated');
      return readAllRows(db);
    } finally { db.close(); }
  } finally { env.cleanup(); }
}

suite('LedgerVerifier (#473)', () => {
  test('golden legacy ledger from the real writers verifies, 3 v1 + 2 v2, partial (no receipt)', () => {
    assert.match(GOLDEN.producedBy.v1, /35a4eaabcb35665b1acf60bf2dcfc31a1ce84a33/);
    assert.match(GOLDEN.producedBy.v2, /d8f34eb808b5e45558295cf8f4e44bda0f3615e5/);
    const report = verifyRows(goldenRows(), GOLDEN.ledgerSecret);
    assert.deepEqual(report.failures, []);
    assert.equal(report.ok, true);
    assert.deepEqual(
      { v1: report.coverage.v1Rows, v2: report.coverage.v2Rows, v3: report.coverage.v3Rows },
      { v1: 3, v2: 2, v3: 0 },
    );
    assert.equal(report.sealScope, 'partial');
  });

  test('honest limit: a v1 verdict edit is invisible without a receipt, and caught after activation', async () => {
    const plain = goldenRows();
    plain[1].verification_result = 'PASS';
    assert.equal(verifyRows(plain, GOLDEN.ledgerSecret).ok, true, 'v1 rows do not seal verification_result');

    const activated = await activatedGolden();
    assert.equal(verifyRows(activated, GOLDEN.ledgerSecret).sealScope, 'frozen-legacy');
    activated[1].verification_result = 'PASS';
    assert.ok(codes(activated).includes('legacy-digest-mismatch'));
  });

  test('an unknown signature version fails as unknown-version, not as a v1 hash mismatch', () => {
    const rows = goldenRows();
    rows[3].signature = 'v9:' + rows[3].signature.slice(3);
    assert.deepEqual(codes(rows), ['unknown-version']);
  });

  test('genesis, duplicate, column and receipt structure failures', async () => {
    assert.deepEqual(codes([]), ['empty-ledger']);

    const headless = goldenRows().slice(1);
    assert.ok(codes(headless).includes('genesis-invalid'));

    const nullable = AUDIT_COLUMNS.filter((c) => c !== 'gdpr_trigger');
    assert.equal(nullable.length, 10);
    for (const column of nullable) {
      const rows = goldenRows() as unknown as Record<string, unknown>[];
      rows[0][column] = column === 'agent_trust_at_action' || column === 'sentinel_confidence' ? 1 : 'forged';
      assert.deepEqual(codes(rows as unknown as SoaLedgerRow[]), ['genesis-audit-columns'], column);
    }
    for (const gdpr of [1, null]) {
      const rows = goldenRows();
      rows[0].gdpr_trigger = gdpr;
      assert.deepEqual(codes(rows), ['genesis-audit-columns'], `gdpr_trigger ${gdpr}`);
    }

    const duplicated = goldenRows();
    duplicated.push({ ...duplicated[4], id: 6, prev_hash: duplicated[4].entry_hash });
    assert.ok(codes(duplicated).includes('duplicate-entry'));

    const extra = goldenRows() as unknown as Record<string, unknown>[];
    extra[2].unsealed_note = 'x';
    assert.ok(codes(extra as unknown as SoaLedgerRow[]).includes('unsealed-column'));

    const twice = await activatedGolden();
    const receipt = twice[twice.length - 1];
    twice.push({ ...receipt, id: receipt.id + 1, prev_hash: receipt.entry_hash, entry_hash: 'f'.repeat(64) });
    assert.ok(codes(twice).includes('duplicate-receipt'));
  });
});
